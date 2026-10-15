"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TEMPLATES } from "@/lib/templates";

type Scene = {
  index: number;
  start: number;
  end: number;
  narration: string;
  visual: string;
};

type Phase = "input" | "scenario" | "video";

const MOCK_VISUALS = [
  "Close-up produk dengan pencahayaan dramatis, kamera perlahan zoom-in.",
  "Model utama menggunakan produk sambil tersenyum natural, tone hangat.",
  "Transisi cepat ke suasana lifestyle, slow-motion sinematik.",
  "Detail macro shot tekstur produk, background blur lembut.",
  "Testimoni pelanggan dengan teks overlay animasi.",
  "Wide shot lokasi, drone bergerak maju perlahan.",
];

const MOCK_NARRATIONS = [
  "Pernahkah kamu merasa butuh solusi yang benar-benar bekerja?",
  "Memperkenalkan terobosan terbaru yang mengubah segalanya.",
  "Dibuat dengan kualitas terbaik, dirancang khusus untukmu.",
  "Ribuan orang sudah membuktikan hasilnya.",
  "Dan sekarang, giliran kamu merasakannya.",
  "Dapatkan sekarang sebelum kehabisan — klik link di bawah!",
];

function fmt(sec: number) {
  return `00:${sec.toString().padStart(2, "0")}`;
}

