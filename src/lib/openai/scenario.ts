import { ApiError } from "@/lib/api/http";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4.1-mini";

export type ScenarioScene = {
  index: number;
  start: number;
  end: number;
  visual: string;
  narration: string;
};

export type ScenarioRequest = {
  prompt: string;
  duration: number;
  style?: string;
  language?: string;
  voiceTone?: string;
  template?: string;
  sceneLength?: number;
};

export class ScenarioError extends Error {
  constructor(
    message: string,
    public status = 502
  ) {
    super(message);
  }
}

function apiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new ScenarioError("OPENAI_API_KEY belum dikonfigurasi.", 500);
  }
  return key;
}

const SCENARIO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scenes"],
  properties: {
    scenes: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["start", "end", "visual", "narration"],
        properties: {
          start: { type: "integer", minimum: 0 },
          end: { type: "integer", minimum: 1 },
          visual: { type: "string", minLength: 20, maxLength: 900 },
          narration: { type: "string", maxLength: 400 },
        },
      },
    },
  },
} as const;

const AI_LOOK_WORDS = [
  "cinematic",
  "hyper-realistic",
  "hyperrealistic",
  "photorealistic",
  "ultra detailed",
  "ultrarealistic",
  "4k",
  "8k",
  "masterpiece",
  "award-winning",
  "best quality",
  "perfect",
  "flawless",
  "stunning",
  "breathtaking",
  "octane render",
  "unreal engine",
  "cg render",
  "artstation",
  "digital art",
  "studio lighting setup",
  "beauty filter",
  "airbrushed",
];

function buildSystemPrompt() {
  return [
    "You are a commercial director who shoots real footage with real people in real locations.",
    "Turn the user's brief into a shot-by-shot scenario that looks like genuine camera footage, not AI-generated video.",
    "Rules:",
    "- Scenes must be contiguous, start at 0, and cover exactly the requested total duration.",
    "- Write each visual as a practical shooting brief for a camera operator, in plain documentary English.",
    "- Each visual MUST mention: (1) shot size and camera movement, (2) a real capture device such as 'iPhone 15 Pro handheld' or 'Sony FX3 on a gimbal', (3) a real lens or focal length, (4) the actual light source (window light, overcast daylight, shop ceiling lights, practical lamps), (5) one small real-world imperfection such as slight handheld sway, imperfect framing, hair moving, background clutter or a passing person.",
    "- Describe people as ordinary humans: natural skin texture with visible pores, minimal or no makeup, asymmetric features, real clothing wrinkles, believable facial expression. Never describe models or 'perfect' faces.",
    "- Prefer available light and believable Indonesian locations written in English: a modest home kitchen, a neighborhood warung, a wet market stall, a front yard, a narrow alley, a small shop.",
    "- Keep visuals under 900 characters and easy to film.",
    "- Narration is a short spoken voice-over line in the requested language, one sentence max, spoken like a real person, not an announcer.",
    "- Keep visual descriptions in English; keep narration in the requested language.",
    "- Never invent pricing, health claims, or guarantees that are not in the brief.",
    "- Never request on-screen text, captions, logos, watermarks or brand graphics.",
    `- BANNED words (they make footage look AI-generated): ${AI_LOOK_WORDS.join(", ")}.`,
    "- Return only JSON matching the schema.",
  ].join("\n");
}

function buildUserPrompt(input: ScenarioRequest) {
  const lines = [
    `Brief: ${input.prompt}`,
    `Total duration: ${input.duration} seconds.`,
    `Target scene length: about ${input.sceneLength ?? 5} seconds per scene.`,
    "The result must look like real handheld/phone footage of real people, not a polished AI render.",
  ];
  if (input.style) lines.push(`Visual style: ${input.style}.`);
  if (input.template) lines.push(`Template reference: ${input.template}.`);
  lines.push(`Voice-over language: ${input.language ?? "Bahasa Indonesia"}.`);
  if (input.voiceTone) lines.push(`Voice-over tone: ${input.voiceTone}.`);
  return lines.join("\n");
}

type OpenAiResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string };
};

function stripAiLookWords(text: string): string {
  let result = text;
  for (const word of AI_LOOK_WORDS) {
    const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    result = result.replace(pattern, "");
  }
  return result.replace(/\s{2,}/g, " ").replace(/\s+([,.;])/g, "$1").trim();
}

function parseScenes(raw: string, duration: number): ScenarioScene[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ScenarioError("OpenAI mengembalikan JSON yang tidak valid.", 502);
  }

  const scenes = (parsed as { scenes?: unknown }).scenes;
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new ScenarioError("OpenAI tidak mengembalikan scene apa pun.", 502);
  }

  return scenes.map((item, index) => {
    const scene = item as Partial<ScenarioScene>;
    const start = Math.max(0, Math.round(Number(scene.start ?? index * 5)));
    const end = Math.min(duration, Math.round(Number(scene.end ?? start + 5)));
    return {
      index,
      start,
      end: end > start ? end : Math.min(duration, start + 1),
      visual: stripAiLookWords(String(scene.visual ?? "")),
      narration: String(scene.narration ?? "").trim(),
    };
  });
}

export async function generateScenario(input: ScenarioRequest): Promise<{
  scenes: ScenarioScene[];
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
}> {
  const baseUrl = (process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(input) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "video_scenario", strict: true, schema: SCENARIO_SCHEMA },
      },
    }),
  });

  const data = (await response.json()) as OpenAiResponse;

  if (!response.ok) {
    throw new ScenarioError(data.error?.message ?? `OpenAI error (${response.status}).`, 502);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new ScenarioError("OpenAI mengembalikan respons kosong.", 502);
  }

  return {
    scenes: parseScenes(content, input.duration),
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens ?? 0,
          completionTokens: data.usage.completion_tokens ?? 0,
          totalTokens: data.usage.total_tokens ?? 0,
        }
      : null,
  };
}

export function assertScenarioInput(input: ScenarioRequest) {
  if (!input.prompt.trim()) {
    throw new ApiError("Prompt wajib diisi.", 400);
  }
  if (!Number.isFinite(input.duration) || input.duration < 5 || input.duration > 60) {
    throw new ApiError("Durasi skenario harus antara 5 dan 60 detik.", 400);
  }
}
