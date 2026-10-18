import { getVideoGeneration } from "@/lib/leonardo/client";
import { concatClips } from "@/lib/media/ffmpeg";
import { saveVideo } from "@/lib/media/storage";
import { listClips, updateClip, type ClipRecord } from "./clips";
import { getGenerationById, updateGeneration, type GenerationRecord } from "./store";

const STATUS_MAP: Record<string, ClipRecord["status"]> = {
  PENDING: "pending",
  PROCESSING: "processing",
  IN_PROGRESS: "processing",
  COMPLETE: "complete",
  FAILED: "failed",
};

/** `failed` tidak final: klip mungkin sudah selesai dan hanya concat yang gagal. */

async function syncClip(clip: ClipRecord): Promise<ClipRecord> {
  if (clip.status === "complete" || clip.status === "failed" || !clip.providerGenerationId) {
    return clip;
  }

  const remote = await getVideoGeneration(clip.providerGenerationId);
  if (!remote) return clip;

  const status = STATUS_MAP[remote.status] ?? "processing";
  const output = remote.images.find((image) => image.url || image.motionMp4Url);

  if (status === "complete") {
    return updateClip(clip.id, {
      status: "complete",
      videoUrl: output?.url ?? output?.motionMp4Url ?? null,
      errorMessage: null,
      completedAt: "now",
    });
  }

  if (status === "failed") {
    return updateClip(clip.id, {
      status: "failed",
      errorMessage: remote.failureReason ?? "Klip gagal dirender.",
      completedAt: "now",
    });
  }

  return updateClip(clip.id, { status });
}

export async function syncGeneration(record: GenerationRecord): Promise<GenerationRecord> {
  if (record.status === "complete" && record.videoUrl) {
    return record;
  }

  const clips = await listClips(record.id);
  if (clips.length === 0) {
    return record;
  }

  const synced = await Promise.all(clips.map((clip) => syncClip(clip).catch(() => clip)));

  const failed = synced.filter((clip) => clip.status === "failed");
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

  if (done.length < synced.length) {
    await updateGeneration(record.id, {
      status: "processing",
      progress: `${done.length}/${synced.length} klip selesai`,
    });
    return (await getGenerationById(record.id)) ?? record;
  }

  const urls = done.map((clip) => clip.videoUrl as string);
  let finalUrl = urls[0];

  if (urls.length > 1) {
    try {
      const merged = await concatClips(urls, record.width, record.height);
      await saveVideo(record.id, merged);
      finalUrl = `/api/media/${record.id}.mp4`;
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
    completedAt: "now",
  });

  return (await getGenerationById(record.id)) ?? record;
}
