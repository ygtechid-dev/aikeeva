"use client";

import { useState } from "react";

export type HistoryItem = {
  id: string;
  model: string;
  status: "queued" | "pending" | "processing" | "complete" | "failed";
  progress: string | null;
  prompt: string;
  durationSeconds: number;
  aspectRatio: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
};

const STATUS_STYLE: Record<HistoryItem["status"], string> = {
  queued: "bg-gray-100 text-gray-700",
  pending: "bg-amber-100 text-amber-800",
  processing: "bg-blue-100 text-blue-800",
  complete: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-700",
};

const STATUS_TEXT: Record<HistoryItem["status"], string> = {
  queued: "Antrean",
  pending: "Menunggu",
  processing: "Render",
  complete: "Selesai",
  failed: "Gagal",
};

function formatDate(value: string) {
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryList({ items }: { items: HistoryItem[] }) {
  const [active, setActive] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="mt-10 card-soft rounded-2xl p-10 text-center">
        <p className="text-4xl">🎬</p>
        <h2 className="mt-3 font-semibold">Belum ada video</h2>
        <p className="mt-1 text-sm text-muted">
          Video yang kamu generate akan muncul di sini.
        </p>
        <a
          href="/generator"
          className="mt-5 inline-block btn-primary text-white text-sm font-semibold px-5 py-2.5 rounded-lg"
        >
          Buat video pertama
        </a>
      </div>
    );
  }

  const selected = items.find((item) => item.id === active) ?? null;

  return (
    <>
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setActive(null)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl bg-background p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold truncate">{selected.prompt}</p>
              <button
                type="button"
                onClick={() => setActive(null)}
                className="text-sm text-muted hover:text-foreground"
              >
                Tutup
              </button>
            </div>
            <video
              src={selected.videoUrl ?? undefined}
              controls
              autoPlay
              playsInline
              className="mt-3 w-full rounded-xl bg-black max-h-[70vh]"
            />
            {selected.videoUrl && (
              <a
                href={selected.videoUrl}
                download={`keeva-${selected.id}.mp4`}
                className="mt-3 inline-block btn-primary text-white text-sm font-semibold px-4 py-2 rounded-lg"
              >
                ⬇ Download MP4
              </a>
            )}
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <article key={item.id} className="card-soft rounded-2xl overflow-hidden flex flex-col">
            <button
              type="button"
              onClick={() => item.videoUrl && setActive(item.id)}
              className="relative aspect-video bg-black/5 block w-full text-left"
              aria-label={item.videoUrl ? "Putar video" : "Video belum siap"}
            >
              {item.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.thumbnailUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-3xl">
                  {item.status === "failed" ? "⚠️" : item.videoUrl ? "▶" : "⏳"}
                </span>
              )}
              <span className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-0.5 text-[11px] font-mono text-white">
                {item.durationSeconds}s
              </span>
            </button>

            <div className="p-4 flex flex-col gap-2 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[item.status]}`}
                >
                  {STATUS_TEXT[item.status]}
                </span>
                <span className="text-[11px] text-muted">{item.model}</span>
              </div>

              <p className="text-sm line-clamp-2">{item.prompt}</p>

              <p className="text-[11px] text-muted">
                {formatDate(item.createdAt)} · {item.aspectRatio}
                {item.progress && item.status !== "complete" ? ` · ${item.progress}` : ""}
              </p>

              {item.errorMessage && (
                <p className="text-[11px] text-red-600 line-clamp-2">{item.errorMessage}</p>
              )}

              <div className="mt-auto pt-2 flex gap-2">
                <button
                  type="button"
                  disabled={!item.videoUrl}
                  onClick={() => setActive(item.id)}
                  className="flex-1 rounded-lg border border-border py-2 text-xs font-semibold disabled:opacity-40"
                >
                  Putar
                </button>
                {item.videoUrl && (
                  <a
                    href={item.videoUrl}
                    download={`keeva-${item.id}.mp4`}
                    className="flex-1 rounded-lg btn-primary py-2 text-center text-xs font-semibold text-white"
                  >
                    Download
                  </a>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
