import { connection } from "next/server";
import { jsonError, jsonOk, toUserDto } from "@/lib/api/http";
import { getSessionUser } from "@/lib/auth/session";

export async function GET() {
  await connection();

  try {
    const user = await getSessionUser();
    return jsonOk({ user: user ? toUserDto(user) : null });
  } catch (error) {
    console.error("session read failed", error);
    return jsonError("Terjadi kesalahan pada server.", 500);
  }
}
