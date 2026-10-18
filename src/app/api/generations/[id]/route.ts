import { requireUser } from "@/lib/api/auth";
import { ApiError, jsonError, jsonOk, toGenerationDto } from "@/lib/api/http";
import { getGenerationForUser } from "@/lib/generation/store";
import { syncGeneration } from "@/lib/generation/sync";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const record = await getGenerationForUser(id, user.id);
    if (!record) {
      return jsonError("Generation tidak ditemukan.", 404);
    }

    const synced = await syncGeneration(record);
    return jsonOk({ generation: toGenerationDto(synced) }, 200, { "cache-control": "no-store" });
  } catch (error) {
    if (error instanceof ApiError) return jsonError(error.message, error.status);
    console.error("get generation failed", error);
    return jsonError("Terjadi kesalahan pada server.", 500);
  }
}
