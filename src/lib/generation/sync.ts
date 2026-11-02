import { contentUrl, getVideoJob } from "@/lib/kenari/client";
import {
  isVideoModelId,
  resolveResolution,
  VIDEO_MODELS,
  type AspectRatio,
  type Resolution,
  type VideoModelId,
} from "@/lib/kenari/models";
import { concatClips, extractLastFrame } from "@/lib/media/ffmpeg";
import { saveVideo } from "@/lib/media/storage";
import { listClips, updateClip, type ClipRecord } from "./clips";
import { compilePrompt, type GenerationOptions } from "./prompt";
import { MAX_CLIP_RETRIES } from "./constants";
import { getGenerationById, updateGeneration, type GenerationRecord } from "./store";
import { submitClip } from "./submit";

/** Cegah dua polling bersamaan mengirim klip yang sama. */
const syncing = new Set<string>();

async function syncClip(clip: ClipRecord): Promise<ClipRecord> {
  if (clip.status === "complete" || clip.status === "failed" || !clip.providerGenerationId) {
    return clip;
  }

  const job = await getVideoJob(clip.providerGenerationId);
  if (!job) return clip;

  if (job.status === "done") {
    return updateClip(clip.id, {
      status: "complete",
      videoUrl: contentUrl(clip.providerGenerationId),
      errorMessage: null,
      completedAt: "now",
    });
  }

  if (job.status === "failed" || job.status === "expired") {
    // Provider sering menolak sementara (konten, antrean, dsb). Coba ulang
    // dengan prompt yang sama sebelum menyerah.
    const reason = job.failureReason ?? "Klip gagal dirender.";
    if (clip.retryCount < MAX_CLIP_RETRIES) {
      return updateClip(clip.id, {
        status: "queued",
        providerGenerationId: null,
        retryCount: clip.retryCount + 1,
        errorMessage: `Percobaan ${clip.retryCount + 1} gagal: ${reason}`,
        completedAt: null,
      });
    }

    return updateClip(clip.id, {
      status: "failed",
      errorMessage: reason,
      completedAt: "now",
    });
  }

  return updateClip(clip.id, { status: "processing" });
}

function modelSpec(record: GenerationRecord) {
  return isVideoModelId(record.model) ? VIDEO_MODELS[record.model as VideoModelId] : null;
}

export async function syncGeneration(record: GenerationRecord): Promise<GenerationRecord> {
  if (record.status === "complete" && record.videoUrl) {
    return record;
  }

  if (syncing.has(record.id)) {
    return (await getGenerationById(record.id)) ?? record;
  }

  syncing.add(record.id);
  try {
    return await syncLocked(record);
  } finally {
    syncing.delete(record.id);
  }
}

