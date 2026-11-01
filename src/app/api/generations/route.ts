import { requireUser } from "@/lib/api/auth";
import { ApiError, jsonError, jsonOk, toGenerationDto } from "@/lib/api/http";
import { createClips, listClips } from "@/lib/generation/clips";
import { clipDuration, planClips } from "@/lib/generation/plan";
import { languageCodeFor } from "@/lib/generation/language";
import { compilePrompt, type GenerationOptions, type Scene } from "@/lib/generation/prompt";
import { insertGeneration, listGenerationsForUser, updateGeneration } from "@/lib/generation/store";
import { syncGeneration } from "@/lib/generation/sync";
import { submitClip } from "@/lib/generation/submit";
import { compressImage } from "@/lib/media/ffmpeg";
import { generateFirstFrame } from "@/lib/media/firstframe";
import { KenariError, type ImageAsset } from "@/lib/kenari/client";
import {
  MAX_PROMPT_LENGTH,
  MAX_TOTAL_DURATION,
  VIDEO_MODELS,
  canvasSize,
  isVideoModelId,
  resolveAspectRatio,
  resolveResolution,
  resolveVideoModel,
  type AspectRatio,
  type VideoModelId,
} from "@/lib/kenari/models";

const ASPECT_RATIOS: AspectRatio[] = ["16:9", "9:16", "1:1"];
const MAX_SCENES = 20;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function parseScenes(raw: string | null): Scene[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError("Field scenes bukan JSON yang valid.", 400);
  }
  if (!Array.isArray(parsed)) {
    throw new ApiError("Field scenes harus berupa array.", 400);
  }
  if (parsed.length > MAX_SCENES) {
    throw new ApiError(`Maksimal ${MAX_SCENES} scene per video.`, 400);
  }

  return parsed.map((item, index) => {
    const scene = item as Partial<Scene>;
    const visual = typeof scene.visual === "string" ? scene.visual.trim() : "";
    if (!visual) {
      throw new ApiError(`Scene #${index + 1} belum punya deskripsi visual.`, 400);
    }
    const start = Number(scene.start ?? index * 5);
    const end = Number(scene.end ?? start + 5);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new ApiError(`Rentang waktu scene #${index + 1} tidak valid.`, 400);
    }
    return {
      index,
      start,
      end,
      visual,
      narration: typeof scene.narration === "string" ? scene.narration : "",
    };
  });
}

