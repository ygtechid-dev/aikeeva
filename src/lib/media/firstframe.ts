import type { ImageAsset } from "@/lib/kenari/client";
import type { AspectRatio } from "@/lib/kenari/models";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-image-1";
const TIMEOUT_MS = 60_000;

export type FirstFrameInput = {
  /** Deskripsi scene dari brief/skenario. */
  prompt: string;
  aspectRatio: AspectRatio;
  modelImage?: ImageAsset | null;
  productImage?: ImageAsset | null;
};

function baseUrl() {
  return (process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function apiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return key;
}

function imageSize(aspectRatio: AspectRatio) {
  if (aspectRatio === "9:16") return "1024x1536";
  if (aspectRatio === "16:9") return "1536x1024";
  return "1024x1024";
}

function buildPrompt(input: FirstFrameInput) {
  const lines = [
    "Create a photorealistic first frame for a short UGC video.",
    input.modelImage && input.productImage
      ? "Image 1 is the person identity reference. Image 2 is the product reference."
      : "",
    input.modelImage
      ? "Use the person in the identity reference as the exact same person: preserve face, facial proportions, skin tone, age, hair and body. Do not beautify, slim or change identity."
      : "",
    input.productImage
      ? "Use the product in the product reference exactly as shown: preserve shape, color, label text, packaging and proportions. Never redesign or warp it."
      : "",
    `Scene: ${input.prompt}`,
    "Camera: eye-level phone camera framing, natural and slightly imperfect composition.",
    "Lighting: available natural light or practical room light with a clear direction and realistic shadows.",
    "Realism: real skin texture with visible pores, flyaway hair, natural fabric wrinkles, believable hand anatomy, true-to-life colors.",
    "No added text, captions, subtitles, watermarks or graphic overlays. Keep the product's own label text exactly as shown. No collage, no grid, no border. No CGI, render or plastic look.",
  ];
  return lines.filter(Boolean).join("\n");
}

function detectMime(buffer: Buffer): string {
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer.length > 12 && buffer.toString("ascii", 0, 4) === "RIFF") return "image/webp";
  return "image/jpeg";
}

type ImageResponse = {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string };
};

async function readImageResponse(response: Response): Promise<ImageAsset | null> {
  const data = (await response.json().catch(() => ({}))) as ImageResponse;
  if (!response.ok) {
    throw new Error(data.error?.message ?? `Image API error (${response.status}).`);
  }

  const first = data.data?.[0];
  if (!first) return null;

  if (first.b64_json) {
    const buffer = Buffer.from(first.b64_json, "base64");
    return { buffer, mimeType: detectMime(buffer) };
  }

  if (first.url) {
    const image = await fetch(first.url, { cache: "no-store" });
    if (!image.ok) return null;
    const buffer = Buffer.from(await image.arrayBuffer());
    return { buffer, mimeType: detectMime(buffer) };
  }

  return null;
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Membuat first frame otomatis dari foto model + produk + scene.
 * Mengembalikan null kalau tidak ada aset atau image model tidak tersedia;
 * caller bisa fallback memakai foto model sebagai frame pertama.
 */
export async function generateFirstFrame(input: FirstFrameInput): Promise<ImageAsset | null> {
  const key = apiKey();
  if (!key) return null;

  const images = [input.modelImage, input.productImage].filter(Boolean) as ImageAsset[];
  if (images.length === 0) return null;

  const model = process.env.FIRST_FRAME_MODEL || DEFAULT_MODEL;
  const prompt = buildPrompt(input);
  const size = imageSize(input.aspectRatio);

  try {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("size", size);
    form.append("quality", "medium");
    form.append("n", "1");
    for (const [index, image] of images.entries()) {
      form.append(
        "image[]",
        new Blob([new Uint8Array(image.buffer)], { type: image.mimeType }),
        `image-${index + 1}.${
          image.mimeType === "image/png" ? "png" : image.mimeType === "image/webp" ? "webp" : "jpg"
        }`
      );
    }

    const result = await withTimeout((signal) =>
      fetch(`${baseUrl()}/images/edits`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}` },
        body: form,
        signal,
        cache: "no-store",
      }).then(readImageResponse)
    );
    if (result) return result;
  } catch (error) {
    console.error("first frame edit failed, falling back to generation", error);
  }

  try {
    const result = await withTimeout((signal) =>
      fetch(`${baseUrl()}/images/generations`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model, prompt, size, quality: "medium", n: 1 }),
        signal,
        cache: "no-store",
      }).then(readImageResponse)
    );
    if (result) return result;
  } catch (error) {
    console.error("first frame generation failed", error);
  }

  return null;
}
