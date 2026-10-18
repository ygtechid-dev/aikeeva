export type AspectRatio = "16:9" | "9:16" | "1:1";

export type VideoModelId =
  | "hailuo-03"
  | "wan-2.6"
  | "kling-2.6"
  | "bytedance/seedance-2.5";

export type VideoModelSpec = {
  id: VideoModelId;
  label: string;
  description: string;
  /** Durasi per klip yang diterima model (satu request = satu klip). */
  durations: number[];
  /** Durasi total maksimum untuk satu video, dirakit dari beberapa klip. */
  maxTotalDuration: number;
  /** Durasi satu klip saat video panjang dipecah. */
  clipDuration: number;
  defaultDuration: number;
  aspectRatioSizes: Record<AspectRatio, { width: number; height: number }>;
  supportsAudio: boolean;
  /** Model menerima parameter `motion_has_audio` (Wan 2.6 tidak). */
  supportsAudioParam: boolean;
  supportsStartFrame: boolean;
  supportsEndFrame: boolean;
  supportsAudioReference: boolean;
  /** Maksimum karakter prompt yang diterima API. */
  maxPromptLength: number;
  /** Model menerima `negative_prompt` terpisah. */
  supportsNegativePrompt: boolean;
};

export const VIDEO_MODELS: Record<VideoModelId, VideoModelSpec> = {
  "hailuo-03": {
    id: "hailuo-03",
    label: "MiniMax Hailuo 03",
    description: "MiniMax Hailuo 03, gerakan natural dengan audio native, 5–15 detik per klip.",
    durations: Array.from({ length: 11 }, (_, i) => i + 5),
    maxTotalDuration: 60,
    clipDuration: 5,
    defaultDuration: 5,
    aspectRatioSizes: {
      "16:9": { width: 1376, height: 768 },
      "9:16": { width: 768, height: 1376 },
      "1:1": { width: 768, height: 768 },
    },
    supportsAudio: true,
    supportsAudioParam: true,
    supportsStartFrame: true,
    supportsEndFrame: true,
    supportsAudioReference: true,
    maxPromptLength: 7000,
    supportsNegativePrompt: false,
  },
  "wan-2.6": {
    id: "wan-2.6",
    label: "Wan 2.6",
    description: "Alibaba Wan 2.6, mendukung audio, start/end frame, dan referensi audio.",
    durations: [5, 10, 15],
    maxTotalDuration: 60,
    clipDuration: 5,
    defaultDuration: 5,
    aspectRatioSizes: {
      "16:9": { width: 1920, height: 1080 },
      "9:16": { width: 1080, height: 1920 },
      "1:1": { width: 1440, height: 1440 },
    },
    supportsAudio: true,
    supportsAudioParam: false,
    supportsStartFrame: true,
    supportsEndFrame: true,
    supportsAudioReference: true,
    maxPromptLength: 1500,
    supportsNegativePrompt: true,
  },
  "kling-2.6": {
    id: "kling-2.6",
    label: "Kling 2.6",
    description: "Kualitas sinematik 1080p dengan lip-sync dan audio bawaan.",
    durations: [5, 10],
    maxTotalDuration: 60,
    clipDuration: 5,
    defaultDuration: 5,
    aspectRatioSizes: {
      "16:9": { width: 1920, height: 1080 },
      "9:16": { width: 1080, height: 1920 },
      "1:1": { width: 1440, height: 1440 },
    },
    supportsAudio: true,
    supportsAudioParam: true,
    supportsStartFrame: true,
    supportsEndFrame: false,
    supportsAudioReference: false,
    maxPromptLength: 2500,
    supportsNegativePrompt: false,
  },
  "bytedance/seedance-2.5": {
    id: "bytedance/seedance-2.5",
    label: "Seedance 2.5",
    description: "Video hingga 30 detik, mendukung end frame dan referensi audio.",
    durations: Array.from({ length: 27 }, (_, i) => i + 4),
    maxTotalDuration: 60,
    clipDuration: 5,
    defaultDuration: 8,
    aspectRatioSizes: {
      "16:9": { width: 1280, height: 720 },
      "9:16": { width: 720, height: 1280 },
      "1:1": { width: 1024, height: 1024 },
    },
    supportsAudio: true,
    supportsAudioParam: true,
    supportsStartFrame: true,
    supportsEndFrame: true,
    supportsAudioReference: true,
    maxPromptLength: 9999,
    supportsNegativePrompt: false,
  },
};

export const DEFAULT_VIDEO_MODEL: VideoModelId = "hailuo-03";

export function isVideoModelId(value: unknown): value is VideoModelId {
  return typeof value === "string" && value in VIDEO_MODELS;
}

export function resolveVideoModel(): VideoModelId {
  const configured = process.env.LEONARDO_VIDEO_MODEL;
  return isVideoModelId(configured) ? configured : DEFAULT_VIDEO_MODEL;
}

export const MAX_PROMPT_LENGTH = 5000;
export const MAX_TOTAL_DURATION = 60;
