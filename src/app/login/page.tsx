import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import LoginShell from "./LoginClient";

async function LoginGate() {
  const user = await getSessionUser();
  if (user) {
    redirect("/generator");
  }
  return <LoginShell />;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-6 py-16 h-64" />}>
      <LoginGate />
    </Suspense>
  );
}
