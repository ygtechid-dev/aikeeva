import { Suspense } from "react";
import GeneratorClient from "./GeneratorClient";
import { requireSessionUser } from "@/lib/auth/guard";

async function GeneratorWithSession() {
  await requireSessionUser();
  return <GeneratorClient />;
}

export default function GeneratorPage() {
  return (
    <Suspense>
      <GeneratorWithSession />
    </Suspense>
  );
}
