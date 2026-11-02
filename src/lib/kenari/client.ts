import type { AspectRatio, Resolution, VideoModelId } from "./models";

const DEFAULT_BASE_URL = "http://localhost:3000";

export class KenariError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown
  ) {
    super(message);
  }
}

export type ImageAsset = {
  buffer: Buffer;
  mimeType: string;
};

function baseUrl() {
  return (process.env.KENARI_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
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
  const record = body as Record<string, unknown>;
  for (const key of ["error", "message", "failure_reason", "detail"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const nested = (value as Record<string, unknown>).message;
      if (typeof nested === "string" && nested.trim()) return nested.trim();
    }
  }
  return null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let url = `${baseUrl()}${path}`;
  let attempt = 0;
  let response: Response;
  try {
    while (true) {
      response = await fetch(url, { ...init, cache: "no-store", redirect: "follow" });
      if ((response.status === 301 || response.status === 302) && response.headers.get("location")) {
        attempt += 1;
        if (attempt > 3) {
          throw new Error(`Terlalu banyak redirect dari ${baseUrl()}.`);
        }
        url = new URL(response.headers.get("location") as string, url).toString();
        continue;
      }
      break;
    }
  } catch (error) {
    throw new KenariError(
      `Tidak bisa menghubungi backend Kenari (${baseUrl()}). ` +
        `Pastikan server aikenarivideo berjalan dan KENARI_API_BASE_URL benar. (${(error as Error).message})`,
      502
    );
  }

  const text = await response.text();
  const body = text ? safeJson(text) : null;

  if (!response.ok) {
    throw new KenariError(
      extractError(body) ?? `Kenari API error (${response.status}).`,
      response.status,
      body
    );
  }

  return body as T;
}

export type CreateVideoInput = {
  model: VideoModelId;
  prompt: string;
  duration: number;
  resolution?: Resolution;
  aspectRatio?: AspectRatio;
  /** Frame pertama (image-to-video). Diunggah dulu, dikirim sebagai URL publik. */
  firstFrame?: ImageAsset | null;
  /** Frame akhir opsional. */
  endFrame?: ImageAsset | null;
  /** Foto referensi (model, produk). Dikirim sebagai multipart field "references". */
  referenceImages?: ImageAsset[];
};

export type CreateVideoResult = {
  jobId: string;
  status: string;
};

function fileExtension(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

/**
 * Kenari menolak data URL untuk image_url; frame harus berupa URL publik.
 * Jadi upload dulu ke backend, lalu pakai URL hasilnya.
 */
async function uploadFrame(asset: ImageAsset): Promise<string> {
  const form = new FormData();
  form.append(
    "image",
    new Blob([new Uint8Array(asset.buffer)], { type: asset.mimeType }),
    `frame.${fileExtension(asset.mimeType)}`
  );

  const raw = await request<{ url?: string }>("/api/frames", {
    method: "POST",
    body: form,
  });

  if (!raw.url) {
    throw new KenariError("Backend Kenari tidak mengembalikan URL frame.", 502, raw);
  }

  return raw.url;
}

export async function createVideoGeneration(input: CreateVideoInput): Promise<CreateVideoResult> {
  const form = new FormData();
  form.append("model", input.model);
  form.append("prompt", input.prompt);
  form.append("duration", String(input.duration));
  if (input.resolution) form.append("resolution", input.resolution);
  if (input.aspectRatio) form.append("aspect_ratio", input.aspectRatio);

  // Kenari hanya menerima salah satu: start/end frame ATAU reference images.
  const useFrame = Boolean(input.firstFrame || input.endFrame);

  if (input.firstFrame) {
    form.append("image_url", await uploadFrame(input.firstFrame));
  }
  if (input.endFrame) {
    form.append("end_image_url", await uploadFrame(input.endFrame));
  }

  if (!useFrame) {
    for (const [index, asset] of (input.referenceImages ?? []).entries()) {
      form.append(
        "references",
        new Blob([new Uint8Array(asset.buffer)], { type: asset.mimeType }),
        `reference-${index + 1}.${fileExtension(asset.mimeType)}`
      );
    }
  }

  const raw = await request<{ id?: string; status?: string }>("/api/videos/generations", {
    method: "POST",
    body: form,
  });

  if (!raw.id) {
    throw new KenariError("Backend Kenari tidak mengembalikan job id.", 502, raw);
  }

  return { jobId: raw.id, status: raw.status ?? "rendering" };
}

export type VideoJobStatus = "rendering" | "done" | "failed" | "expired";

export type VideoJob = {
  id: string;
  status: VideoJobStatus;
  url: string | null;
  failureReason: string | null;
};

function normalizeStatus(value: unknown): VideoJobStatus {
  const status = String(value ?? "rendering").toLowerCase();
  if (status === "done" || status === "complete" || status === "completed") return "done";
  if (status === "failed" || status === "error") return "failed";
  if (status === "expired") return "expired";
  return "rendering";
}

export async function getVideoJob(jobId: string): Promise<VideoJob | null> {
  const raw = await request<{
    id?: string;
    status?: string;
    url?: string | null;
    failure_reason?: string | null;
    error?: string | null;
  }>(`/api/videos/${encodeURIComponent(jobId)}`);

  return {
    id: raw.id ?? jobId,
    status: normalizeStatus(raw.status),
    url: raw.url ?? null,
    failureReason: raw.failure_reason ?? raw.error ?? null,
  };
}

/** URL proxy di backend Kenari; aman dipakai tanpa API key. */
export function contentUrl(jobId: string) {
  return `${baseUrl()}/api/videos/${encodeURIComponent(jobId)}/content`;
}
