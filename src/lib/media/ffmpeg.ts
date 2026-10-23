import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";

function resolveFfmpeg(): string {
  const candidates = [
    process.env.FFMPEG_PATH,
    // When Next bundles the package, ffmpeg-static may return a virtual path.
    ffmpegStatic,
    join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
    "/usr/local/bin/ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
    "/usr/bin/ffmpeg",
    "ffmpeg",
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (candidate === "ffmpeg") return candidate;
    if (existsSync(candidate)) return candidate;
  }

  return "ffmpeg";
}

const FFMPEG_PATH = resolveFfmpeg();

type RunResult = { code: number | null; stderr: string };

/**
 * Menjalankan ffmpeg dan mengembalikan exit code + stderr.
 * `keepHead` dipakai untuk probe, karena header stream ada di awal output.
 */
function runFfmpegRaw(args: string[], keepHead = false): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ FFMPEG_PATH, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (keepHead) {
        if (stderr.length > 64000) stderr = stderr.slice(0, 64000);
      } else if (stderr.length > 8000) {
        stderr = stderr.slice(-8000);
      }
    });

    child.on("error", (error) => {
      reject(
        new Error(
          `Tidak bisa menjalankan ffmpeg (${FFMPEG_PATH}): ${error.message}. ` +
            "Set FFMPEG_PATH ke binary ffmpeg yang tersedia."
        )
      );
    });
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

async function runFfmpeg(args: string[]): Promise<void> {
  const { code, stderr } = await runFfmpegRaw(args);
  if (code !== 0) {
    throw new Error(`ffmpeg gagal (exit ${code}): ${stderr.trim().slice(-600)}`);
  }
}

type MediaInfo = {
  duration: number;
  fps: number;
  hasAudio: boolean;
};

