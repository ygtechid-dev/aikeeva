"use client";

import { useEffect, useRef, useState } from "react";
import { VOICE_LANGUAGES } from "@/lib/templates";

type GenerationStatus = "queued" | "pending" | "processing" | "complete" | "failed";

type GenerationDto = {
  id: string;
  model: string;
  status: GenerationStatus;
  progress: string | null;
  durationSeconds: number;
  aspectRatio: string;
  withAudio: boolean;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
};

type TalkModelOption = {
  id: string;
  label: string;
  description: string;
  durations: number[];
  aspectRatios: string[];
  supportsStartFrame: boolean;
  supportsAudioReference: boolean;
};

const FALLBACK_MODELS: TalkModelOption[] = [
  {
    id: "hailuo-03",
    label: "MiniMax Hailuo 03",
    description: "Gerakan natural dengan audio native & lip-sync terbaik.",
    durations: [5, 10, 15],
    aspectRatios: ["16:9", "9:16", "1:1"],
    supportsStartFrame: true,
    supportsAudioReference: true,
  },
  {
    id: "google/gemini-omni-1.1-flash-preview",
    label: "Gemini Omni 1.1 Flash",
    description: "Cepat & hemat, audio native, durasi 3–10 detik.",
    durations: [5, 10],
    aspectRatios: ["16:9", "9:16"],
    supportsStartFrame: true,
    supportsAudioReference: false,
  },
  {
    id: "wan-2.6",
    label: "Wan 2.6",
    description: "Alibaba Wan 2.6, mendukung referensi audio untuk lip-sync.",
    durations: [5, 10, 15],
    aspectRatios: ["16:9", "9:16", "1:1"],
    supportsStartFrame: true,
    supportsAudioReference: true,
  },
  {
    id: "bytedance/seedance-2.5",
    label: "Seedance 2.5",
    description: "Video hingga 30 detik, mendukung referensi audio.",
    durations: [5, 10, 15],
    aspectRatios: ["16:9", "9:16", "1:1"],
    supportsStartFrame: true,
    supportsAudioReference: true,
  },
];

const TALK_DURATIONS = [5, 10, 15];

const TTS_VOICES = [
  { id: "george", name: "George", gender: "Pria", tone: "Tenang & jelas" },
  { id: "adam", name: "Adam", gender: "Pria", tone: "Tegas & berwibawa" },
  { id: "jessica", name: "Jessica", gender: "Wanita", tone: "Ceria & ramah" },
  { id: "sarah", name: "Sarah", gender: "Wanita", tone: "Lembut & elegan" },
];

const STATUS_LABEL: Record<GenerationStatus, string> = {
  queued: "Dikirim ke antrean...",
  pending: "Menunggu slot render...",
  processing: "AI sedang merender video...",
  complete: "Video selesai",
  failed: "Render gagal",
};

