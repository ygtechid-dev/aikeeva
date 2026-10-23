import type { AspectRatio, VideoModelId } from "@/lib/leonardo/models";
import { MAX_PROMPT_LENGTH, VIDEO_MODELS } from "@/lib/leonardo/models";
import { VOICES } from "@/lib/templates";

export type Scene = {
  index: number;
  start: number;
  end: number;
  narration?: string;
  visual: string;
};

export type GenerationOptions = {
  style?: string;
  bgm?: string;
  voiceEnabled?: boolean;
  voiceMode?: "ai" | "own";
  voiceId?: string;
  voiceSpeed?: number;
  voiceLanguage?: string;
  voiceFileName?: string;
  /** "talk" = motion control (lip-sync), "standard" = iklan biasa. */
  motionMode?: "talk" | "standard";
  /** Teks yang diucapkan saat motionMode = talk (akan dibuat TTS untuk lip-sync). */
  talkScript?: string;
  /** "native" = suara dari model video (hemat), "tts" = suara AI presisi via audio_reference. */
  audioMode?: "native" | "tts";
};

export type UnsupportedFeature = {
  feature: string;
  reason: string;
  payload: unknown;
};

export type CompileInput = {
  model: VideoModelId;
  aspectRatio: AspectRatio;
  duration: number;
  userPrompt: string;
  scenes: Scene[];
  options: GenerationOptions;
  hasEndFrame: boolean;
  clipIndex?: number;
  clipCount?: number;
};

export type CompiledPrompt = {
  prompt: string;
  negativePrompt: string | null;
  unsupportedFeatures: UnsupportedFeature[];
};

const STYLE_DIRECTIVES: Record<string, string> = {
  Sinematik:
    "shot on a Sony FX3 with a 35mm lens, shallow depth of field, natural film grain, practical location lighting, subtle handheld movement",
  "UGC / Natural":
    "shot on an iPhone 15 Pro handheld in vertical, available daylight, slightly imperfect framing, casual authentic delivery",
  "Animasi 3D":
    "stylized 3D animation, soft global illumination, expressive motion, consistent character design",
  Minimalis:
    "minimalist composition, clean negative space, calm restrained colors, soft window light, static camera",
  "Enerjik / Trendy":
    "handheld camera with quick natural movement, available light, vivid but true-to-life colors, real street locations",
};

/** Bahasa Inggris yang membuat hasil terlihat seperti render AI, bukan rekaman nyata. */
const AI_LOOK_TERMS = [
  "cinematic",
  "hyper-realistic",
  "photorealistic",
  "ultra detailed",
  "4k",
  "8k",
  "masterpiece",
  "award-winning",
  "perfect",
  "flawless",
  "stunning",
  "octane render",
  "unreal engine",
  "digital art",
  "airbrushed",
  "beauty filter",
  "smooth skin",
  "plastic skin",
  "glossy skin",
  "CGI",
  "render",
  "studio backdrop",
  "studio lighting setup",
  "studio lighting",
  "studio lights",
  "stock photo",
  "supermodel",
  "flawless face",
];

export const REALISM_DIRECTIVE =
  "Realism: real footage look, natural skin texture with visible pores and blemishes, minimal makeup, " +
  "ordinary everyday people, believable Indonesian location, available light from a real source, " +
  "slight handheld camera sway, imperfect natural framing, true-to-life colors, subtle motion blur, " +
  "natural film grain, smooth continuous natural motion without stutter or frame jumps. " +
  "Avoid any glossy, plastic, over-lit or AI-generated appearance. " +
  "No on-screen text, captions, logos or watermarks.";

const CONTINUITY_DIRECTIVE =
  "Continuity: keep the same subject, wardrobe, props, location and lighting as the previous part, " +
  "with one continuous camera move, no cuts, no scene change and no jump in time.";

const TALK_CONTINUITY_DIRECTIVE =
  "Continuity: the same person with the same face, clothing, framing, background and lighting as the " +
  "previous part, with natural continuous head and body movement and no cuts.";

export const REALISM_NEGATIVE_PROMPT =
  "AI generated look, CGI, 3D render, plastic skin, airbrushed skin, beauty filter, " +
  "over-smooth faces, waxy skin, over-saturated colors, HDR glow, unnatural lighting, " +
  "deformed hands, extra fingers, distorted face, warped text, subtitles, watermark, logo, " +
  "cartoon, anime, illustration, low quality, blurry, flickering, jittery morphing";

