import type { SessionUser } from "@/lib/auth/session";
import type { GenerationRecord } from "@/lib/generation/store";
import type { VideoModelId } from "@/lib/leonardo/models";
import { VIDEO_MODELS } from "@/lib/leonardo/models";

export function jsonOk(data: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(data, { status, headers });
}

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return Response.json({ error: message, ...extra }, { status });
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError("Body request harus JSON yang valid.", 400);
  }
}

export type GenerationDto = {
  id: string;
  model: string;
  status: GenerationRecord["status"];
  progress: string | null;
  prompt: string;
  compiledPrompt: string;
  unsupportedFeatures: GenerationRecord["unsupportedFeatures"];
  durationSeconds: number;
  aspectRatio: string;
  width: number;
  height: number;
  withAudio: boolean;
  voiceoverUrl: string | null;
  voiceoverLanguage: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  apiCreditCost: number | null;
  createdAt: string;
  completedAt: string | null;
};

export function toGenerationDto(record: GenerationRecord): GenerationDto {
  return {
    id: record.id,
    model: record.model,
    status: record.status,
    progress: record.progress,
    prompt: record.userPrompt,
    compiledPrompt: record.compiledPrompt,
    unsupportedFeatures: record.unsupportedFeatures,
    durationSeconds: record.durationSeconds,
    aspectRatio: record.aspectRatio,
    width: record.width,
    height: record.height,
    withAudio: record.withAudio,
    voiceoverUrl: record.voiceoverUrl,
    voiceoverLanguage: record.voiceoverLanguage,
    videoUrl: record.videoUrl,
    thumbnailUrl: record.thumbnailUrl,
    errorMessage: record.errorMessage,
    apiCreditCost: record.apiCreditCost,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
  };
}

export function toUserDto(user: SessionUser) {
  return { id: user.id, email: user.email, name: user.name };
}

function totalDurations(clipDuration: number, maxTotal: number) {
  const out: number[] = [];
  for (let value = clipDuration; value <= maxTotal; value += clipDuration) {
    out.push(value);
  }
  return out;
}

export function modelsCatalog() {
  return Object.values(VIDEO_MODELS).map((model) => ({
    id: model.id as VideoModelId,
    label: model.label,
    description: model.description,
    durations: totalDurations(model.clipDuration, model.maxTotalDuration),
    clipDuration: model.clipDuration,
    maxTotalDuration: model.maxTotalDuration,
    defaultDuration: model.defaultDuration,
    aspectRatios: Object.keys(model.aspectRatioSizes),
    supportsAudio: model.supportsAudio,
    supportsStartFrame: model.supportsStartFrame,
    supportsEndFrame: model.supportsEndFrame,
    supportsAudioReference: model.supportsAudioReference,
  }));
}
