import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { ApiError } from "./http";

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new ApiError("Silakan login terlebih dahulu.", 401);
  }
  return user;
}
