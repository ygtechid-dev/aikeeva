import type { AspectRatio, VideoModelId } from "@/lib/kenari/models";
import { MAX_PROMPT_LENGTH, VIDEO_MODELS } from "@/lib/kenari/models";
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
  /** Dipertahankan untuk kompatibilitas data lama; Talk/TTS tidak dipakai lagi. */
  motionMode?: "talk" | "standard";
  talkScript?: string;
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
  hasFirstFrame: boolean;
  hasModelRef: boolean;
  hasProductRef: boolean;
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
    "smooth cinematic camera, 35mm lens, shallow depth of field, practical location lighting, natural film grain",
  "UGC / Natural":
    "raw iPhone 15 Pro handheld footage, available daylight, slightly imperfect framing, casual authentic delivery",
  "Animasi 3D":
    "stylized 3D animation, soft global illumination, expressive motion, consistent character design",
  Minimalis:
    "static camera, minimalist composition, clean negative space, calm restrained colors, soft window light",
  "Enerjik / Trendy":
    "handheld camera with quick natural movement, available light, vivid but true-to-life colors, real street locations",
};

const HANDHELD_STYLES = new Set(["UGC / Natural", "Enerjik / Trendy", "Sinematik"]);

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
  "Realism: raw phone-camera footage, natural skin texture with visible pores and micro-texture, " +
  "subtle under-eye texture, flyaway hair, small clothing wrinkles, realistic hand anatomy, " +
  "natural blinking and breathing, subtle autofocus and exposure breathing, mild sensor noise, " +
  "realistic motion blur, imperfect natural framing. " +
  "Avoid any glossy, plastic, over-lit, render or AI-generated appearance.";

export const REALISM_NEGATIVE_PROMPT =
  "identity drift, face distortion, plastic skin, airbrushed skin, beauty filter, waxy skin, " +
  "over-saturated colors, HDR glow, unnatural lighting, deformed hands, extra fingers, " +
  "warped product label, floating product, product morphing, background jump, over-polished ad look, " +
  "subtitles, captions, watermark, logo overlay, dead air, low quality, blurry, flickering";


function sanitize(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function stripAiLookTerms(text: string) {
  let result = text;
  for (const term of AI_LOOK_TERMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "");
  }
  return result.replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
}

function sanitizeVisual(text: string) {
  return sanitize(stripAiLookTerms(text));
}

function voiceTone(voiceId: string | undefined) {
  const voice = VOICES.find((item) => item.id === voiceId);
  if (!voice) return "warm friendly voice";
  return `${voice.gender === "Pria" ? "male" : "female"} voice, ${voice.tone.toLowerCase()}`;
}

function orientation(aspectRatio: AspectRatio) {
  if (aspectRatio === "9:16") return "vertical";
  if (aspectRatio === "16:9") return "horizontal";
  return "square";
}

function seconds(value: number) {
  return `${Number(value.toFixed(1))}s`;
}

