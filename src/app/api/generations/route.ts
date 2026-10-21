import { requireUser } from "@/lib/api/auth";
import { ApiError, jsonError, jsonOk, toGenerationDto } from "@/lib/api/http";
import { uploadImageFile } from "@/lib/api/uploads";
import { createClips, listClips, updateClip } from "@/lib/generation/clips";
import { clipDuration, planClips } from "@/lib/generation/plan";
import { languageCodeFor } from "@/lib/generation/language";
import { compilePrompt, type GenerationOptions, type Scene } from "@/lib/generation/prompt";
import { insertGeneration, listGenerationsForUser, updateGeneration } from "@/lib/generation/store";
import { syncGeneration } from "@/lib/generation/sync";
import { LeonardoError, createVideoGeneration } from "@/lib/leonardo/client";
import {
  MAX_PROMPT_LENGTH,
  MAX_TOTAL_DURATION,
  VIDEO_MODELS,
  isVideoModelId,
  resolveAspectRatio,
  resolveVideoModel,
  type AspectRatio,
  type VideoModelId,
} from "@/lib/leonardo/models";

const ASPECT_RATIOS: AspectRatio[] = ["16:9", "9:16", "1:1"];
const MAX_SCENES = 20;

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

    const requestedDuration = Number(form.get("duration") ?? spec.clipDuration);
    if (!Number.isFinite(requestedDuration) || requestedDuration < spec.clipDuration) {
      throw new ApiError(`Durasi minimal ${spec.clipDuration} detik.`, 400);
    }
    if (requestedDuration > MAX_TOTAL_DURATION) {
      throw new ApiError(`Durasi maksimal ${MAX_TOTAL_DURATION} detik.`, 400);
    }

    const withAudio =
      spec.supportsAudio && spec.supportsAudioParam && String(form.get("withAudio") ?? "true") !== "false";
    const scenes = parseScenes(form.get("scenes") as string | null);
    const options = parseOptions(form.get("options") as string | null);

    const startFrameFile = form.get("startFrame");
    const endFrameFile = form.get("endFrame");

    const startFrameId =
      startFrameFile instanceof File && startFrameFile.size > 0
        ? await uploadImageFile(startFrameFile, "start frame")
        : null;
    const endFrameId =
      spec.supportsEndFrame && endFrameFile instanceof File && endFrameFile.size > 0
        ? await uploadImageFile(endFrameFile, "end frame")
        : null;

    const { width, height } = spec.aspectRatioSizes[aspectRatio] ?? { width: 1280, height: 720 };
    const plans = planClips(scenes, requestedDuration, spec.clipDuration);

    const compiledClips = plans.map((plan) => {
      const compiled = compilePrompt({
        model,
        aspectRatio,
        duration: clipDuration(plan),
        userPrompt: prompt,
        scenes: plan.scenes,
        options,
        hasEndFrame: Boolean(endFrameId),
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
      startFrameLeonardoId: startFrameId,
      endFrameLeonardoId: endFrameId,
      audioReferenceLeonardoId: null,
      voiceoverUrl: null,
      voiceoverGenerationId: null,
      voiceoverLanguage: options.voiceEnabled ? languageCodeFor(options.voiceLanguage) : null,
      voiceoverVoiceId: options.voiceEnabled ? (options.voiceId ?? null) : null,
      durationSeconds: plans.length * spec.clipDuration,
      aspectRatio,
      width,
      height,
      withAudio,
      requestPayload: compiledClips.map((item) => ({
        clipIndex: item.plan.clipIndex,
        prompt: item.compiled.prompt,
        negativePrompt: item.compiled.negativePrompt,
        duration: clipDuration(item.plan),
      })),
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
    let totalCost = 0;
    let submitted = 0;

    for (const clip of clips) {
      try {
        const result = await createVideoGeneration({
          model,
          prompt: clip.compiledPrompt,
          negativePrompt: clip.negativePrompt,
          duration: spec.clipDuration,
          width,
          height,
          withAudio,
          startFrame: clip.clipIndex === 0 && startFrameId ? { id: startFrameId, type: "UPLOADED" } : null,
          endFrame:
            clip.clipIndex === clips.length - 1 && endFrameId
              ? { id: endFrameId, type: "UPLOADED" }
              : null,
        });

        await updateClip(clip.id, {
          providerGenerationId: result.generationId,
          status: "pending",
        });

        if (result.cost) totalCost += Number(result.cost.amount);
        submitted += 1;
      } catch (error) {
        const message =
          error instanceof LeonardoError
            ? `Leonardo menolak klip ${clip.clipIndex + 1}: ${error.message}`
            : `Gagal mengirim klip ${clip.clipIndex + 1}.`;

        await updateClip(clip.id, { status: "failed", errorMessage: message, completedAt: "now" });
      }
    }

    if (submitted === 0) {
      const clipErrors = clips
        .filter((clip) => clip.status === "failed" && clip.errorMessage)
        .map((clip) => clip.errorMessage as string);
      const firstError = clipErrors[0] ?? "Semua klip gagal dikirim ke Leonardo.";
      await updateGeneration(record.id, {
        status: "failed",
        errorMessage: firstError,
        completedAt: "now",
      });
      return jsonError(firstError, 502, { generationId: record.id });
    }

    const updated = await updateGeneration(record.id, {
      status: "pending",
      progress: `${submitted}/${clips.length} klip dikirim`,
      apiCreditCost: totalCost || null,
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
