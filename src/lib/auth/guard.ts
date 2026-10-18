import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/session";

export async function requireSessionUser(nextPath = "/generator"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return user;
}