function GeneratorInner() {
  const searchParams = useSearchParams();
  const template = TEMPLATES.find((t) => t.id === searchParams.get("template"));

  const [prompt, setPrompt] = useState(
    template
      ? `Iklan ${template.title}: ${template.description}`
      : ""
  );
  const [duration, setDuration] = useState(template?.duration ?? 30);
  const [style, setStyle] = useState("Sinematik");
  const [phase, setPhase] = useState<Phase>("input");
  const [loading, setLoading] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([]);

  const sceneCount = duration / 5;

  const generateScenario = () => {
    setLoading(true);
    // Mock: simulasi pemanggilan AI agent
    setTimeout(() => {
      const generated: Scene[] = Array.from({ length: sceneCount }, (_, i) => ({
        index: i,
        start: i * 5,
        end: (i + 1) * 5,
        narration: MOCK_NARRATIONS[i % MOCK_NARRATIONS.length],
        visual: MOCK_VISUALS[i % MOCK_VISUALS.length],
      }));
      setScenes(generated);
      setLoading(false);
      setPhase("scenario");
    }, 1800);
  };

  const generateVideo = () => {
    setLoading(true);
    // Mock: simulasi AI video generator
    setTimeout(() => {
      setLoading(false);
      setPhase("video");
    }, 2400);
  };

  const updateScene = (i: number, field: keyof Scene, value: string) => {
    setScenes((prev) =>
      prev.map((s) => (s.index === i ? { ...s, [field]: value } : s))
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      {/* Stepper */}
      <div className="flex items-center gap-2 text-xs font-semibold">
        {[
          { key: "input", label: "1. Prompt" },
          { key: "scenario", label: "2. Skenario AI" },
          { key: "video", label: "3. Video" },
        ].map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1.5 border transition-colors ${
                phase === s.key
                  ? "btn-primary text-white border-transparent"
                  : "border-border text-muted"
              }`}
            >
              {s.label}
            </span>
            {i < 2 && <span className="text-muted">→</span>}
          </div>
        ))}
      </div>

      <div className="mt-8 grid lg:grid-cols-[1fr_420px] gap-8">
        {/* LEFT: main panel */}
        <div>
          {phase === "input" && (
            <div className="card-soft rounded-2xl p-7">
              <h1 className="text-2xl font-bold">
                Ceritakan iklan yang kamu <span className="grad-text">inginkan</span>
              </h1>
              {template && (
                <p className="mt-2 text-sm text-accent">
                  Menggunakan template: <b>{template.title}</b> — ubah nama produk atau karakter sesukamu.
                </p>
              )}
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                placeholder="Contoh: Iklan kopi untuk anak muda, vibes pagi hari yang produktif, tone energik tapi cozy, highlight varian cold brew terbaru..."
                className="mt-5 w-full rounded-xl bg-background border border-border p-4 text-sm outline-none focus:border-primary resize-none placeholder:text-muted"
              />

              {/* Duration */}
              <div className="mt-6">
                <div className="flex justify-between text-sm">
                  <label className="font-semibold">Durasi video</label>
                  <span className="font-mono text-accent">{duration} detik</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={60}
                  step={5}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="mt-2 w-full accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted mt-1">
                  <span>5s</span>
                  <span>{sceneCount} segmen × 5 detik</span>
                  <span>60s</span>
                </div>
              </div>

              {/* Style */}
              <div className="mt-6">
                <label className="text-sm font-semibold">Gaya visual</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["Sinematik", "UGC / Natural", "Animasi 3D", "Minimalis", "Enerjik / Trendy"].map(
                    (s) => (
                      <button
                        key={s}
                        onClick={() => setStyle(s)}
                        className={`text-sm rounded-full px-4 py-2 border transition-colors ${
                          style === s
                            ? "border-primary bg-primary/15 text-foreground"
                            : "border-border text-muted hover:text-foreground"
                        }`}
                      >
                        {s}
                      </button>
                    )
                  )}
                </div>
              </div>

              <button
                onClick={generateScenario}
                disabled={!prompt.trim() || loading}
                className="mt-8 w-full btn-primary text-white font-semibold py-3.5 rounded-xl disabled:opacity-40 disabled:pointer-events-none "
              >
                {loading ? "🧠 AI Agent sedang menyusun skenario..." : "✨ Generate Skenario"}
              </button>
            </div>
          )}

          {phase === "scenario" && (
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">
                  Skenario dari <span className="grad-text">AI Agent</span>
                </h2>
                <button
                  onClick={() => setPhase("input")}
                  className="text-sm text-muted hover:text-foreground"
                >
                  ← Ubah prompt
                </button>
              </div>
              <p className="mt-1 text-sm text-muted">
                {sceneCount} segmen × 5 detik · {duration}s total · gaya {style}. Klik teks untuk mengedit.
              </p>

              <div className="mt-6 space-y-4">
                {scenes.map((s) => (
                  <div
                    key={s.index}
                    className="card-soft rounded-2xl p-5 flex gap-5 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex flex-col items-center">
                      <span className="text-xs font-mono text-accent whitespace-nowrap">
                        {fmt(s.start)} – {fmt(s.end)}
                      </span>
                      <span className="mt-2 h-full w-px bg-border" />
                    </div>
                    <div className="flex-1 grid md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted mb-1">
                          🎬 Visual
                        </p>
                        <textarea
                          value={s.visual}
                          onChange={(e) => updateScene(s.index, "visual", e.target.value)}
                          rows={3}
                          className="w-full bg-transparent text-sm outline-none resize-none rounded-lg border border-transparent focus:border-border p-1 -m-1"
                        />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted mb-1">
                          🎙️ Narasi
                        </p>
                        <textarea
                          value={s.narration}
                          onChange={(e) => updateScene(s.index, "narration", e.target.value)}
                          rows={3}
                          className="w-full bg-transparent text-sm outline-none resize-none rounded-lg border border-transparent focus:border-border p-1 -m-1 text-accent"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={generateVideo}
                disabled={loading}
                className="mt-8 w-full btn-primary text-white font-semibold py-3.5 rounded-xl disabled:opacity-40 "
              >
                {loading ? "🎥 AI Video Generator sedang merender..." : "🎥 Generate Video Iklan"}
              </button>
            </div>
          )}

          {phase === "video" && (
            <div className="card-soft rounded-2xl p-7 text-center ">
              <h2 className="text-xl font-bold">Video iklanmu siap! 🎉</h2>
              <p className="mt-2 text-sm text-muted">
                (Mock preview — integrasi video generator akan menggantikan ini)
              </p>
              <div className="mt-6 aspect-video rounded-xl bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center relative overflow-hidden">
                <div className="shimmer absolute inset-0" />
                <span className="relative text-6xl">▶</span>
                <span className="absolute bottom-3 right-3 text-xs font-mono bg-black/50 rounded px-2 py-1">
                  {fmt(duration)}
                </span>
              </div>
              <div className="mt-6 flex gap-3 justify-center">
                <button className="btn-primary text-white font-semibold px-6 py-3 rounded-xl">
                  ⬇ Download MP4
                </button>
                <button
                  onClick={() => setPhase("scenario")}
                  className="glass font-semibold px-6 py-3 rounded-xl"
                >
                  ✏️ Edit Skenario
                </button>
                <button
                  onClick={() => {
                    setPhase("input");
                    setScenes([]);
                  }}
                  className="glass font-semibold px-6 py-3 rounded-xl"
                >
                  🔄 Buat Baru
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: summary sidebar */}
        <aside className="space-y-5">
          <div className="card-soft rounded-2xl p-6">
            <h3 className="font-bold text-sm uppercase tracking-wider text-muted">
              Ringkasan
            </h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Durasi</dt>
                <dd className="font-mono text-accent">{duration}s</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Segmen</dt>
                <dd className="font-mono">{sceneCount} × 5s</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Gaya</dt>
                <dd>{style}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Format</dt>
                <dd>16:9 · 1080p</dd>
              </div>
            </dl>
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted line-clamp-3">
                {prompt || "Belum ada prompt."}
              </p>
            </div>
          </div>

          <div className="card-soft rounded-2xl p-6">
            <h3 className="font-bold text-sm uppercase tracking-wider text-muted">
              💡 Tips prompt bagus
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-muted list-disc list-inside">
              <li>Sebutkan produk & target audiens</li>
              <li>Tentukan mood: lucu, elegan, urgensi</li>
              <li>Sertakan hook 5 detik pertama</li>
              <li>Akhiri dengan call-to-action</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function GeneratorPage() {
  return (
    <Suspense>
      <GeneratorInner />
    </Suspense>
  );
}
