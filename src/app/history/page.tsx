import { Suspense } from "react";
import { requireSessionUser } from "@/lib/auth/guard";
import { listGenerationsForUser } from "@/lib/generation/store";
import { syncGeneration } from "@/lib/generation/sync";
import HistoryList, { type HistoryItem } from "./HistoryList";

async function HistoryContent() {
  const user = await requireSessionUser("/history");
  const records = await listGenerationsForUser(user.id, 50);

  const synced = await Promise.all(
    records.map(async (record) => {
      if (record.status === "complete" && record.videoUrl) return record;
      return syncGeneration(record).catch(() => record);
    })
  );

  const items: HistoryItem[] = synced.map((record) => ({
    id: record.id,
    model: record.model,
    status: record.status,
    progress: record.progress,
    prompt: record.userPrompt,
    durationSeconds: record.durationSeconds,
    aspectRatio: record.aspectRatio,
    videoUrl: record.videoUrl,
    thumbnailUrl: record.thumbnailUrl,
    errorMessage: record.errorMessage,
    createdAt: record.createdAt,
  }));

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Riwayat Generate</h1>
          <p className="mt-1 text-sm text-muted">
            {items.length} video milik {user.name}.
          </p>
        </div>
        <a
          href="/generator"
          className="btn-primary text-white text-sm font-semibold px-4 py-2.5 rounded-lg"
        >
          + Video Baru
        </a>
      </div>

      <HistoryList items={items} />
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="h-7 w-48 rounded bg-gray-100" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="card-soft rounded-2xl overflow-hidden">
            <div className="aspect-video bg-gray-100" />
            <div className="p-4 space-y-2">
              <div className="h-3 w-24 rounded bg-gray-100" />
              <div className="h-3 w-full rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<HistorySkeleton />}>
      <HistoryContent />
    </Suspense>
  );
}