function parseDuration(stderr: string): number {
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function parseFps(stderr: string): number {
  const videoLine = stderr.split("\n").find((line) => line.includes("Video:"));
  const match = videoLine ? /([\d.]+)\s*fps/.exec(videoLine) : null;
  return match ? Number(match[1]) : 0;
}

function parseHasAudio(stderr: string): boolean {
  return stderr
    .split("\n")
    .some((line) => line.includes("Stream #") && line.includes("Audio:"));
}

/** Probe metadata tanpa output; ffmpeg sengaja exit != 0 dan info dibaca dari stderr. */
async function probeMedia(path: string): Promise<MediaInfo> {
  const { stderr } = await runFfmpegRaw(["-hide_banner", "-i", path], true);
  return {
    duration: parseDuration(stderr),
    fps: parseFps(stderr),
    hasAudio: parseHasAudio(stderr),
  };
}

/**
 * FPS hasil akhir mengikuti fps asli klip (24/25/30) supaya tidak ada frame
 * duplikat yang bikin gerakan judder. Fps sangat rendah dinaikkan ke 24.
 */
function targetFps(fps: number): number {
  if (!Number.isFinite(fps) || fps <= 0) return 30;
  return Math.min(60, Math.max(24, Math.round(fps)));
}

/** Durasi crossfade antar klip. Set 0 untuk kembali ke hard cut. */
function crossfadeSeconds(): number {
  const raw = process.env.VIDEO_CROSSFADE_SECONDS;
  const value = raw === undefined || raw.trim() === "" ? 0.4 : Number(raw);
  if (!Number.isFinite(value)) return 0.4;
  return Math.min(1.5, Math.max(0, value));
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Gagal mengunduh klip (${response.status}).`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function normalizeClip(input: {
  source: string;
  target: string;
  width: number;
  height: number;
  fps: number;
  withAudio: boolean;
  sourceHasAudio: boolean;
}) {
  const args = ["-y", "-loglevel", "error", "-i", input.source];

  if (input.withAudio && !input.sourceHasAudio) {
    args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
  }

  args.push(
    "-vf",
    `scale=${input.width}:${input.height}:force_original_aspect_ratio=decrease,pad=${input.width}:${input.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${input.fps}`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p"
  );

  if (input.withAudio) {
    args.push(
      "-map",
      "0:v:0",
      "-map",
      input.sourceHasAudio ? "0:a:0" : "1:a:0",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-ac",
      "2"
    );

    // anullsrc tidak terbatas; hentikan saat video selesai.
    if (!input.sourceHasAudio) {
      args.push("-shortest");
    }
  } else {
    args.push("-an");
  }

  args.push(input.target);
  await runFfmpeg(args);
}

/**
 * Crossfade video + audio antar klip supaya perpindahan tidak terasa seperti
 * hard cut. Semua input sudah dinormalisasi (ukuran, fps, audio) sebelumnya.
 */
async function crossfadeClips(input: {
  files: string[];
  durations: number[];
  fps: number;
  fade: number;
  withAudio: boolean;
  output: string;
}) {
  const args = ["-y", "-loglevel", "error"];
  for (const file of input.files) {
    args.push("-i", file);
  }

  const filters: string[] = [];
  let video = "[0:v]";
  let audio = "[0:a]";
  let offset = 0;

  for (let index = 1; index < input.files.length; index += 1) {
    offset += input.durations[index - 1] - input.fade;
    const videoOut = `[v${index}]`;
    filters.push(
      `${video}[${index}:v]xfade=transition=fade:duration=${input.fade}:offset=${offset.toFixed(3)}${videoOut}`
    );
    video = videoOut;

    if (input.withAudio) {
      const audioOut = `[a${index}]`;
      filters.push(`${audio}[${index}:a]acrossfade=d=${input.fade}:c1=tri:c2=tri${audioOut}`);
      audio = audioOut;
    }
  }

  args.push("-filter_complex", filters.join(";"), "-map", video);
  if (input.withAudio) {
    args.push("-map", audio, "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2");
  } else {
    args.push("-an");
  }

  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(input.fps),
    "-movflags",
    "+faststart",
    input.output
  );

  await runFfmpeg(args);
}

/** Fallback: gabung tanpa transisi kalau crossfade tidak memungkinkan. */
async function concatCopy(files: string[], dir: string, output: string) {
  const listPath = join(dir, "list.txt");
  await writeFile(listPath, files.map((path) => `file '${path}'`).join("\n"));

  await runFfmpeg([
    "-y",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    output,
  ]);
}

export type ConcatResult = {
  buffer: Buffer;
  /** Durasi file hasil gabungan; lebih pendek dari total klip karena crossfade. */
  durationSeconds: number;
};

/**
 * Menggabungkan beberapa MP4 menjadi satu file. Semua klip dinormalisasi dulu
 * (resolusi, fps asli, dan audio AAC), lalu digabung dengan crossfade supaya
 * gerakan dan perpindahan antar klip terasa halus.
 */
export async function concatClips(
  urls: string[],
  width: number,
  height: number
): Promise<ConcatResult> {
  if (urls.length === 0) {
    throw new Error("Tidak ada klip untuk digabung.");
  }

  const dir = await mkdtemp(join(tmpdir(), "keeva-concat-"));

  try {
    const sources: string[] = [];
    const infos: MediaInfo[] = [];

    for (const [index, url] of urls.entries()) {
      const source = join(dir, `source-${index}.mp4`);
      await writeFile(source, await download(url));
      sources.push(source);
      infos.push(await probeMedia(source));
    }

    const fps = targetFps(infos[0]?.fps ?? 0);
    const withAudio = infos.some((info) => info.hasAudio);
    const normalized: string[] = [];

    for (const [index, source] of sources.entries()) {
      const target = join(dir, `clip-${index}.mp4`);
      await normalizeClip({
        source,
        target,
        width,
        height,
        fps,
        withAudio,
        sourceHasAudio: infos[index].hasAudio,
      });
      normalized.push(target);
    }

    const durations: number[] = [];
    for (const file of normalized) {
      const info = await probeMedia(file);
      durations.push(info.duration);
    }

    const fade = crossfadeSeconds();
    const outputPath = join(dir, "output.mp4");
    const canCrossfade =
      normalized.length > 1 &&
      fade > 0 &&
      durations.every((duration) => duration > fade + 0.2);

    if (canCrossfade) {
      try {
        await crossfadeClips({
          files: normalized,
          durations,
          fps,
          fade,
          withAudio,
          output: outputPath,
        });
      } catch (error) {
        console.error("crossfade failed, fallback to hard cut", error);
        await concatCopy(normalized, dir, outputPath);
      }
    } else {
      await concatCopy(normalized, dir, outputPath);
    }

    return {
      buffer: await readFile(outputPath),
      durationSeconds: Math.max(1, Math.round((await probeMedia(outputPath)).duration)),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
