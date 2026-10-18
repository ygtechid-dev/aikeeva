import { jsonError, jsonOk } from "@/lib/api/http";
import { destroySession } from "@/lib/auth/session";

export async function POST() {
  try {
    await destroySession();
    return jsonOk({ ok: true });
  } catch (error) {
    console.error("logout failed", error);
    return jsonError("Terjadi kesalahan pada server.", 500);
  }
}