export default function MotionClient() {
  const [models, setModels] = useState<TalkModelOption[]>(FALLBACK_MODELS);
  const [modelId, setModelId] = useState(FALLBACK_MODELS[0].id);
  const [duration, setDuration] = useState(5);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [script, setScript] = useState("");
  const [audioMode, setAudioMode] = useState<"native" | "tts">("native");
  const [language, setLanguage] = useState(VOICE_LANGUAGES[0]);
  const [voice, setVoice] = useState("george");
  const [photo, setPhoto] = useState<{ name: string; url: string; file?: File } | null>(null);
  const [phase, setPhase] = useState<"input" | "video">("input");
  const [loading, setLoading] = useState(false);
  const [generation, setGeneration] = useState<GenerationDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/models")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { models?: TalkModelOption[] } | null) => {
        const supported = data?.models?.filter((m) => m.supportsStartFrame);
        if (!cancelled && supported?.length) {
          setModels(supported);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedModel = models.find((m) => m.id === modelId) ?? models[0];
  const durationOptions = TALK_DURATIONS.filter((d) => selectedModel.durations.includes(d));
  const activeDuration = durationOptions.includes(duration) ? duration : (durationOptions[0] ?? 5);
  const ttsSupported = selectedModel.supportsAudioReference;

  const handleModelChange = (nextId: string) => {
    const next = models.find((m) => m.id === nextId) ?? models[0];
    setModelId(next.id);
    if (!next.aspectRatios.includes(aspectRatio)) {
      setAspectRatio(next.aspectRatios[0] ?? "9:16");
    }
    if (!next.supportsAudioReference && audioMode === "tts") {
      setAudioMode("native");
    }
  };

  const setPhotoFromFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(`"${file.name}" bukan file gambar.`);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(`"${file.name}" lebih dari 5MB.`);
      return;
    }
    setError(null);
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto({ name: file.name, url: URL.createObjectURL(file), file });
  };

  const clearPhoto = () => {
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
  };

  const pollGeneration = async (id: string) => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      try {
        const response = await fetch(`/api/generations/${id}`, { cache: "no-store" });
        if (!response.ok) continue;
        const data = (await response.json()) as { generation?: GenerationDto };
        if (!data.generation) continue;
        setGeneration(data.generation);
        if (data.generation.status === "complete" || data.generation.status === "failed") {
          return;
        }
      } catch {
        // keep polling on transient network errors
      }
    }
  };

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("model", modelId);
      form.append("script", script);
      form.append("duration", String(activeDuration));
      form.append("aspectRatio", aspectRatio);
      form.append("audioMode", audioMode);
      form.append("language", language);
      form.append("voice", voice);
      if (photo?.file) {
        form.append("photo", photo.file, photo.file.name);
      }

      const response = await fetch("/api/talk", { method: "POST", body: form });
      const data = (await response.json()) as { generation?: GenerationDto; error?: string };
      if (!response.ok || !data.generation) {
        setError(data.error ?? "Gagal memulai render video.");
        return;
      }

      setGeneration(data.generation);
      setPhase("video");
      void pollGeneration(data.generation.id);
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <span className="rounded-full px-3 py-1.5 border btn-primary text-white border-transparent">
          1. Foto &amp; Ucapan
        </span>
        <span className="text-muted">→</span>
        <span
          className={`rounded-full px-3 py-1.5 border transition-colors ${
            phase === "video" ? "btn-primary text-white border-transparent" : "border-border text-muted"
          }`}
        >
          2. Video
        </span>
      </div>

      <div className="mt-8 grid lg:grid-cols-[1fr_420px] gap-8">
        <div>
          {phase === "input" && (
            <div className="card-soft rounded-2xl p-7">
              <h1 className="text-2xl font-bold">
                Motion Control: <span className="grad-text">Bikin Foto Bicara</span>
              </h1>
              <p className="mt-2 text-sm text-muted">
                Upload 1 foto wajah, tulis teks ucapan — AI membuat foto itu berbicara
                dengan lip-sync dan suara AI.
              </p>

              {/* Foto wajah */}
              <div className="mt-6">
                <label className="text-sm font-semibold">1. Foto wajah (wajib)</label>
                <button
                  type="button"
                  onClick={() => photoRef.current?.click()}
                  className="mt-2 w-full rounded-xl border-2 border-dashed border-border p-5 text-center transition-colors hover:border-primary/60 hover:bg-primary/5"
                >
                  <div className="text-2xl">🙂</div>
                  <p className="mt-1 text-sm font-semibold">Upload foto wajah yang akan bicara</p>
                  <span className="mt-3 inline-block text-xs font-semibold text-primary border border-border rounded-lg px-3 py-1.5">
                    Pilih Foto
                  </span>
                  <p className="mt-2 text-[10px] text-muted">JPG / PNG · maks 5MB · 1 foto</p>
                </button>
                <input
                  ref={photoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    setPhotoFromFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                {photo && (
                  <div className="mt-3 flex items-center gap-3 rounded-xl border border-border p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.name}
                      className="h-20 w-20 rounded-lg object-cover border border-border"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs truncate">{photo.name}</p>
                      <button
                        type="button"
                        onClick={clearPhoto}
                        className="text-xs font-semibold text-red-600"
                      >
                        Hapus foto
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Teks ucapan */}
              <div className="mt-6">
                <div className="flex justify-between text-sm">
                  <label htmlFor="talk-script" className="font-semibold">
                    2. Teks ucapan
                  </label>
                  <span className="font-mono text-accent">{script.length}/1000</span>
                </div>
                <textarea
                  id="talk-script"
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="Contoh: Halo semuanya! Hari ini aku mau kenalin produk terbaru yang bikin hariku lebih mudah..."
                  className="mt-2 w-full rounded-xl bg-background border border-border p-4 text-sm outline-none focus:border-primary resize-none placeholder:text-muted"
                />
                <p className="mt-1 text-xs text-muted">
                  💡 Sesuaikan panjang teks dengan durasi video ({activeDuration}s ≈ {activeDuration * 4} kata).
                  Suara AI dibuat otomatis dari teks ini.
                </p>
              </div>

              {/* Sumber suara */}
              <div className="mt-6">
                <label className="text-sm font-semibold">3. Sumber suara</label>
                <div className="mt-2 grid sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAudioMode("native")}
                    className={`text-left rounded-xl border p-3 transition-colors ${
                      audioMode === "native"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <span className="block text-sm font-semibold">🎤 Suara model video</span>
                    <span className="block text-xs text-muted">
                      Model video yang bikin suaranya sendiri — hemat, tanpa biaya tambahan
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAudioMode("tts")}
                    disabled={!ttsSupported}
                    title={
                      ttsSupported
                        ? undefined
                        : `${selectedModel.label} tidak mendukung suara TTS`
                    }
                    className={`text-left rounded-xl border p-3 transition-colors ${
                      audioMode === "tts"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    } ${ttsSupported ? "" : "opacity-40 pointer-events-none"}`}
                  >
                    <span className="block text-sm font-semibold">🗣️ Suara AI presisi (TTS)</span>
                    <span className="block text-xs text-muted">
                      {ttsSupported
                        ? "Teks → suara AI → lip-sync lebih akurat · +biaya TTS"
                        : `Tidak didukung ${selectedModel.label} — pakai model lain`}
                    </span>
                  </button>
                </div>
              </div>

              {/* Suara & bahasa */}
              <div className="mt-6 grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="talk-language" className="text-sm font-semibold">
                    Bahasa
                  </label>
                  <select
                    id="talk-language"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="mt-2 w-full rounded-xl bg-background border border-border px-3 py-2.5 text-sm outline-none focus:border-primary"
                  >
                    {VOICE_LANGUAGES.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </div>
                {audioMode === "tts" && (
                  <div>
                    <label htmlFor="talk-voice" className="text-sm font-semibold">
                      Suara AI
                    </label>
                    <select
                      id="talk-voice"
                      value={voice}
                      onChange={(e) => setVoice(e.target.value)}
                      className="mt-2 w-full rounded-xl bg-background border border-border px-3 py-2.5 text-sm outline-none focus:border-primary"
                    >
                      {TTS_VOICES.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.gender}) — {v.tone}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Model + format */}
              <div className="mt-6 grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="talk-model" className="text-sm font-semibold">
                    Model video
                  </label>
                  <select
                    id="talk-model"
                    value={modelId}
                    onChange={(e) => handleModelChange(e.target.value)}
                    className="mt-2 w-full rounded-xl bg-background border border-border px-3 py-2.5 text-sm outline-none focus:border-primary"
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted">{selectedModel.description}</p>
                </div>
                <div>
                  <label htmlFor="talk-aspect" className="text-sm font-semibold">
                    Rasio
                  </label>
                  <select
                    id="talk-aspect"
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="mt-2 w-full rounded-xl bg-background border border-border px-3 py-2.5 text-sm outline-none focus:border-primary"
                  >
                    {selectedModel.aspectRatios.map((r) => (
                      <option key={r} value={r}>
                        {r === "9:16"
                          ? "9:16 (Story / Reels)"
                          : r === "16:9"
                            ? "16:9 (Landscape)"
                            : "1:1 (Square)"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Durasi */}
              <div className="mt-6">
                <label className="text-sm font-semibold">Durasi video</label>
                <div className="mt-2 flex gap-2">
                  {durationOptions.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDuration(d)}
                      className={`text-sm rounded-full px-4 py-2 border transition-colors ${
                        activeDuration === d
                          ? "border-primary bg-primary/15 text-foreground font-semibold"
                          : "border-border text-muted hover:text-foreground"
                      }`}
                    >
                      {d} detik
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )}

              <button
                onClick={generate}
                disabled={!photo?.file || !script.trim() || loading}
                className="mt-8 w-full btn-primary text-white font-semibold py-3.5 rounded-xl disabled:opacity-40 disabled:pointer-events-none"
              >
                {loading ? "🗣️ Membuat suara & merender..." : "🎬 Generate Motion Control"}
              </button>
              <p className="mt-2 text-center text-[10px] text-muted">
                {!photo?.file
                  ? "Upload foto wajah dulu"
                    : !script.trim()
                      ? "Isi teks ucapan dulu"
                      : audioMode === "tts"
                        ? "Teks → suara AI (TTS) → video lip-sync presisi"
                        : "Teks masuk prompt → model video bikin suara sendiri"}
              </p>
            </div>
          )}

          {phase === "video" && generation && (
            <div className="card-soft rounded-2xl p-7">
              <div className="text-center">
                <h2 className="text-xl font-bold">
                  {generation.status === "complete"
                    ? "Video fotomu sudah bicara! 🎉"
                    : generation.status === "failed"
                      ? "Render gagal 😔"
                      : "Sedang dirender..."}
                </h2>
                <p className="mt-2 text-sm text-muted">
                  {generation.model} · {generation.durationSeconds}s · {generation.aspectRatio} ·{" "}
                  {STATUS_LABEL[generation.status]}
                </p>
                {generation.errorMessage && (
                  <p className="mt-2 text-sm text-red-600">{generation.errorMessage}</p>
                )}
              </div>

              <div
                className={`mt-6 aspect-video rounded-xl overflow-hidden bg-black/5 flex items-center justify-center relative ${
                  generation.aspectRatio === "9:16" ? "mx-auto max-w-[280px] aspect-[9/16]" : ""
                }`}
              >
                {generation.status === "complete" && generation.videoUrl ? (
                  <video
                    src={generation.videoUrl}
                    poster={generation.thumbnailUrl ?? undefined}
                    controls
                    playsInline
                    className="h-full w-full object-contain bg-black"
                  />
                ) : generation.status === "failed" ? (
                  <span className="text-5xl">⚠️</span>
                ) : (
                  <>
                    <div className="shimmer absolute inset-0" />
                    <span className="relative text-xs font-semibold text-muted">
                      {STATUS_LABEL[generation.status]}
                    </span>
                  </>
                )}
              </div>

              <div className="mt-6 flex flex-wrap gap-3 justify-center">
                {generation.videoUrl && (
                  <a
                    href={generation.videoUrl}
                    download={`keeva-talk-${generation.id}.mp4`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary text-white font-semibold px-6 py-3 rounded-xl"
                  >
                    ⬇ Download MP4
                  </a>
                )}
                <button
                  onClick={() => {
                    setPhase("input");
                    setGeneration(null);
                  }}
                  className="card-soft font-semibold px-6 py-3 rounded-xl"
                >
                  🔄 Foto &amp; Ucapan Baru
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-5">
          <div className="card-soft rounded-2xl p-6">
            <h3 className="font-bold text-sm uppercase tracking-wider text-muted">Ringkasan</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Mode</dt>
                <dd>Motion Control</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Model</dt>
                <dd className="text-right">{selectedModel.label}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Durasi</dt>
                <dd className="font-mono text-accent">{activeDuration}s</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Format</dt>
                <dd>{aspectRatio}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Sumber suara</dt>
                <dd>{audioMode === "tts" ? "TTS presisi" : "Model video"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Bahasa</dt>
                <dd className="text-right">{language}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Suara</dt>
                <dd>
                  {audioMode === "tts"
                    ? (TTS_VOICES.find((v) => v.id === voice)?.name ?? "—")
                    : "dari model video"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Foto wajah</dt>
                <dd>{photo ? "✓ terupload" : "belum ada"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Ucapan</dt>
                <dd className="font-mono">{script.length} karakter</dd>
              </div>
            </dl>

            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted line-clamp-3">
                {script || "Belum ada teks ucapan."}
              </p>
            </div>
          </div>

          <div className="card-soft rounded-2xl p-6">
            <h3 className="font-bold text-sm uppercase tracking-wider text-muted">
              💡 Tips Motion Control
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-muted list-disc list-inside">
              <li>Pakai foto wajah jelas, menghadap kamera, pencahayaan cukup</li>
              <li>Satu wajah saja, tanpa tangan menutupi mulut</li>
              <li>Teks ucapan pendek sesuai durasi video</li>
              <li>Untuk iklan penuh dengan banyak scene, pakai halaman Generator</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
