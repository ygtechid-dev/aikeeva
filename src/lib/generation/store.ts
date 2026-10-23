import { randomUUID } from "node:crypto";
import { execute, query } from "@/lib/db";
import type { UnsupportedFeature } from "./prompt";

export type GenerationStatus = "queued" | "pending" | "processing" | "complete" | "failed";

export type GenerationRecord = {
  id: string;
  userId: number;
  providerGenerationId: string | null;
  model: string;
  status: GenerationStatus;
  progress: string | null;
  userPrompt: string;
  compiledPrompt: string;
  unsupportedFeatures: UnsupportedFeature[];
  startFrameLeonardoId: string | null;
  endFrameLeonardoId: string | null;
  audioReferenceLeonardoId: string | null;
  voiceoverUrl: string | null;
  voiceoverGenerationId: string | null;
  voiceoverLanguage: string | null;
  voiceoverVoiceId: string | null;
  durationSeconds: number;
  aspectRatio: string;
  width: number;
  height: number;
  withAudio: boolean;
  requestPayload: unknown;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  apiCreditCost: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type Row = Record<string, unknown>;

const SELECT_COLUMNS = `
  id, user_id, provider_generation_id, model, status, progress, user_prompt, compiled_prompt,
  unsupported_features, start_frame_leonardo_id, end_frame_leonardo_id, audio_reference_leonardo_id,
  voiceover_url, voiceover_generation_id, voiceover_language, voiceover_voice_id,
  duration_seconds, aspect_ratio, width, height, with_audio, request_payload, video_url,
  thumbnail_url, api_credit_cost, error_message, created_at, updated_at, completed_at
`;

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

function mapRow(row: Row): GenerationRecord {
  return {
    id: String(row.id),
    userId: Number(row.user_id),
    providerGenerationId: row.provider_generation_id ? String(row.provider_generation_id) : null,
    model: String(row.model),
    status: String(row.status) as GenerationStatus,
    progress: row.progress ? String(row.progress) : null,
    userPrompt: String(row.user_prompt),
    compiledPrompt: String(row.compiled_prompt),
    unsupportedFeatures: parseJson<UnsupportedFeature[]>(row.unsupported_features, []),
    startFrameLeonardoId: row.start_frame_leonardo_id ? String(row.start_frame_leonardo_id) : null,
    endFrameLeonardoId: row.end_frame_leonardo_id ? String(row.end_frame_leonardo_id) : null,
    audioReferenceLeonardoId: row.audio_reference_leonardo_id
      ? String(row.audio_reference_leonardo_id)
      : null,
    voiceoverUrl: row.voiceover_url ? String(row.voiceover_url) : null,
    voiceoverGenerationId: row.voiceover_generation_id ? String(row.voiceover_generation_id) : null,
    voiceoverLanguage: row.voiceover_language ? String(row.voiceover_language) : null,
    voiceoverVoiceId: row.voiceover_voice_id ? String(row.voiceover_voice_id) : null,
    durationSeconds: Number(row.duration_seconds),
    aspectRatio: String(row.aspect_ratio),
    width: Number(row.width),
    height: Number(row.height),
    withAudio: Boolean(row.with_audio),
    requestPayload: parseJson<unknown>(row.request_payload, null),
    videoUrl: row.video_url ? String(row.video_url) : null,
    thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null,
    apiCreditCost: row.api_credit_cost === null ? null : Number(row.api_credit_cost),
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

export type NewGeneration = Omit<
  GenerationRecord,
  | "id"
  | "status"
  | "progress"
  | "requestPayload"
  | "videoUrl"
  | "thumbnailUrl"
  | "apiCreditCost"
  | "errorMessage"
  | "createdAt"
  | "updatedAt"
  | "completedAt"
> & {
  requestPayload: unknown;
};

export async function insertGeneration(input: NewGeneration): Promise<GenerationRecord> {
  const id = randomUUID();
  await execute(
    `INSERT INTO video_generations (
        id, user_id, provider_generation_id, model, status, user_prompt, compiled_prompt,
        unsupported_features, start_frame_leonardo_id, end_frame_leonardo_id,
        audio_reference_leonardo_id, voiceover_url, voiceover_generation_id, voiceover_language,
        voiceover_voice_id, duration_seconds, aspect_ratio, width, height, with_audio,
        request_payload
      ) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.userId,
      input.providerGenerationId,
      input.model,
      input.userPrompt,
      input.compiledPrompt,
      JSON.stringify(input.unsupportedFeatures),
      input.startFrameLeonardoId,
      input.endFrameLeonardoId,
      input.audioReferenceLeonardoId,
      input.voiceoverUrl,
      input.voiceoverGenerationId,
      input.voiceoverLanguage,
      input.voiceoverVoiceId,
      input.durationSeconds,
      input.aspectRatio,
      input.width,
      input.height,
      input.withAudio ? 1 : 0,
      JSON.stringify(input.requestPayload ?? null),
    ]
  );

  const record = await getGenerationById(id);
  if (!record) {
    throw new Error("Gagal menyimpan generation.");
  }
  return record;
}

export async function getGenerationById(id: string): Promise<GenerationRecord | null> {
  const rows = await query<Row>(`SELECT ${SELECT_COLUMNS} FROM video_generations WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function getGenerationForUser(id: string, userId: number): Promise<GenerationRecord | null> {
  const rows = await query<Row>(
    `SELECT ${SELECT_COLUMNS} FROM video_generations WHERE id = ? AND user_id = ? LIMIT 1`,
    [id, userId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function listGenerationsForUser(userId: number, limit = 30): Promise<GenerationRecord[]> {
  const rows = await query<Row>(
    `SELECT ${SELECT_COLUMNS} FROM video_generations
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?`,
    [userId, Math.min(Math.max(limit, 1), 100)]
  );
  return rows.map(mapRow);
}

export async function updateGeneration(
  id: string,
  patch: {
    providerGenerationId?: string | null;
    status?: GenerationStatus;
    progress?: string | null;
    videoUrl?: string | null;
    thumbnailUrl?: string | null;
    voiceoverUrl?: string | null;
    voiceoverGenerationId?: string | null;
    voiceoverLanguage?: string | null;
    voiceoverVoiceId?: string | null;
    durationSeconds?: number;
    apiCreditCost?: number | null;
    errorMessage?: string | null;
    completedAt?: "now" | null;
  }
) {
  const assignments: string[] = [];
  const values: unknown[] = [];

  const set = (column: string, value: unknown) => {
    assignments.push(`${column} = ?`);
    values.push(value);
  };

  if (patch.providerGenerationId !== undefined) set("provider_generation_id", patch.providerGenerationId);
  if (patch.status !== undefined) set("status", patch.status);
  if (patch.progress !== undefined) set("progress", patch.progress);
  if (patch.videoUrl !== undefined) set("video_url", patch.videoUrl);
  if (patch.thumbnailUrl !== undefined) set("thumbnail_url", patch.thumbnailUrl);
  if (patch.voiceoverUrl !== undefined) set("voiceover_url", patch.voiceoverUrl);
  if (patch.voiceoverGenerationId !== undefined) set("voiceover_generation_id", patch.voiceoverGenerationId);
  if (patch.voiceoverLanguage !== undefined) set("voiceover_language", patch.voiceoverLanguage);
  if (patch.voiceoverVoiceId !== undefined) set("voiceover_voice_id", patch.voiceoverVoiceId);
  if (patch.durationSeconds !== undefined) set("duration_seconds", patch.durationSeconds);
  if (patch.apiCreditCost !== undefined) set("api_credit_cost", patch.apiCreditCost);
  if (patch.errorMessage !== undefined) set("error_message", patch.errorMessage);

  if (patch.completedAt === "now") {
    assignments.push("completed_at = UTC_TIMESTAMP()");
  } else if (patch.completedAt === null) {
    set("completed_at", null);
  }

  if (assignments.length > 0) {
    values.push(id);
    await execute(`UPDATE video_generations SET ${assignments.join(", ")} WHERE id = ?`, values);
  }

  const record = await getGenerationById(id);
  if (!record) {
    throw new Error("Generation tidak ditemukan setelah update.");
  }
  return record;
}
