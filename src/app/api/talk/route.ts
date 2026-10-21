import { requireUser } from "@/lib/api/auth";
import { ApiError, jsonError, jsonOk, toGenerationDto } from "@/lib/api/http";
import { uploadImageFile } from "@/lib/api/uploads";
import { createClips, updateClip } from "@/lib/generation/clips";
import { languageCodeFor } from "@/lib/generation/language";
import { compilePrompt, type Scene } from "@/lib/generation/prompt";
import { insertGeneration, updateGeneration } from "@/lib/generation/store";
import {
  LeonardoError,
  createAudioGeneration,
  createVideoGeneration,
  getVideoGeneration,
} from "@/lib/leonardo/client";
import {
  VIDEO_MODELS,
  isVideoModelId,
  resolveAspectRatio,
  resolveVideoModel,
  type AspectRatio,
  type VideoModelId,
} from "@/lib/leonardo/models";

const ASPECT_RATIOS: AspectRatio[] = ["16:9", "9:16", "1:1"];
const TALK_DURATIONS = [5, 10, 15];
const MAX_SCRIPT_LENGTH = 1000;
const TTS_VOICE_IDS: Record<string, string> = {
  george: "JBFqnCBsd6RMkjVDRZzb",
  adam: "pNInz6obpgDQGcFmaJgB",
  jessica: "cgSgspJ2msm6clMCkdW9",
  sarah: "EXAVITQu4vr4xnSDxMaL",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Tunggu TTS dialogue-v3 selesai, lalu kembalikan id audionya. */
async function waitForTts(generationId: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const status = await getVideoGeneration(generationId).catch(() => null);
    if (status?.status === "COMPLETE") {
      const audioId = status.images[0]?.id;
      if (!audioId) throw new ApiError("Voiceover tidak menghasilkan audio.", 502);
      return audioId;
    }
    if (status?.status === "FAILED") {
      throw new ApiError(status.failureReason ?? "Voiceover gagal dirender.", 502);
    }
    await sleep(2000);
  }
  throw new ApiError("Voiceover terlalu lama dirender. Coba lagi.", 504);
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

    const audioMode = String(form.get("audioMode") ?? "native") === "tts" ? "tts" : "native";
    if (audioMode === "tts" && !spec.supportsAudioReference) {
      throw new ApiError(
        `${spec.label} tidak mendukung audio reference untuk suara TTS. Pilih MiniMax Hailuo 03, Wan 2.6, atau Seedance 2.5.`,
        400
      );
    }
    if (audioMode === "native" && !spec.supportsStartFrame) {
      throw new ApiError(`${spec.label} tidak mendukung start frame foto wajah.`, 400);
    }

    const script = String(form.get("script") ?? "").trim();
    if (!script) throw new ApiError("Teks ucapan wajib diisi.", 400);
    if (script.length > MAX_SCRIPT_LENGTH) {
      throw new ApiError(`Teks ucapan maksimal ${MAX_SCRIPT_LENGTH} karakter.`, 400);
    }

    const aspectRatioInput = String(form.get("aspectRatio") ?? "9:16") as AspectRatio;
    if (!ASPECT_RATIOS.includes(aspectRatioInput)) {
      throw new ApiError("Aspect ratio harus 16:9, 9:16, atau 1:1.", 400);
    }
    const aspectRatio = resolveAspectRatio(spec, aspectRatioInput);
    const size = spec.aspectRatioSizes[aspectRatio] ?? { width: 1280, height: 720 };

    const duration = Number(form.get("duration") ?? 5);
    if (!TALK_DURATIONS.includes(duration) || !spec.durations.includes(duration)) {
      throw new ApiError(`Durasi harus salah satu dari: ${TALK_DURATIONS.join(", ")} detik.`, 400);
    }

    const photoFile = form.get("photo");
    if (!(photoFile instanceof File) || photoFile.size === 0) {
      throw new ApiError("Foto wajah wajib diupload.", 400);
    }
    const frameId = await uploadImageFile(photoFile, "foto wajah");

    const language = String(form.get("language") ?? "Bahasa Indonesia");
    const voiceKey = String(form.get("voice") ?? "george").toLowerCase();
    const voiceId = TTS_VOICE_IDS[voiceKey] ?? TTS_VOICE_IDS.george;

    let audioId: string | null = null;
    let ttsGenerationId: string | null = null;
    if (audioMode === "tts") {
      const tts = await createAudioGeneration({
        text: script,
        languageCode: languageCodeFor(language),
        voiceId,
      });
      ttsGenerationId = tts.generationId;
      audioId = await waitForTts(tts.generationId);
    }

    const compiled = compilePrompt({
      model,
      aspectRatio,
      duration,
      userPrompt: script,
      scenes: [] as Scene[],
      options: { motionMode: "talk", talkScript: script, audioMode, voiceLanguage: language },
      hasEndFrame: false,
      clipIndex: 0,
      clipCount: 1,
    });

    const record = await insertGeneration({
      userId: user.id,
      providerGenerationId: null,
      model,
      userPrompt: script,
      compiledPrompt: compiled.prompt,
      unsupportedFeatures: compiled.unsupportedFeatures,
      startFrameLeonardoId: frameId,
      endFrameLeonardoId: null,
      audioReferenceLeonardoId: audioId,
      voiceoverUrl: null,
      voiceoverGenerationId: ttsGenerationId,
      voiceoverLanguage: languageCodeFor(language),
      voiceoverVoiceId: audioMode === "tts" ? voiceKey : null,
      durationSeconds: duration,
      aspectRatio,
      width: size.width,
      height: size.height,
      withAudio: spec.supportsAudio,
      requestPayload: [{ clipIndex: 0, prompt: compiled.prompt, duration }],
    });

    const [clip] = await createClips(record.id, [
      {
        clipIndex: 0,
        compiledPrompt: compiled.prompt,
        negativePrompt: compiled.negativePrompt,
        scenes: [],
      },
    ]);

    try {
      const result = await createVideoGeneration({
        model,
        prompt: compiled.prompt,
        negativePrompt: compiled.negativePrompt,
        duration,
        width: size.width,
        height: size.height,
        withAudio: true,
        startFrame: audioMode === "native" ? { id: frameId, type: "UPLOADED" } : null,
        imageReference: audioMode === "tts" ? { id: frameId, type: "UPLOADED" } : null,
        audioReference: audioId ? { id: audioId, type: "GENERATED" } : null,
      });

      if (clip) {
        await updateClip(clip.id, {
          providerGenerationId: result.generationId,
          status: "pending",
        });
      }

      const updated = await updateGeneration(record.id, {
        status: "pending",
        progress: "1/1 klip dikirim",
        apiCreditCost: result.cost ? Number(result.cost.amount) : null,
      });

      return jsonOk({ generation: toGenerationDto(updated) }, 202);
    } catch (error) {
      const message =
        error instanceof LeonardoError
          ? `Leonardo menolak render: ${error.message}`
          : "Gagal mengirim render ke Leonardo.";
      if (clip) {
        await updateClip(clip.id, { status: "failed", errorMessage: message, completedAt: "now" });
      }
      await updateGeneration(record.id, {
        status: "failed",
        errorMessage: message,
        completedAt: "now",
      });
      return jsonError(message, 502, { generationId: record.id });
    }
  } catch (error) {
    if (error instanceof ApiError) return jsonError(error.message, error.status);
    console.error("talk generation failed", error);
    return jsonError("Terjadi kesalahan pada server.", 500);
  }
}
