import { randomUUID } from "node:crypto";
import { execute, query } from "@/lib/db";
import type { Scene } from "./prompt";

export type ClipStatus = "queued" | "pending" | "processing" | "complete" | "failed";

export type ClipRecord = {
  id: string;
  generationId: string;
  clipIndex: number;
  providerGenerationId: string | null;
  status: ClipStatus;
  compiledPrompt: string;
  negativePrompt: string | null;
  scenes: Scene[];
  videoUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

type Row = Record<string, unknown>;

const SELECT_COLUMNS = `
  id, generation_id, clip_index, provider_generation_id, status, compiled_prompt, negative_prompt,
  scenes, video_url, error_message, created_at, completed_at
`;

function parseScenes(value: unknown): Scene[] {
  if (!value) return [];
  if (typeof value === "object") return value as Scene[];
  try {
    return JSON.parse(String(value)) as Scene[];
  } catch {
    return [];
  }
}

function mapRow(row: Row): ClipRecord {
  return {
    id: String(row.id),
    generationId: String(row.generation_id),
    clipIndex: Number(row.clip_index),
    providerGenerationId: row.provider_generation_id ? String(row.provider_generation_id) : null,
    status: String(row.status) as ClipStatus,
    compiledPrompt: String(row.compiled_prompt),
    negativePrompt: row.negative_prompt ? String(row.negative_prompt) : null,
    scenes: parseScenes(row.scenes),
    videoUrl: row.video_url ? String(row.video_url) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: String(row.created_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

export async function createClips(
  generationId: string,
  clips: Array<{
    clipIndex: number;
    compiledPrompt: string;
    negativePrompt: string | null;
    scenes: Scene[];
  }>
): Promise<ClipRecord[]> {
  if (clips.length === 0) return [];

  const values: unknown[] = [];
  const placeholders = clips
    .map((clip) => {
      values.push(
        randomUUID(),
        generationId,
        clip.clipIndex,
        clip.compiledPrompt,
        clip.negativePrompt,
        JSON.stringify(clip.scenes)
      );
      return "(?, ?, ?, 'queued', ?, ?, ?)";
    })
    .join(", ");

  await execute(
    `INSERT INTO generation_clips (
        id, generation_id, clip_index, status, compiled_prompt, negative_prompt, scenes
     ) VALUES ${placeholders}`,
    values
  );

  return listClips(generationId);
}

export async function listClips(generationId: string): Promise<ClipRecord[]> {
  const rows = await query<Row>(
    `SELECT ${SELECT_COLUMNS} FROM generation_clips WHERE generation_id = ? ORDER BY clip_index ASC`,
    [generationId]
  );
  return rows.map(mapRow);
}

export async function updateClip(
  id: string,
  patch: {
    providerGenerationId?: string | null;
    status?: ClipStatus;
    videoUrl?: string | null;
    errorMessage?: string | null;
    completedAt?: "now" | null;
  }
): Promise<ClipRecord> {
  const assignments: string[] = [];
  const values: unknown[] = [];

  const set = (column: string, value: unknown) => {
    assignments.push(`${column} = ?`);
    values.push(value);
  };

  if (patch.providerGenerationId !== undefined) set("provider_generation_id", patch.providerGenerationId);
  if (patch.status !== undefined) set("status", patch.status);
  if (patch.videoUrl !== undefined) set("video_url", patch.videoUrl);
  if (patch.errorMessage !== undefined) set("error_message", patch.errorMessage);

  if (patch.completedAt === "now") {
    assignments.push("completed_at = UTC_TIMESTAMP()");
  } else if (patch.completedAt === null) {
    set("completed_at", null);
  }

  if (assignments.length > 0) {
    values.push(id);
    await execute(`UPDATE generation_clips SET ${assignments.join(", ")} WHERE id = ?`, values);
  }

  const rows = await query<Row>(`SELECT ${SELECT_COLUMNS} FROM generation_clips WHERE id = ? LIMIT 1`, [id]);
  if (!rows[0]) {
    throw new Error("Clip tidak ditemukan setelah update.");
  }
  return mapRow(rows[0]);
}
