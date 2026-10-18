import { ApiError, jsonError, jsonOk, readJson, toUserDto } from "@/lib/api/http";
import { createSession } from "@/lib/auth/session";
import { AuthError, registerUser } from "@/lib/auth/users";

type Body = { email?: string; name?: string; password?: string };

export async function POST(request: Request) {
  try {
    const body = await readJson<Body>(request);
    const user = await registerUser({
      email: String(body.email ?? ""),
      name: String(body.name ?? ""),
      password: String(body.password ?? ""),
    });
    await createSession(user.id);
    return jsonOk({ user: toUserDto(user) }, 201);
  } catch (error) {
    if (error instanceof ApiError) return jsonError(error.message, error.status);
    if (error instanceof AuthError) return jsonError(error.message, error.status);
    console.error("register failed", error);
    return jsonError("Terjadi kesalahan pada server.", 500);
  }
}