export function compilePrompt(input: CompileInput): CompiledPrompt {
  const spec = VIDEO_MODELS[input.model];
  const unsupported: UnsupportedFeature[] = [];
  const sections: string[] = [];
  const options = input.options;
  const isMultiClip = Boolean(input.clipCount && input.clipCount > 1);

  const style = options.style ? STYLE_DIRECTIVES[options.style] ?? options.style : "";
  const handheld = options.style ? HANDHELD_STYLES.has(options.style) : true;
  const isAnimation = options.style === "Animasi 3D";
  const baseLook = isAnimation
    ? "stylized 3D animation"
    : options.style === "Sinematik"
      ? "cinematic real-footage style"
      : "raw phone-shot UGC style";
  const realism = isAnimation
    ? "Animation realism: consistent character design, soft global illumination, expressive motion, believable physics, no flicker or morphing."
    : REALISM_DIRECTIVE;
  const scenes = input.scenes.filter((scene) => sanitize(scene.visual).length > 0);
  const narrationLines = scenes.map((scene) => sanitize(scene.narration ?? "")).filter(Boolean);
  const hasDialogue = Boolean(options.voiceEnabled) && narrationLines.length > 0;

  // 1. Spec
  sections.push(
    sanitize(
      `Create a ${input.duration}-second ${orientation(input.aspectRatio)} ${input.aspectRatio} video in ${baseLook}.` +
        (hasDialogue
          ? " The subject speaks directly to camera with lip-synced dialogue in Bahasa Indonesia."
          : " No dialogue and no voice-over.") +
        (isMultiClip
          ? ` This is shot ${(input.clipIndex ?? 0) + 1} of ${input.clipCount}, continuing the same video.`
          : "")
    )
  );

  // 2. Reference declaration
  const refs: string[] = [];
  if (input.hasFirstFrame) {
    refs.push(
      "The provided start frame is the exact frame 0 of this shot. Preserve the character's face, skin tone, hair, body proportions, outfit, product, location, framing and lighting exactly. Do not reframe, re-light or change identity."
    );
  }
  if (input.hasModelRef) {
    refs.push(
      "The identity reference image defines the exact person: preserve face, facial proportions, skin tone, apparent age, hair and body proportions. Never blend, beautify, slim or replace this person."
    );
  }
  if (input.hasProductRef) {
    refs.push(
      "The product reference image defines the exact product: preserve shape, color, label text, packaging, proportions and visible details. Never warp, redesign or make the label illegible. The product's own label and logo are part of the product and must stay accurate; do not add any other text, captions, watermarks or graphic overlays."
    );
  }
  if (refs.length > 0) {
    sections.push(`Reference declaration:\n${refs.map((line) => `- ${line}`).join("\n")}`);
    sections.push(
      "Priority: identity and product references are authoritative. Never merge their roles or invent details that are not visible in them." +
        (input.hasModelRef && input.hasProductRef
          ? " Reference order: the identity reference is the first reference image; the product reference is the second reference image."
          : "")
    );
  }

  // 3. Context
  const context = [`Brief: ${sanitizeVisual(input.userPrompt)}`];
  if (isMultiClip) {
    context.push(
      "This shot is part of one continuous video: keep the same subject, wardrobe, product, location and lighting as the previous shot."
    );
  }
  context.push(
    "Must NOT show: software UI, laptops, screens, floating interfaces, added on-screen text, captions, subtitles, watermarks, borders or collage. The product's own label is allowed and must stay accurate."
  );
  sections.push(`Context:\n${context.map((line) => `- ${line}`).join("\n")}`);

  // 4. Global realism
  sections.push(`Global realism:\n- ${realism}`);

  // 5. Lighting
  sections.push(
    "Lighting: every light must have a clear real-world source, direction, falloff and matching shadows. " +
      "Use available daylight or practical room light; never studio beauty lighting or shadowless faces."
  );

  // 6. Beat breakdown
  const beats: string[] = [];
  if (scenes.length === 0) {
    beats.push(
      `- 0.0–${seconds(input.duration)} — ${sanitizeVisual(input.userPrompt)}. Natural micro-movements, realistic hand interaction, continuous subtle motion.`
    );
  } else {
    for (const scene of scenes) {
      const start = Math.max(0, Math.min(input.duration, scene.start));
      const end = Math.max(start + 0.5, Math.min(input.duration, scene.end));
      const narration = hasDialogue ? sanitize(scene.narration ?? "") : "";
      beats.push(
        `- ${seconds(start)}–${seconds(end)} — ${sanitizeVisual(scene.visual)}. ` +
          "Natural facial micro-expressions, believable hand movement and small body shifts." +
          (narration ? ` Dialogue: "${narration}".` : "")
      );
    }
    if (scenes.length > 1) {
      unsupported.push({
        feature: "multi_scene_storyboard",
        reason: `${spec.label} membuat satu klip per request, jadi ${scenes.length} beat digabung menjadi satu prompt berurutan.`,
        payload: scenes,
      });
    }
  }
  sections.push(`Breakdown:\n${beats.join("\n")}`);

  // 7. Camera + pacing
  sections.push(
    isAnimation
      ? "Camera: stylized animated camera with expressive, physically believable motion. No cuts mid-shot."
      : `Camera: ${
          handheld
            ? "handheld phone camera with natural micro-shake and imperfect framing"
            : "static phone camera with slight natural drift"
        }` +
          (style ? `, ${style}` : "") +
          ". Movement must be physically plausible from the start frame. Hard cuts only between beats; no dead air, no cinematic dolly, orbit, gimbal or dramatic zoom."
  );

  // 8. Audio
  if (hasDialogue) {
    const language = options.voiceLanguage ?? "Bahasa Indonesia";
    const pace =
      options.voiceSpeed === undefined
        ? "at a natural pace"
        : options.voiceSpeed < 90
          ? "slowly and calmly"
          : options.voiceSpeed > 110
            ? "with energetic fast pacing"
            : "at a natural pace";
    sections.push(
      `Audio: the subject speaks the dialogue above in ${language} (${voiceTone(options.voiceId)}) ${pace}, ` +
        "with native lip-sync and clear but not studio-clean phone audio. Ambient room sound only; no music, no voice-over, no subtitles."
    );
    unsupported.push({
      feature: "voiceover_tts",
      reason: "Kenari memakai audio native model; tidak ada TTS terpisah.",
      payload: { voiceId: options.voiceId ?? null, language, speed: options.voiceSpeed ?? 100 },
    });
  } else {
    sections.push(
      "Audio: ambient room sound only, with natural product handling sounds when relevant. No dialogue, no voice-over, no music."
    );
  }

  if (options.voiceEnabled && options.voiceMode === "own") {
    unsupported.push({
      feature: "voiceover_custom_audio",
      reason: "Backend Kenari tidak menerima file voiceover; suara dihasilkan model video (native).",
      payload: { fileName: options.voiceFileName ?? null },
    });
  }

  if (options.voiceEnabled && options.bgm && options.bgm !== "none") {
    unsupported.push({
      feature: "background_music",
      reason: "BGM tidak bisa dipilih sebagai track terpisah; musik ditambahkan saat post-production.",
      payload: { bgm: options.bgm },
    });
  }

  // 9. Rules + avoid
  sections.push(
    "Rules:\n" +
      "- Use the start frame as the exact starting point. Every movement must be plausible from that frame.\n" +
      "- Keep the same subject, outfit, product and location throughout this shot. Do not change scene, angle or framing mid-shot.\n" +
      "- The result must look like real footage recorded on a phone, not a polished cinematic ad."
  );
  sections.push(`Avoid: ${REALISM_NEGATIVE_PROMPT}.`);

  if (options.style) {
    unsupported.push({
      feature: "visual_style",
      reason: "Gaya visual tidak tersedia sebagai parameter model; dipindahkan ke prompt.",
      payload: { style: options.style },
    });
  }

  if (!spec.supportsNegativePrompt) {
    unsupported.push({
      feature: "negative_prompt",
      reason: `${spec.label} tidak menerima negative prompt terpisah; guardrail ditulis di prompt utama.`,
      payload: { negativePrompt: REALISM_NEGATIVE_PROMPT },
    });
  }

  const limit = Math.min(spec.maxPromptLength, MAX_PROMPT_LENGTH);
  const prompt = sections.join("\n\n").slice(0, limit);

  return { prompt, negativePrompt: null, unsupportedFeatures: unsupported };
}
