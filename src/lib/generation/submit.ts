import { KenariError, createVideoGeneration, type ImageAsset } from "@/lib/kenari/client";
import type { AspectRatio, Resolution, VideoModelId } from "@/lib/kenari/models";
import { updateClip, type ClipRecord } from "./clips";

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

    await updateClip(input.clip.id, { status: "failed", errorMessage: message, completedAt: "now" });
    throw error;
  }
}
