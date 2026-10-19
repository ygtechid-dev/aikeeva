import { Suspense } from "react";
import MotionClient from "./MotionClient";
import { requireSessionUser } from "@/lib/auth/guard";

async function MotionWithSession() {
  await requireSessionUser();
  return <MotionClient />;
}

export default function MotionPage() {
  return (
    <Suspense>
      <MotionWithSession />
    </Suspense>
  );
}
