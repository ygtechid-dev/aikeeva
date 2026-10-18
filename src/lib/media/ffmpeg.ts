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

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ FFMPEG_PATH, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });

    child.on("error", (error) => {
      reject(
        new Error(
          `Tidak bisa menjalankan ffmpeg (${FFMPEG_PATH}): ${error.message}. ` +
            "Set FFMPEG_PATH ke binary ffmpeg yang tersedia."
        )
      );
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg gagal (exit ${code}): ${stderr.trim().slice(-600)}`));
    });
  });
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Gagal mengunduh klip (${response.status}).`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Menggabungkan beberapa MP4 menjadi satu file. Semua klip dinormalisasi dulu
 * (resolusi, fps, dan audio AAC) supaya concat demuxer menghasilkan file valid.
 */
export async function concatClips(urls: string[], width: number, height: number): Promise<Buffer> {
  if (urls.length === 0) {
    throw new Error("Tidak ada klip untuk digabung.");
  }

  const dir = await mkdtemp(join(tmpdir(), "keeva-concat-"));

  try {
    const normalized: string[] = [];

    for (const [index, url] of urls.entries()) {
      const source = join(dir, `source-${index}.mp4`);
      const target = join(dir, `clip-${index}.mp4`);
      await writeFile(source, await download(url));

      await runFfmpeg([
        "-y",
        "-loglevel",
        "error",
        "-i",
        source,
        "-vf",
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-ac",
        "2",
        target,
      ]);

      normalized.push(target);
    }

    const listPath = join(dir, "list.txt");
    await writeFile(listPath, normalized.map((path) => `file '${path}'`).join("\n"));

    const outputPath = join(dir, "output.mp4");
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
      outputPath,
    ]);

    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
