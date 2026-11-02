import { KenariError, createVideoGeneration, type ImageAsset } from "@/lib/kenari/client";
import type { AspectRatio, Resolution, VideoModelId } from "@/lib/kenari/models";
import { updateClip, type ClipRecord } from "./clips";
import { MAX_CLIP_RETRIES } from "./constants";

export type SubmitClipInput = {
  clip: ClipRecord;
  model: VideoModelId;
  prompt: string;
  duration: number;
  resolution: Resolution;
  aspectRatio: AspectRatio;
  firstFrame?: ImageAsset | null;
  referenceImages?: ImageAsset[];
};

/** Kirim satu klip ke Kenari dan simpan job id-nya. Melempar error kalau gagal. */
export async function submitClip(input: SubmitClipInput): Promise<ClipRecord> {
  try {
    const result = await createVideoGeneration({
      model: input.model,
      prompt: input.prompt,
      duration: input.duration,
      resolution: input.resolution,
      aspectRatio: input.aspectRatio,
      firstFrame: input.firstFrame ?? null,
      referenceImages: input.referenceImages ?? [],
    });

    return await updateClip(input.clip.id, {
      providerGenerationId: result.jobId,
      status: "pending",
      errorMessage: null,
      completedAt: null,
    });
  } catch (error) {
    const message =
      error instanceof KenariError
        ? `Kenari menolak klip ${input.clip.clipIndex + 1}: ${error.message}`
        : `Gagal mengirim klip ${input.clip.clipIndex + 1} ke Kenari.`;

    // Error 4xx (model/prompt/durasi/saldo) permanen: jangan diulang.
    // Error 5xx atau jaringan masih layak dicoba lagi.
    const permanent =
      error instanceof KenariError && error.status >= 400 && error.status < 500;

    // 4xx = permanen, langsung failed. Selain itu biarkan queued supaya
    // polling berikutnya mengirim ulang (retry).
    if (permanent) {
      await updateClip(input.clip.id, {
        status: "failed",
        errorMessage: message,
        retryCount: MAX_CLIP_RETRIES,
        completedAt: "now",
      });
    } else {
      await updateClip(input.clip.id, {
        status: "queued",
        providerGenerationId: null,
        retryCount: input.clip.retryCount + 1,
        errorMessage: message,
      });
    }
    throw error;
  }
}