async function syncLocked(record: GenerationRecord): Promise<GenerationRecord> {
  const clips = await listClips(record.id);
  if (clips.length === 0) {
    return record;
  }

  // Generation lama (provider Leonardo) tidak bisa dipolling ke Kenari.
  const spec = modelSpec(record);
  if (!spec) {
    await updateGeneration(record.id, {
      status: "failed",
      errorMessage: `Model ${record.model} tidak didukung provider Kenari.`,
      completedAt: "now",
    });
    return (await getGenerationById(record.id)) ?? record;
  }

  const synced = await Promise.all(clips.map((clip) => syncClip(clip).catch(() => clip)));
  const retryExhausted = (clip: ClipRecord) =>
    clip.status === "queued" && !clip.providerGenerationId && clip.retryCount > MAX_CLIP_RETRIES;

  const failed = synced.filter((clip) => clip.status === "failed" || retryExhausted(clip));
  const done = synced.filter((clip) => clip.status === "complete" && clip.videoUrl);

  if (failed.length > 0) {
    await updateGeneration(record.id, {
      status: "failed",
      progress: `${done.length}/${synced.length} klip selesai`,
      errorMessage: failed[0].errorMessage ?? "Salah satu klip gagal dirender.",
      completedAt: "now",
    });
    return (await getGenerationById(record.id)) ?? record;
  }

  // Klip berikutnya baru dikirim setelah klip sebelumnya selesai, memakai
  // frame terakhir klip sebelumnya sebagai start frame (chaining).
  const nextIndex = synced.findIndex(
    (clip) => clip.status === "queued" && !clip.providerGenerationId && clip.retryCount <= MAX_CLIP_RETRIES
  );
  const previousDone =
    nextIndex >= 0 &&
    synced.slice(0, nextIndex).every((clip) => clip.status === "complete" && clip.videoUrl);

  if (nextIndex >= 0 && previousDone) {
    const clip = synced[nextIndex];
    const payload = (record.requestPayload ?? {}) as {
      resolution?: Resolution;
      options?: GenerationOptions;
    };
    const resolution = payload.resolution ?? resolveResolution(spec);
    let firstFrame = null;

    if (nextIndex > 0) {
      try {
        firstFrame = await extractLastFrame(synced[nextIndex - 1].videoUrl as string);
      } catch (error) {
        console.error(`extract last frame failed for ${record.id} clip ${nextIndex}`, error);
      }
    }

    // Prompt klip lanjutan harus menyebut start frame (hasil chaining), bukan
    // foto referensi yang sebenarnya tidak dikirim pada klip ini.
    let prompt = clip.compiledPrompt;
    try {
      const recompiled = compilePrompt({
        model: record.model as VideoModelId,
        aspectRatio: record.aspectRatio as AspectRatio,
        duration: spec.clipDuration,
        userPrompt: record.userPrompt,
        scenes: clip.scenes,
        options: payload.options ?? {},
        hasFirstFrame: true,
        hasModelRef: false,
        hasProductRef: false,
        clipIndex: clip.clipIndex,
        clipCount: synced.length,
      });
      prompt = recompiled.prompt;
      if (prompt !== clip.compiledPrompt) {
        await updateClip(clip.id, { compiledPrompt: prompt });
      }
    } catch (error) {
      console.error(`recompile prompt failed for ${record.id} clip ${clip.clipIndex}`, error);
    }

    try {
      const submit = (frame: typeof firstFrame) =>
        submitClip({
          clip,
          model: record.model as VideoModelId,
          prompt,
          duration: spec.clipDuration,
          resolution,
          aspectRatio: record.aspectRatio as AspectRatio,
          firstFrame: frame,
        });

      try {
        await submit(firstFrame);
      } catch (error) {
        if (!firstFrame) throw error;
        console.warn("submit chained clip failed, retrying without start frame", error);
        await submit(null);
      }

      await updateGeneration(record.id, {
        status: "processing",
        progress: `${nextIndex + 1}/${synced.length} klip dikirim`,
        errorMessage: null,
      });
    } catch (error) {
      console.error(`submit next clip failed for ${record.id}`, error);
      // Kalau klip masih queued, submitClip sudah menjadwalkan retry.
      const [latest] = (await listClips(record.id)).filter((item) => item.id === clip.id);
      const willRetry = latest?.status === "queued" && !latest.providerGenerationId;

      if (willRetry) {
        await updateGeneration(record.id, {
          status: "processing",
          progress: `${done.length}/${synced.length} klip selesai (mencoba ulang)`,
        });
      } else {
        await updateGeneration(record.id, {
          status: "failed",
          progress: `${done.length}/${synced.length} klip selesai`,
          errorMessage: latest?.errorMessage ?? "Gagal mengirim klip berikutnya ke Kenari.",
          completedAt: "now",
        });
      }
    }

    return (await getGenerationById(record.id)) ?? record;
  }

  if (done.length < synced.length) {
    await updateGeneration(record.id, {
      status: "processing",
      progress: `${done.length}/${synced.length} klip selesai`,
    });
    return (await getGenerationById(record.id)) ?? record;
  }

  const urls = done.map((clip) => clip.videoUrl as string);
  let finalUrl = urls[0];
  let durationSeconds: number | undefined;

  // Satu klip: simpan lokal supaya playback tidak bergantung ke backend Kenari.
  if (urls.length === 1) {
    try {
      const response = await fetch(urls[0], { cache: "no-store" });
      if (response.ok) {
        await saveVideo(record.id, Buffer.from(await response.arrayBuffer()));
        finalUrl = `/api/media/${record.id}.mp4`;
      }
    } catch (error) {
      console.error(`download single clip failed for ${record.id}`, error);
    }
  }

  if (urls.length > 1) {
    try {
      const merged = await concatClips(urls, record.width, record.height);
      await saveVideo(record.id, merged.buffer);
      finalUrl = `/api/media/${record.id}.mp4`;
      durationSeconds = merged.durationSeconds;
    } catch (error) {
      console.error(`concat failed for ${record.id}`, error);
      await updateGeneration(record.id, {
        status: "failed",
        progress: `${synced.length}/${synced.length} klip selesai`,
        errorMessage: "Klip selesai tetapi gagal digabung menjadi satu video.",
        completedAt: "now",
      });
      return (await getGenerationById(record.id)) ?? record;
    }
  }

  await updateGeneration(record.id, {
    status: "complete",
    progress: "done",
    videoUrl: finalUrl,
    thumbnailUrl: null,
    errorMessage: null,
    ...(durationSeconds ? { durationSeconds } : {}),
    completedAt: "now",
  });

  return (await getGenerationById(record.id)) ?? record;
}
