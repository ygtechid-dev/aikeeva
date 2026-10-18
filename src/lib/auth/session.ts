import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { execute, query } from "@/lib/db";

export const SESSION_COOKIE = "keeva_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type SessionRow = {
  session_id: string;
  user_id: number;
  email: string;
  name: string;
};

export type SessionUser = {
  id: number;
  email: string;
  name: string;
};

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  const id = tokenHash(token);

  await execute(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))",
    [id, userId, SESSION_TTL_SECONDS]
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE
      ? process.env.COOKIE_SECURE === "true"
      : process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await execute("DELETE FROM sessions WHERE id = ?", [tokenHash(token)]);
  }

  cookieStore.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const rows = await query<SessionRow & Record<string, unknown>>(
    `SELECT s.id AS session_id, u.id AS user_id, u.email, u.name
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > UTC_TIMESTAMP()
      LIMIT 1`,
    [tokenHash(token)]
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return { id: Number(row.user_id), email: row.email, name: row.name };
}
