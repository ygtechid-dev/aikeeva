export type AspectRatio = "16:9" | "9:16" | "1:1";

export type Resolution = "360p" | "720p" | "1080p";

export type VideoModelId =
  | "gemini-omni-flash"
  | "seedance-2.5"
  | "seedance-2.0"
  | "seedance-2.0-fast";

export type VideoModelSpec = {
  id: VideoModelId;
  label: string;
  description: string;
  /** Durasi per request yang diterima model (satu request = satu klip). */
  durations: number[];
  /** Durasi total maksimum untuk satu video, dirakit dari beberapa klip. */
  maxTotalDuration: number;
  /** Durasi satu klip saat video panjang dipecah. */
  clipDuration: number;
  defaultDuration: number;
  aspectRatios: AspectRatio[];
  resolutions: Resolution[];
  defaultResolution: Resolution;
  supportsAudio: boolean;
  supportsStartFrame: boolean;
  supportsEndFrame: boolean;
  supportsReferenceImages: boolean;
  maxReferenceImages: number | null;
  /** Maksimum karakter prompt yang nyaman diterima model. */
  maxPromptLength: number;
  supportsNegativePrompt: boolean;
};

export const VIDEO_MODELS: Record<VideoModelId, VideoModelSpec> = {
  "gemini-omni-flash": {
    id: "gemini-omni-flash",
    label: "Gemini Omni Flash",
    description: "Google Gemini Omni Flash, audio native, 3–10 detik per klip, paling hemat untuk UGC.",
    durations: Array.from({ length: 8 }, (_, i) => i + 3),
    maxTotalDuration: 60,
    clipDuration: 5,
    defaultDuration: 10,
    aspectRatios: ["16:9", "9:16", "1:1"],
    resolutions: ["360p", "720p", "1080p"],
    defaultResolution: "720p",
    supportsAudio: true,
    supportsStartFrame: true,
    supportsEndFrame: true,
    supportsReferenceImages: true,
    maxReferenceImages: null,
    maxPromptLength: 4000,
    supportsNegativePrompt: false,
  },
  "seedance-2.5": {
    id: "seedance-2.5",
    label: "Seedance 2.5",
    description: "ByteDance Seedance 2.5, kontrol paling detail, hingga 9 foto referensi.",
    durations: Array.from({ length: 27 }, (_, i) => i + 4),
    maxTotalDuration: 60,
    clipDuration: 5,
    defaultDuration: 10,
    aspectRatios: ["16:9", "9:16", "1:1"],
    resolutions: ["720p"],
    defaultResolution: "720p",
    supportsAudio: true,
    supportsStartFrame: true,
    supportsEndFrame: true,
    supportsReferenceImages: true,
    maxReferenceImages: 9,
    maxPromptLength: 6000,
    supportsNegativePrompt: false,
  },
  "seedance-2.0": {
    id: "seedance-2.0",
    label: "Seedance 2.0",
    description: "ByteDance Seedance 2.0, kontrol tinggi dengan prompt panjang.",
    durations: Array.from({ length: 12 }, (_, i) => i + 4),
    maxTotalDuration: 60,
    clipDuration: 5,
    defaultDuration: 10,
    aspectRatios: ["16:9", "9:16", "1:1"],
    resolutions: ["720p"],
    defaultResolution: "720p",
    supportsAudio: true,
    supportsStartFrame: true,
    supportsEndFrame: true,
    supportsReferenceImages: true,
    maxReferenceImages: 9,
    maxPromptLength: 6000,
    supportsNegativePrompt: false,
  },
  "seedance-2.0-fast": {
    id: "seedance-2.0-fast",
    label: "Seedance 2.0 Fast",
    description: "Seedance 2.0 versi cepat dan lebih murah untuk testing.",
    durations: Array.from({ length: 12 }, (_, i) => i + 4),
    maxTotalDuration: 60,
    clipDuration: 5,
    defaultDuration: 10,
    aspectRatios: ["16:9", "9:16", "1:1"],
    resolutions: ["720p"],
    defaultResolution: "720p",
    supportsAudio: true,
    supportsStartFrame: true,
    supportsEndFrame: true,
    supportsReferenceImages: true,
    maxReferenceImages: 9,
    maxPromptLength: 6000,
    supportsNegativePrompt: false,
  },
};

export const DEFAULT_VIDEO_MODEL: VideoModelId = "gemini-omni-flash";

export function resolveAspectRatio(spec: VideoModelSpec, requested: AspectRatio): AspectRatio {
  return spec.aspectRatios.includes(requested) ? requested : spec.aspectRatios[0];
}

export function isVideoModelId(value: unknown): value is VideoModelId {
  return typeof value === "string" && value in VIDEO_MODELS;
}

export function resolveVideoModel(): VideoModelId {
  const configured = process.env.KENARI_VIDEO_MODEL;
  return isVideoModelId(configured) ? configured : DEFAULT_VIDEO_MODEL;
}

export function resolveResolution(spec: VideoModelSpec): Resolution {
  const configured = process.env.KENARI_RESOLUTION as Resolution | undefined;
  return configured && spec.resolutions.includes(configured) ? configured : spec.defaultResolution;
}

/** Ukuran kanvas final untuk concat/ffmpeg, mengikuti rasio + resolusi. */
export function canvasSize(aspectRatio: AspectRatio, resolution: Resolution) {
  const shortSide = resolution === "1080p" ? 1080 : resolution === "360p" ? 360 : 720;
  if (aspectRatio === "1:1") {
    return { width: shortSide, height: shortSide };
  }
  const longSide = Math.round((shortSide * 16) / 9 / 2) * 2;
  return aspectRatio === "16:9"
    ? { width: longSide, height: shortSide }
    : { width: shortSide, height: longSide };
}

export const MAX_PROMPT_LENGTH = 6000;
export const MAX_TOTAL_DURATION = 60;