function parseOptions(raw: string | null): GenerationOptions {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as GenerationOptions;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function readImage(value: FormDataEntryValue | null, field: string): Promise<ImageAsset | null> {
  if (!(value instanceof File) || value.size === 0) return null;
  if (value.size > MAX_IMAGE_BYTES) {
    throw new ApiError(`Gambar ${field} lebih dari 12MB.`, 413);
  }
  if (!value.type.startsWith("image/")) {
    throw new ApiError(`Format ${field} harus JPG, PNG, atau WEBP.`, 415);
  }
  return compressImage({ buffer: Buffer.from(await value.arrayBuffer()), mimeType: value.type });
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const form = await request.formData();

    const modelInput = form.get("model");
    if (modelInput !== null && !isVideoModelId(modelInput)) {
      throw new ApiError(
        `Model tidak dikenali. Pilihan: ${Object.keys(VIDEO_MODELS).join(", ")}.`,
        400
      );
    }
    const model: VideoModelId = isVideoModelId(modelInput) ? modelInput : resolveVideoModel();
    const spec = VIDEO_MODELS[model];

    const prompt = String(form.get("prompt") ?? "").trim();
    if (!prompt) throw new ApiError("Prompt wajib diisi.", 400);
    if (prompt.length > MAX_PROMPT_LENGTH) {
      throw new ApiError(`Prompt maksimal ${MAX_PROMPT_LENGTH} karakter.`, 400);
    }

    const aspectRatioInput = String(form.get("aspectRatio") ?? "16:9") as AspectRatio;
    if (!ASPECT_RATIOS.includes(aspectRatioInput)) {
      throw new ApiError("Aspect ratio harus 16:9, 9:16, atau 1:1.", 400);
    }
    const aspectRatio = resolveAspectRatio(spec, aspectRatioInput);

    const requestedDuration = Number(form.get("duration") ?? spec.defaultDuration);
    if (!Number.isFinite(requestedDuration) || requestedDuration < spec.clipDuration) {
      throw new ApiError(`Durasi minimal ${spec.clipDuration} detik.`, 400);
    }
    if (requestedDuration > MAX_TOTAL_DURATION) {
      throw new ApiError(`Durasi maksimal ${MAX_TOTAL_DURATION} detik.`, 400);
    }

    const scenes = parseScenes(form.get("scenes") as string | null);
    const options = parseOptions(form.get("options") as string | null);

    const modelImage = await readImage(form.get("modelImage") ?? form.get("startFrame"), "foto model");
    const productImage = await readImage(form.get("productImage"), "foto produk");

    const resolution = resolveResolution(spec);
    const { width, height } = canvasSize(aspectRatio, resolution);
    const plans = planClips(scenes, requestedDuration, spec.clipDuration);

    // First frame otomatis: gabungkan foto model + produk + scene jadi satu
    // gambar pembuka. Kalau image model tidak tersedia, pakai foto model.
    let firstFrame: ImageAsset | null = null;
    if (process.env.FIRST_FRAME_ENABLED !== "false" && (modelImage || productImage)) {
      firstFrame = await generateFirstFrame({
        prompt: scenes[0]?.visual ?? prompt,
        aspectRatio,
        modelImage,
        productImage,
      });
    }
    if (!firstFrame && modelImage) {
      firstFrame = modelImage;
    }
    if (firstFrame) {
      firstFrame = await compressImage(firstFrame);
    }

    const compiledClips = plans.map((plan) => {
      const compiled = compilePrompt({
        model,
        aspectRatio,
        duration: clipDuration(plan),
        userPrompt: prompt,
        scenes: plan.scenes,
        options,
        hasFirstFrame: Boolean(firstFrame),
        hasModelRef: Boolean(modelImage) && plan.clipIndex === 0,
        hasProductRef: Boolean(productImage) && plan.clipIndex === 0,
        clipIndex: plan.clipIndex,
        clipCount: plans.length,
      });
      return { plan, compiled };
    });

    const mergedFeatures = dedupeFeatures(compiledClips.flatMap((item) => item.compiled.unsupportedFeatures));

    const record = await insertGeneration({
      userId: user.id,
      providerGenerationId: null,
      model,
      userPrompt: prompt,
      compiledPrompt: compiledClips
        .map((item) =>
          item.compiled.negativePrompt
            ? `${item.compiled.prompt}\n\nNegative prompt: ${item.compiled.negativePrompt}`
            : item.compiled.prompt
        )
        .join("\n\n---\n\n"),
      unsupportedFeatures: mergedFeatures,
      startFrameLeonardoId: null,
      endFrameLeonardoId: null,
      audioReferenceLeonardoId: null,
      voiceoverUrl: null,
      voiceoverGenerationId: null,
      voiceoverLanguage: options.voiceEnabled ? languageCodeFor(options.voiceLanguage) : null,
      voiceoverVoiceId: options.voiceEnabled ? (options.voiceId ?? null) : null,
      durationSeconds: plans.length * spec.clipDuration,
      aspectRatio,
      width,
      height,
      withAudio: spec.supportsAudio,
      requestPayload: {
        resolution,
        firstFrameGenerated: Boolean(firstFrame),
        modelImage: Boolean(modelImage),
        productImage: Boolean(productImage),
        clips: compiledClips.map((item) => ({
          clipIndex: item.plan.clipIndex,
          prompt: item.compiled.prompt,
          duration: clipDuration(item.plan),
        })),
      },
    });

    await createClips(
      record.id,
      compiledClips.map((item) => ({
        clipIndex: item.plan.clipIndex,
        compiledPrompt: item.compiled.prompt,
        negativePrompt: item.compiled.negativePrompt,
        scenes: item.plan.scenes,
      }))
    );

    const clips = await listClips(record.id);
    const firstClip = clips[0];

    if (firstClip) {
      try {
        const referenceImages = [modelImage, productImage].filter(Boolean) as ImageAsset[];
        try {
          await submitClip({
            clip: firstClip,
            model,
            prompt: firstClip.compiledPrompt,
            duration: spec.clipDuration,
            resolution,
            aspectRatio,
            firstFrame,
            referenceImages,
          });
        } catch (error) {
          if (!firstFrame) throw error;
          console.warn("submit with first frame failed, retrying without it", error);
          await submitClip({
            clip: firstClip,
            model,
            prompt: firstClip.compiledPrompt,
            duration: spec.clipDuration,
            resolution,
            aspectRatio,
            firstFrame: null,
            referenceImages,
          });
        }
      } catch (error) {
        const message =
          error instanceof KenariError
            ? `Kenari menolak klip 1: ${error.message}`
            : "Gagal mengirim klip pertama ke Kenari.";
        await updateGeneration(record.id, {
          status: "failed",
          errorMessage: message,
          completedAt: "now",
        });
        return jsonError(message, 502, { generationId: record.id });
      }
    }

    const updated = await updateGeneration(record.id, {
      status: "pending",
      progress: `1/${clips.length} klip dikirim`,
    });

    return jsonOk({ generation: toGenerationDto(updated) }, 202);
  } catch (error) {
    if (error instanceof ApiError) return jsonError(error.message, error.status);
    console.error("create generation failed", error);
    return jsonError("Terjadi kesalahan pada server.", 500);
  }
}

function dedupeFeatures<T extends { feature: string }>(features: T[]): T[] {
  const seen = new Set<string>();
  return features.filter((item) => {
    if (seen.has(item.feature)) return false;
    seen.add(item.feature);
    return true;
  });
}

export async function GET() {
  try {
    const user = await requireUser();
    const records = await listGenerationsForUser(user.id);
    const synced = await Promise.all(
      records.map((record) =>
        ["complete", "failed"].includes(record.status)
          ? record
          : syncGeneration(record).catch(() => record)
      )
    );
    return jsonOk({ generations: synced.map((record) => toGenerationDto(record)) });
  } catch (error) {
    if (error instanceof ApiError) return jsonError(error.message, error.status);
    console.error("list generations failed", error);
    return jsonError("Terjadi kesalahan pada server.", 500);
  }
}
