import { execute, query } from "@/lib/db";
import { hashPassword, verifyPassword } from "./password";

type UserRow = {
  id: number;
  email: string;
  name: string;
  password_hash: string;
};

export type PublicUser = {
  id: number;
  email: string;
  name: string;
};

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function registerUser(input: { email: string; name: string; password: string }): Promise<PublicUser> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();

  if (!EMAIL_PATTERN.test(email)) {
    throw new AuthError("Format email tidak valid.", 400);
  }
  if (name.length < 2) {
    throw new AuthError("Nama minimal 2 karakter.", 400);
  }
  if (input.password.length < 8) {
    throw new AuthError("Password minimal 8 karakter.", 400);
  }

  const existing = await query<UserRow>("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
  if (existing.length > 0) {
    throw new AuthError("Email sudah terdaftar.", 409);
  }

  const passwordHash = await hashPassword(input.password);
  const result = await execute(
    "INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)",
    [email, name, passwordHash]
  );

  return { id: result.insertId, email, name };
}

export async function authenticateUser(emailInput: string, password: string): Promise<PublicUser> {
  const email = normalizeEmail(emailInput);
  const rows = await query<UserRow>(
    "SELECT id, email, name, password_hash FROM users WHERE email = ? LIMIT 1",
    [email]
  );

  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new AuthError("Email atau password salah.", 401);
  }

  return { id: Number(user.id), email: user.email, name: user.name };
}
