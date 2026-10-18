import { ApiError, jsonError, jsonOk, readJson, toUserDto } from "@/lib/api/http";
import { createSession } from "@/lib/auth/session";
import { AuthError, authenticateUser } from "@/lib/auth/users";

type Body = { email?: string; password?: string };

export async function POST(request: Request) {
  try {
    const body = await readJson<Body>(request);
    const user = await authenticateUser(String(body.email ?? ""), String(body.password ?? ""));
    await createSession(user.id);
    return jsonOk({ user: toUserDto(user) });
  } catch (error) {
    if (error instanceof ApiError) return jsonError(error.message, error.status);
    if (error instanceof AuthError) return jsonError(error.message, error.status);
    console.error("login failed", error);
    return jsonError("Terjadi kesalahan pada server.", 500);
  }
}