function stripAiLookTerms(text: string) {
  let result = text;
  for (const term of AI_LOOK_TERMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "");
  }

  return result
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/,\s*of\s+/gi, " of ")
    .replace(/\b(with|and|of|in|on|at|for)\s+(?=[,.;])/gi, "")
    .replace(/,\s*(with|and|of|in|on|at|for)\b/gi, ",")
    .replace(/\b(with|and|of)\s+(?=[a-z]+ing\b)/gi, "")
    .replace(/,\s*(?=[a-z])/g, (match, offset, full) => {
      const before = String(full).slice(0, offset);
      return /\b(shot|view|angle|close-up|frame)$/i.test(before.trim()) ? " of " : match;
    })
    .replace(/(,\s*){2,}/g, ", ")
    .replace(/,\s*([.;:])/g, "$1")
    .replace(/^[\s,;]+|[\s,;]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const BGM_MOODS: Record<string, string> = {
  upbeat: "upbeat energetic music",
  calm: "calm ambient music",
  corporate: "clean corporate background music",
  dramatic: "dramatic cinematic score",
};

function sanitize(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function sanitizeVisual(text: string) {
  return sanitize(stripAiLookTerms(text));
}

function voiceTone(voiceId: string | undefined) {
  const voice = VOICES.find((item) => item.id === voiceId);
  if (!voice) return "warm friendly voice";
  return `${voice.gender === "Pria" ? "male" : "female"} voice, ${voice.tone.toLowerCase()}`;
}

export function compilePrompt(input: CompileInput): CompiledPrompt {
  const spec = VIDEO_MODELS[input.model];
  const unsupported: UnsupportedFeature[] = [];
  const sections: string[] = [];
  const options = input.options;
  const isTalk = options.motionMode === "talk";

  const style = options.style ? STYLE_DIRECTIVES[options.style] ?? options.style : "";
  const part =
    input.clipCount && input.clipCount > 1
      ? ` This is part ${(input.clipIndex ?? 0) + 1} of ${input.clipCount}, continuing the same commercial.`
      : "";

  sections.push(
    sanitize(
      `A ${input.duration} second ${isTalk ? "talking portrait" : "commercial"} shot in ${input.aspectRatio} framing.` +
        (style ? ` Camera and look: ${style}.` : "") +
        part
    )
  );
  sections.push(REALISM_DIRECTIVE);

  const isMultiClip = Boolean(input.clipCount && input.clipCount > 1);
  if (isMultiClip) {
    sections.push(isTalk ? TALK_CONTINUITY_DIRECTIVE : CONTINUITY_DIRECTIVE);
  }

  if (isTalk) {
    const script = sanitize(options.talkScript ?? "");
    const tts = options.audioMode === "tts";
    const scene = sanitizeVisual(input.userPrompt);
    if (scene) {
      sections.push(`Scene: ${scene}`);
    }
    sections.push(
      script
        ? "Motion: the subject performs the scene above with natural body movement and facial expressions, and speaks with realistic lip movement synced to the spoken audio. Subtle head motion and natural blinks."
        : "Motion: the subject performs the scene above with natural body movement, subtle head motion, and natural blinks. The subject does not speak."
    );
    if (script) {
      sections.push(`Spoken line: "${script}"`);
      if (!tts) {
        const language = options.voiceLanguage ?? "Bahasa Indonesia";
        sections.push(
          `Audio: the subject speaks the spoken line above out loud in ${language} with their own voice, clear audible dialogue and natural lip sync. No background music.`
        );
      }
    } else if (!tts) {
      sections.push(
        "Audio: ambient sound only matching the scene. No dialogue, no voice-over, the subject keeps their mouth closed."
      );
    }
    if (tts && !spec.supportsAudioReference) {
      unsupported.push({
        feature: "motion_mode_talk",
        reason: `${spec.label} tidak mendukung audio_reference untuk suara TTS; teks ucapan ditulis ke prompt dan model men-generate audio sendiri.`,
        payload: { motionMode: "talk", talkScript: script || null },
      });
    }
    if (input.clipCount && input.clipCount > 1) {
      unsupported.push({
        feature: "motion_mode_talk_multi_clip",
        reason: "Mode Motion Control ideal untuk satu klip; klip lanjutan akan tetap menggunakan start frame wajah.",
        payload: { clipCount: input.clipCount },
      });
    }
    const limit = Math.min(spec.maxPromptLength, MAX_PROMPT_LENGTH);
    const prompt = sections.join("\n").slice(0, limit);
    return { prompt, negativePrompt: null, unsupportedFeatures: unsupported };
  }

  const scenes = input.scenes.filter((scene) => sanitize(scene.visual).length > 0);
  const narrationLines = scenes
    .map((scene) => sanitize(scene.narration ?? ""))
    .filter(Boolean);

  if (scenes.length === 0) {
    sections.push(`Scene: ${sanitizeVisual(input.userPrompt)}`);
  } else if (scenes.length === 1) {
    sections.push(`Scene: ${sanitizeVisual(scenes[0].visual)}`);
    if (narrationLines[0]) {
      sections.push(`Spoken line: "${narrationLines[0]}"`);
    }
  } else {
    sections.push(`One continuous clip built from ${scenes.length} connected beats, in order:`);
    for (const scene of scenes) {
      const narration = sanitize(scene.narration ?? "");
      sections.push(
        `- Beat ${scene.index + 1} (${scene.start}s-${scene.end}s): ${sanitizeVisual(scene.visual)}${
          narration ? ` Spoken line: "${narration}"` : ""
        }`
      );
    }
    unsupported.push({
      feature: "multi_scene_storyboard",
      reason: `${spec.label} membuat satu klip per request, jadi ${scenes.length} scene digabung menjadi satu prompt berurutan.`,
      payload: scenes,
    });
  }

  sections.push(`Brief: ${sanitizeVisual(input.userPrompt)}`);

  if (options.style) {
    unsupported.push({
      feature: "visual_style",
      reason: "Gaya visual tidak tersedia sebagai parameter model; dipindahkan ke prompt.",
      payload: { style: options.style },
    });
  }

  if (options.voiceEnabled) {
    if (options.voiceMode === "own") {
      unsupported.push({
        feature: "voiceover_custom_audio",
        reason: "Model video tidak menerima file audio voiceover; deskripsi suara ditulis ke prompt.",
        payload: { fileName: options.voiceFileName ?? null },
      });
      sections.push(
        "Audio: an authentic human voice-over in Bahasa Indonesia speaks the spoken lines above."
      );
    } else {
      const language = options.voiceLanguage ?? "Bahasa Indonesia";
      const pace =
        options.voiceSpeed === undefined
          ? "at a natural pace"
          : options.voiceSpeed < 90
            ? "slowly and calmly"
            : options.voiceSpeed > 110
              ? "with energetic fast pacing"
              : "at a natural pace";

      unsupported.push({
        feature: "voiceover_tts",
        reason:
          "Voiceover dihasilkan langsung oleh model video dari prompt (tanpa TTS terpisah), jadi aksen mengikuti kemampuan model.",
        payload: {
          voiceId: options.voiceId ?? null,
          language,
          speed: options.voiceSpeed ?? 100,
        },
      });

      sections.push(
        `Audio: a native ${language} speaker (${voiceTone(options.voiceId)}) says the spoken lines above ${pace}, with clear Indonesian pronunciation and natural lip sync.`
      );
    }

    if (options.bgm && options.bgm !== "none") {
      unsupported.push({
        feature: "background_music",
        reason: "BGM tidak bisa dipilih sebagai track terpisah; mood musik ditulis ke prompt.",
        payload: { bgm: options.bgm },
      });
      sections.push(`Background music: ${BGM_MOODS[options.bgm] ?? options.bgm}.`);
    }
  } else {
    sections.push("No speech, no voice-over.");
  }

  if (!spec.supportsAudio) {
    sections.push("No audio track.");
  }

  if (input.hasEndFrame && !spec.supportsEndFrame) {
    unsupported.push({
      feature: "end_frame",
      reason: `${spec.label} tidak mendukung end frame; hanya start frame yang dipakai.`,
      payload: null,
    });
  }

  const limit = Math.min(spec.maxPromptLength, MAX_PROMPT_LENGTH);
  const prompt = sections.join("\n").slice(0, limit);

  const negativePrompt = spec.supportsNegativePrompt
    ? REALISM_NEGATIVE_PROMPT.slice(0, 500)
    : null;

  if (!spec.supportsNegativePrompt && options.style) {
    unsupported.push({
      feature: "negative_prompt",
      reason: `${spec.label} tidak menerima negative prompt terpisah; instruksi anti-AI ditulis di prompt utama.`,
      payload: { negativePrompt: REALISM_NEGATIVE_PROMPT },
    });
  }

  return { prompt, negativePrompt, unsupportedFeatures: unsupported };
}
