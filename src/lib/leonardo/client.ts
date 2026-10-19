import { VIDEO_MODELS, type VideoModelId } from "./models";

const DEFAULT_BASE_URL = "https://cloud.leonardo.ai/api/rest";

export class LeonardoError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown
  ) {
    super(message);
  }
}

function baseUrl() {
  return (process.env.LEONARDO_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function apiKey() {
  const key = process.env.LEONARDO_API_KEY;
  if (!key) {
    throw new LeonardoError("LEONARDO_API_KEY belum dikonfigurasi.", 500);
  }
  return key;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey()}`,
      ...init.headers,
    },
  });

  const text = await response.text();
  const body = text ? safeJson(text) : null;

  if (!response.ok) {
    throw new LeonardoError(extractError(body) ?? `Leonardo API error (${response.status}).`, response.status, body);
  }

  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractError(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return typeof body === "string" ? body.slice(0, 300) : null;
  }
  if (Array.isArray(body)) {
    for (const entry of body) {
      const message = extractError(entry);
      if (message) return message;
    }
    return null;
  }
  const record = body as Record<string, unknown>;
  for (const key of ["error", "message", "detail"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

export type LeonardoImageRef = { id: string; type: "UPLOADED" };

export type LeonardoAudioRef = { id: string; type: "UPLOADED" | "GENERATED" };

export type CreateGenerationInput = {
  model: VideoModelId;
  prompt: string;
  negativePrompt?: string | null;
  duration: number;
  width: number;
  height: number;
  withAudio: boolean;
  startFrame?: LeonardoImageRef | null;
  endFrame?: LeonardoImageRef | null;
  audioReference?: LeonardoAudioRef | null;
  imageReference?: LeonardoImageRef | null;
};

export type CreateGenerationResult = {
  generationId: string;
  apiCreditCost: number | null;
  cost: { amount: string; unit: string } | null;
};

export type GenerationImage = {
  id: string;
  url: string | null;
  motionMp4Url: string | null;
  thumbnailUrl: string | null;
};

export type GenerationStatus = {
  id: string;
  status: string;
  progress: string | null;
  images: GenerationImage[];
  failureReason: string | null;
};

type RawGeneration = {
  generate?: {
    generationId?: string;
    apiCreditCost?: number | null;
    cost?: { amount?: string; unit?: string } | null;
  };
  sdGenerationJob?: { generationId?: string };
  generations_by_pk?: {
    id: string;
    status?: string;
    progress?: string | null;
    generated_images?: Array<{
      id: string;
      url?: string | null;
      motionMP4URL?: string | null;
      urls?: { asset?: string | null; thumbnail?: string | null } | null;
    }>;
    prompt_moderations?: Array<{ moderationClassification?: unknown }>;
  } | null;
};

export async function createVideoGeneration(input: CreateGenerationInput): Promise<CreateGenerationResult> {
  const spec = VIDEO_MODELS[input.model];
  const parameters: Record<string, unknown> = {
    prompt: input.prompt,
    duration: input.duration,
    width: input.width,
    height: input.height,
    quantity: 1,
  };

  if (spec.supportsAudioParam) {
    parameters.motion_has_audio = input.withAudio;
  }

  if (spec.supportsNegativePrompt && input.negativePrompt) {
    parameters.negative_prompt = input.negativePrompt;
  }

  // Hailuo 03: audio_reference tidak kompatibel dengan quality TURBO (default).
  // Paksa STANDARD saat audio reference diberikan.
  if (input.audioReference && input.model === "hailuo-03") {
    parameters.quality = "STANDARD";
  }

  const guidances: Record<string, unknown> = {};
  if (input.startFrame) {
    guidances.start_frame = [{ image: input.startFrame }];
  }
  if (input.endFrame) {
    guidances.end_frame = [{ image: input.endFrame }];
  }
  if (input.imageReference) {
    guidances.image_reference = [{ image: input.imageReference }];
  }
  if (input.audioReference) {
    guidances.audio_reference = [{ audio: input.audioReference }];
  }
  if (Object.keys(guidances).length > 0) {
    parameters.guidances = guidances;
  }

  const raw = await request<RawGeneration>("/v2/generations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: input.model, public: false, parameters }),
  });

  const job = raw.generate;
  const generationId = job?.generationId ?? raw.sdGenerationJob?.generationId;
  if (!generationId) {
    throw new LeonardoError("Leonardo tidak mengembalikan generationId.", 502, raw);
  }

  return {
    generationId,
    apiCreditCost: job?.apiCreditCost ?? null,
    cost: job?.cost?.amount && job.cost.unit ? { amount: job.cost.amount, unit: job.cost.unit } : null,
  };
}

export async function getVideoGeneration(generationId: string): Promise<GenerationStatus | null> {
  const raw = await request<RawGeneration>(`/v1/generations/${encodeURIComponent(generationId)}`);
  const generation = raw.generations_by_pk;
  if (!generation) {
    return null;
  }

  const images = (generation.generated_images ?? []).map((image) => ({
    id: image.id,
    url: image.urls?.asset ?? image.url ?? null,
    motionMp4Url: image.motionMP4URL ?? null,
    thumbnailUrl: image.urls?.thumbnail ?? image.url ?? null,
  }));

  return {
    id: generation.id,
    status: generation.status ?? "PENDING",
    progress: generation.progress ?? null,
    images,
    failureReason: generation.prompt_moderations?.length ? "Prompt ditolak oleh moderasi." : null,
  };
}

export async function createAudioGeneration(input: {
  text: string;
  languageCode: string;
  voiceId: string;
}): Promise<CreateGenerationResult> {
  const raw = await request<RawGeneration>("/v2/generations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "dialogue-v3",
      public: false,
      parameters: {
        prompt: input.text,
        voice_id: input.voiceId,
        language_code: input.languageCode,
        prompt_influence: 0.5,
        quantity: 1,
      },
    }),
  });

  const job = raw.generate;
  if (!job?.generationId) {
    throw new LeonardoError("Leonardo tidak mengembalikan generationId untuk voiceover.", 502, raw);
  }

  return {
    generationId: job.generationId,
    apiCreditCost: job.apiCreditCost ?? null,
    cost: job.cost?.amount && job.cost.unit ? { amount: job.cost.amount, unit: job.cost.unit } : null,
  };
}

export type UploadResult = { id: string };

export async function uploadAsset(
  buffer: Buffer,
  extension: "jpg" | "png" | "webp",
  mimeType: string
) {
  const init = await request<{
    uploadInitImage?: { id?: string; url?: string; fields?: string };
  }>("/v1/init-image", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ extension }),
  });

  const upload = init.uploadInitImage;
  if (!upload?.id || !upload.url) {
    throw new LeonardoError("Gagal mendapatkan presigned URL untuk upload.", 502, init);
  }

  const fields = upload.fields ? (JSON.parse(upload.fields) as Record<string, string>) : {};
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), `upload.${extension}`);

  const uploadResponse = await fetch(upload.url, { method: "POST", body: form });
  if (!uploadResponse.ok) {
    throw new LeonardoError(`Upload ke storage Leonardo gagal (${uploadResponse.status}).`, 502);
  }

  return { id: upload.id } satisfies UploadResult;
}
