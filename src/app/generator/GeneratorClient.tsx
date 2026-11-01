"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TEMPLATES, VOICES, VOICE_LANGUAGES, BGM_OPTIONS } from "@/lib/templates";
import ImageUpload, { type RefImage } from "@/components/ImageUpload";

type Scene = {
  index: number;
  start: number;
  end: number;
  narration: string;
  visual: string;
};

type Phase = "input" | "scenario" | "video";

type GenerationStatus = "queued" | "pending" | "processing" | "complete" | "failed";

type UnsupportedFeature = {
  feature: string;
  reason: string;
  payload: unknown;
};

type GenerationDto = {
  id: string;
  model: string;
  status: GenerationStatus;
  progress: string | null;
  prompt: string;
  compiledPrompt: string;
  unsupportedFeatures: UnsupportedFeature[];
  durationSeconds: number;
  aspectRatio: string;
  width: number;
  height: number;
  withAudio: boolean;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type ModelOption = {
  id: string;
  label: string;
  description: string;
  durations: number[];
  clipDuration: number;
  maxTotalDuration: number;
  defaultDuration: number;
  aspectRatios: string[];
  supportsAudio: boolean;
};

function durationsFor(clipSeconds: number) {
  const out: number[] = [];
  for (let value = clipSeconds; value <= 60; value += clipSeconds) out.push(value);
  return out;
}

const FALLBACK_MODELS: ModelOption[] = [
  {
    id: "gemini-omni-flash",
    label: "Gemini Omni Flash",
    description: "Google Gemini Omni Flash, audio native, 3–10 detik per klip, paling hemat untuk UGC.",
    durations: durationsFor(5),
    clipDuration: 5,
    maxTotalDuration: 60,
    defaultDuration: 10,
    aspectRatios: ["16:9", "9:16", "1:1"],
    supportsAudio: true,
  },
  {
    id: "seedance-2.5",
    label: "Seedance 2.5",
    description: "ByteDance Seedance 2.5, kontrol paling detail, hingga 9 foto referensi.",
    durations: durationsFor(5),
    clipDuration: 5,
    maxTotalDuration: 60,
    defaultDuration: 10,
    aspectRatios: ["16:9", "9:16", "1:1"],
    supportsAudio: true,
  },
  {
    id: "seedance-2.0",
    label: "Seedance 2.0",
    description: "ByteDance Seedance 2.0, kontrol tinggi dengan prompt panjang.",
    durations: durationsFor(5),
    clipDuration: 5,
    maxTotalDuration: 60,
    defaultDuration: 10,
    aspectRatios: ["16:9", "9:16", "1:1"],
    supportsAudio: true,
  },
  {
    id: "seedance-2.0-fast",
    label: "Seedance 2.0 Fast",
    description: "Seedance 2.0 versi cepat dan lebih murah untuk testing.",
    durations: durationsFor(5),
    clipDuration: 5,
    maxTotalDuration: 60,
    defaultDuration: 10,
    aspectRatios: ["16:9", "9:16", "1:1"],
    supportsAudio: true,
  },
];

const STATUS_LABEL: Record<GenerationStatus, string> = {
  queued: "Dikirim ke antrean...",
  pending: "Menunggu slot render...",
  processing: "AI sedang merender video...",
  complete: "Video selesai",
  failed: "Render gagal",
};

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
  const [models, setModels] = useState<ModelOption[]>(FALLBACK_MODELS);
  const [modelId, setModelId] = useState(FALLBACK_MODELS[0].id);
  const [durationSelection, setDurationSelection] = useState<number | null>(null);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const selectedModel = models.find((m) => m.id === modelId) ?? models[0];
  const duration = selectedModel.durations.includes(durationSelection ?? -1)
    ? (durationSelection as number)
    : selectedModel.defaultDuration;
  const [style, setStyle] = useState("UGC / Natural");
  const [phase, setPhase] = useState<Phase>("input");
  const [loading, setLoading] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [moodImages, setMoodImages] = useState<RefImage[]>([]);
  const [characterImages, setCharacterImages] = useState<RefImage[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceMode] = useState<"ai" | "own">("ai");
  const [voiceId, setVoiceId] = useState(VOICES[0].id);
  const [voiceLang, setVoiceLang] = useState(VOICE_LANGUAGES[0]);
  const [voiceSpeed, setVoiceSpeed] = useState(100);
  const [bgm, setBgm] = useState("upbeat");
  const [generation, setGeneration] = useState<GenerationDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/models")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { models?: ModelOption[] } | null) => {
        if (!cancelled && data?.models?.length) {
          setModels(data.models);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedVoice = VOICES.find((v) => v.id === voiceId) ?? VOICES[0];
  const selectedBgm = BGM_OPTIONS.find((b) => b.id === bgm) ?? BGM_OPTIONS[0];

  const sceneCount = duration / 5;

  const generateScenario = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/scenario", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          duration,
          style,
          sceneLength: 5,
          language: voiceLang,
          voiceTone: selectedVoice.tone,
          template: template ? `${template.title} — ${template.description}` : undefined,
        }),
      });
      const data = (await response.json()) as { scenes?: Scene[]; error?: string };
      if (!response.ok || !data.scenes?.length) {
        setError(data.error ?? "Gagal menyusun skenario.");
        return;
      }
      setScenes(data.scenes);
      setPhase("scenario");
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setLoading(false);
    }
  };

  const generateVideo = async () => {
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("model", modelId);
      form.append("prompt", prompt);
      form.append("duration", String(duration));
      form.append("aspectRatio", aspectRatio);
      form.append("scenes", JSON.stringify(scenes));
      form.append(
        "options",
        JSON.stringify({
          style,
          bgm: voiceEnabled ? bgm : "none",
          voiceEnabled,
          voiceMode,
          voiceId,
          voiceSpeed,
          voiceLanguage: voiceLang,
        })
      );

      const modelImage = characterImages[0]?.file;
      if (modelImage) {
        form.append("modelImage", modelImage, modelImage.name);
      }
      const productImage = moodImages[0]?.file;
      if (productImage) {
        form.append("productImage", productImage, productImage.name);
      }

      const response = await fetch("/api/generations", { method: "POST", body: form });
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

  const pollGeneration = async (id: string) => {
    for (let attempt = 0; attempt < 720; attempt += 1) {
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

              {/* Foto model & produk */}
              <div className="mt-7 pt-6 border-t border-border">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-bold">Foto model &amp; produk</h2>
                    <p className="mt-1 text-xs text-muted">
                      Dipakai untuk membuat first frame otomatis. Semakin jelas fotonya,
                      semakin konsisten karakter dan produk di video.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid sm:grid-cols-2 gap-4">
                  <ImageUpload
                    label="Foto Model"
                    hint="Foto pertama dipakai sebagai identitas utama"
                    examples={[
                      "Wajah jelas, menghadap kamera",
                      "Tidak blur dan tidak terpotong",
                      "Pencahayaan natural",
                      "Pakaian dan gaya rambut terlihat jelas",
                    ]}
                    images={characterImages}
                    onChange={setCharacterImages}
                  />
                  <ImageUpload
                    label="Foto Produk"
                    hint="Foto pertama dipakai sebagai referensi produk"
                    examples={[
                      "Produk utuh, tidak terpotong",
                      "Label dan logo terbaca jelas",
                      "Warna produk natural",
                      "Bentuk dan tekstur terlihat detail",
                    ]}
                    images={moodImages}
                    onChange={setMoodImages}
                  />
                </div>
              </div>

              {/* Suara & audio */}
              <div className="mt-7 pt-6 border-t border-border">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-bold">Suara &amp; audio</h2>
                    <p className="mt-1 text-xs text-muted">
                      Audio dihasilkan langsung oleh model video (native). Pilih
                      karakter suara, bahasa, dan kecepatan bicara.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={voiceEnabled}
                    onClick={() => setVoiceEnabled((v) => !v)}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                      voiceEnabled ? "bg-primary" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
                        voiceEnabled ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>

                {voiceEnabled && (
                  <div className="mt-4 space-y-5">
                    {voiceMode === "ai" && (
                      <>
                        {/* Pilih suara */}
                        <div>
                          <label className="text-sm font-semibold">Pilih suara</label>
                          <div className="mt-2 grid sm:grid-cols-2 gap-2">
                            {VOICES.map((v) => (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => setVoiceId(v.id)}
                                className={`text-left rounded-xl border p-3 transition-colors ${
                                  voiceId === v.id
                                    ? "border-primary bg-primary/5"
                                    : "border-border hover:border-primary/50"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-sm">{v.name}</span>
                                  <span
                                    className={`text-[10px] rounded-full px-2 py-0.5 ${
                                      v.gender === "Pria"
                                        ? "bg-blue-100 text-blue-700"
                                        : "bg-pink-100 text-pink-700"
                                    }`}
                                  >
                                    {v.gender}
                                  </span>
                                </div>
                                <p className="mt-0.5 text-xs text-muted">{v.tone}</p>
                              </button>
                            ))}
                          </div>
                          <p className="mt-2 text-xs text-muted">
                            💡 {selectedVoice.description}
                          </p>
                        </div>

                        {/* Bahasa & kecepatan */}
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-semibold">Bahasa</label>
                            <select
                              value={voiceLang}
                              onChange={(e) => setVoiceLang(e.target.value)}
                              className="mt-2 w-full rounded-xl bg-background border border-border px-3 py-2.5 text-sm outline-none focus:border-primary"
                            >
                              {VOICE_LANGUAGES.map((l) => (
                                <option key={l}>{l}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <div className="flex justify-between text-sm">
                              <label className="font-semibold">Kecepatan</label>
                              <span className="font-mono text-accent">
                                {(voiceSpeed / 100).toFixed(2)}×
                              </span>
                            </div>
                            <input
                              type="range"
                              min={50}
                              max={150}
                              step={5}
                              value={voiceSpeed}
                              onChange={(e) => setVoiceSpeed(Number(e.target.value))}
                              className="mt-4 w-full accent-primary"
                            />
                            <div className="flex justify-between text-[10px] text-muted">
                              <span>Lambat</span>
                              <span>Cepat</span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Musik latar */}
                    <div>
                      <label className="text-sm font-semibold">
                        Musik latar (BGM)
                      </label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {BGM_OPTIONS.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => setBgm(b.id)}
                            className={`text-sm rounded-full px-4 py-2 border transition-colors ${
                              bgm === b.id
                                ? "border-primary bg-primary/5 text-foreground font-semibold"
                                : "border-border text-muted hover:text-foreground"
                            }`}
                          >
                            {b.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-muted">🎵 {selectedBgm.desc} · ditambahkan saat post-production</p>
                    </div>
                  </div>
                )}

              </div>

              {/* Model + format */}
              <div className="mt-6 grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="model" className="text-sm font-semibold">
                    Model video
                  </label>
                  <select
                    id="model"
                    value={modelId}
                    onChange={(e) => {
                      const next = models.find((m) => m.id === e.target.value) ?? selectedModel;
                      setModelId(next.id);
                      if (!next.aspectRatios.includes(aspectRatio)) {
                        setAspectRatio(next.aspectRatios[0] ?? "16:9");
                      }
                    }}
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
                  <label htmlFor="aspect" className="text-sm font-semibold">
                    Rasio
                  </label>
                  <select
                    id="aspect"
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="mt-2 w-full rounded-xl bg-background border border-border px-3 py-2.5 text-sm outline-none focus:border-primary"
                  >
                    {selectedModel.aspectRatios.map((ratio) => (
                      <option key={ratio} value={ratio}>
                        {ratio}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Duration */}
              <div className="mt-6">
                <div className="flex justify-between text-sm">
                  <label htmlFor="duration" className="font-semibold">
                    Durasi video
                  </label>
                  <span className="font-mono text-accent">{duration} detik</span>
                </div>
                <input
                  id="duration"
                  type="range"
                  min={selectedModel.clipDuration}
                  max={selectedModel.maxTotalDuration}
                  step={selectedModel.clipDuration}
                  value={duration}
                  onChange={(e) => setDurationSelection(Number(e.target.value))}
                  className="mt-2 w-full accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted mt-1">
                  <span>{selectedModel.clipDuration}s</span>
                  <span>
                    {Math.ceil(duration / selectedModel.clipDuration)} klip × {selectedModel.clipDuration}s · {selectedModel.label}
                  </span>
                  <span>{selectedModel.maxTotalDuration}s</span>
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

              {error && (
                <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )}

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
                {scenes.length} segmen · {duration}s total · gaya {style}. Klik teks untuk mengedit.
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

              {error && (
                <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )}

              <button
                onClick={generateVideo}
                disabled={loading}
                className="mt-8 w-full btn-primary text-white font-semibold py-3.5 rounded-xl disabled:opacity-40 "
              >
                {loading ? "🎥 Mengirim ke AI Video Generator..." : "🎥 Generate Video Iklan"}
              </button>
            </div>
          )}

          {phase === "video" && generation && (
            <div className="card-soft rounded-2xl p-7">
              <div className="text-center">
                <h2 className="text-xl font-bold">
                  {generation.status === "complete"
                    ? "Video iklanmu siap! 🎉"
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

              {generation.unsupportedFeatures.length > 0 && (
                <div className="mt-6 rounded-xl border border-border p-4 text-left">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Disimpan ke database
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Fitur berikut belum didukung sebagai parameter model, jadi disimpan bersama prompt:
                  </p>
                  <ul className="mt-2 space-y-2 text-xs">
                    {generation.unsupportedFeatures.map((feature) => (
                      <li key={feature.feature} className="rounded-lg bg-gray-50 p-2">
                        <span className="font-mono text-[10px] text-accent">{feature.feature}</span>
                        <span className="block text-muted">{feature.reason}</span>
                      </li>
                    ))}
                  </ul>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-muted">
                      Prompt yang dikirim ke model
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs">
                      {generation.compiledPrompt}
                    </pre>
                  </details>
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3 justify-center">
                {generation.videoUrl && (
                  <a
                    href={generation.videoUrl}
                    download={`keeva-${generation.id}.mp4`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary text-white font-semibold px-6 py-3 rounded-xl"
                  >
                    ⬇ Download MP4
                  </a>
                )}
                <button
                  onClick={() => setPhase("scenario")}
                  className="card-soft font-semibold px-6 py-3 rounded-xl"
                >
                  ✏️ Edit Skenario
                </button>
                <button
                  onClick={() => {
                    setPhase("input");
                    setScenes([]);
                    setGeneration(null);
                  }}
                  className="card-soft font-semibold px-6 py-3 rounded-xl"
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
                <dt className="text-muted">Model</dt>
                <dd className="text-right">{selectedModel.label}</dd>
              </div>
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
                <dd>{aspectRatio} · audio native</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Referensi</dt>
                <dd className="font-mono">
                  {moodImages.length + characterImages.length} foto
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Suara</dt>
                <dd className="text-right">
                  {voiceEnabled ? (
                    <>
                      {selectedVoice.name} (native)
                      <span className="block text-[10px] text-muted">
                        {voiceLang.split(" ")[0]} · {(voiceSpeed / 100).toFixed(2)}×
                      </span>
                    </>
                  ) : (
                    "Nonaktif"
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Musik</dt>
                <dd>{voiceEnabled ? selectedBgm.label : "—"}</dd>
              </div>
            </dl>

            {(moodImages.length > 0 || characterImages.length > 0) && (
              <div className="mt-4 flex gap-2">
                {[...moodImages, ...characterImages].slice(0, 6).map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={img.id}
                    src={img.url}
                    alt={img.name}
                    className="h-12 w-12 rounded-lg object-cover border border-border"
                  />
                ))}
              </div>
            )}

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
