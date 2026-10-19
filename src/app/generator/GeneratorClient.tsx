"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TEMPLATES, VOICES, VOICE_LANGUAGES, BGM_OPTIONS } from "@/lib/templates";
import { MOTION_MODES } from "@/lib/generation/prompt";
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
    id: "hailuo-03",
    label: "MiniMax Hailuo 03",
    description: "MiniMax Hailuo 03, gerakan natural dengan audio native, 5–15 detik per klip.",
    durations: durationsFor(5),
    clipDuration: 5,
    maxTotalDuration: 60,
    defaultDuration: 5,
    aspectRatios: ["16:9", "9:16", "1:1"],
    supportsAudio: true,
  },
  {
    id: "wan-2.6",
    label: "Wan 2.6",
    description: "Alibaba Wan 2.6, mendukung audio, start/end frame, dan referensi audio.",
    durations: durationsFor(5),
    clipDuration: 5,
    maxTotalDuration: 60,
    defaultDuration: 5,
    aspectRatios: ["16:9", "9:16", "1:1"],
    supportsAudio: true,
  },
  {
    id: "kling-2.6",
    label: "Kling 2.6",
    description: "Kualitas sinematik 1080p dengan lip-sync dan audio bawaan.",
    durations: durationsFor(5),
    clipDuration: 5,
    maxTotalDuration: 60,
    defaultDuration: 5,
    aspectRatios: ["16:9", "9:16", "1:1"],
    supportsAudio: true,
  },
  {
    id: "bytedance/seedance-2.5",
    label: "Seedance 2.5",
    description: "Video hingga 60 detik, mendukung end frame dan referensi audio.",
    durations: durationsFor(5),
    clipDuration: 5,
    maxTotalDuration: 60,
    defaultDuration: 8,
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
  const [withAudio, setWithAudio] = useState(true);
  const selectedModel = models.find((m) => m.id === modelId) ?? models[0];
  const duration = selectedModel.durations.includes(durationSelection ?? -1)
    ? (durationSelection as number)
    : selectedModel.defaultDuration;
  const [style, setStyle] = useState("Sinematik");
  const [phase, setPhase] = useState<Phase>("input");
  const [loading, setLoading] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [moodImages, setMoodImages] = useState<RefImage[]>([]);
  const [characterImages, setCharacterImages] = useState<RefImage[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceMode, setVoiceMode] = useState<"ai" | "own">("ai");
  const [voiceId, setVoiceId] = useState(VOICES[0].id);
  const [voiceLang, setVoiceLang] = useState(VOICE_LANGUAGES[0]);
  const [voiceSpeed, setVoiceSpeed] = useState(100);
  const [bgm, setBgm] = useState("upbeat");
  const [voiceFile, setVoiceFile] = useState<{ name: string; url: string; file?: File } | null>(null);
  const [motionMode, setMotionMode] = useState<"talk" | "standard">("standard");
  const [talkScript, setTalkScript] = useState("");
  const [talkAudioFile, setTalkAudioFile] = useState<{ name: string; url: string; file?: File } | null>(null);
  const talkAudioRef = useRef<HTMLInputElement>(null);
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [generation, setGeneration] = useState<GenerationDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const voiceFileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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
      form.append("withAudio", String(withAudio && selectedModel.supportsAudio));
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
          voiceFileName: voiceFile?.name,
          motionMode,
          talkScript: motionMode === "talk" ? talkScript : undefined,
        })
      );

      const reference = characterImages[0]?.file ?? moodImages[0]?.file;
      if (reference) {
        form.append("startFrame", reference, reference.name);
      }

      if (motionMode === "talk" && talkAudioFile?.file) {
        form.append("talkAudio", talkAudioFile.file, talkAudioFile.file.name);
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

  const updateScene = (i: number, field: keyof Scene, value: string) => {
    setScenes((prev) =>
      prev.map((s) => (s.index === i ? { ...s, [field]: value } : s))
    );
  };

  const setVoiceFromFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setRecordError(`"${file.name}" bukan file audio.`);
      return;
    }
    setRecordError(null);
    if (voiceFile) URL.revokeObjectURL(voiceFile.url);
    setVoiceFile({ name: file.name, url: URL.createObjectURL(file) });
  };

  const startRecording = async () => {
    setRecordError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordError("Browser ini tidak mendukung perekaman mikrofon.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        if (voiceFile) URL.revokeObjectURL(voiceFile.url);
        setVoiceFile({
          name: `rekaman-${Date.now()}.webm`,
          url: URL.createObjectURL(blob),
        });
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setRecordError("Tidak bisa mengakses mikrofon. Cek izin browser.");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const clearVoiceFile = () => {
    if (voiceFile) URL.revokeObjectURL(voiceFile.url);
    setVoiceFile(null);
    setRecordError(null);
  };

  const setTalkAudioFromFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setRecordError(`"${file.name}" bukan file audio.`);
      return;
    }
    setRecordError(null);
    if (talkAudioFile) URL.revokeObjectURL(talkAudioFile.url);
    setTalkAudioFile({ name: file.name, url: URL.createObjectURL(file), file });
  };

  const clearTalkAudioFile = () => {
    if (talkAudioFile) URL.revokeObjectURL(talkAudioFile.url);
    setTalkAudioFile(null);
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

              {/* Referensi foto */}
              <div className="mt-7 pt-6 border-t border-border">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-bold">Foto referensi (opsional)</h2>
                    <p className="mt-1 text-xs text-muted">
                      Tidak jago nulis prompt? Cukup upload foto — AI akan mengikuti
                      suasana dan karakter dari gambarmu.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid sm:grid-cols-2 gap-4">
                  <ImageUpload
                    label="Suasana / Mood"
                    hint="Latar, lokasi, atau nuansa yang kamu mau"
                    examples={[
                      "Latar cafe pagi hari dengan cahaya hangat",
                      "Studio minimalis dengan background putih",
                      "Pantai saat golden hour",
                      "Kantor modern dengan nuansa profesional",
                    ]}
                    images={moodImages}
                    onChange={setMoodImages}
                  />
                  <ImageUpload
                    label="Karakter / Model"
                    hint="Orang yang tampil di video iklanmu"
                    examples={[
                      "Wajah model atau talent yang kamu inginkan",
                      "Pakaian / outfit yang harus dipakai",
                      "Produk yang dipegang model",
                      "Gaya rambut dan makeup referensi",
                    ]}
                    images={characterImages}
                    onChange={setCharacterImages}
                  />
                </div>
              </div>

              {/* Motion Control */}
              <div className="mt-7 pt-6 border-t border-border">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-bold">Motion Control</h2>
                    <p className="mt-1 text-xs text-muted">
                      Pilih mode gerakan. <b>Foto Ngomong</b> membuat foto wajah berbicara dengan lip-sync.
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid sm:grid-cols-2 gap-2 p-1 rounded-xl bg-gray-100">
                  {MOTION_MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMotionMode(m.id)}
                      className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                        motionMode === m.id
                          ? "bg-card shadow-sm text-foreground"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      {m.id === "talk" ? "🎙️" : "🎬"} {m.label}
                    </button>
                  ))}
                </div>

                {motionMode === "talk" && (
                  <div className="mt-4 space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
                    <p className="text-xs text-muted">
                      Mode <b>Foto Ngomong</b> aktif. Upload <b>satu foto wajah</b> di kolom
                      &ldquo;Karakter / Model&rdquo; di atas, lalu isi teks ucapan atau upload audio di bawah.
                      Hanya klip pertama (5 detik) yang dipakai untuk lip-sync.
                    </p>

                    <div>
                      <label className="text-sm font-semibold">Teks ucapan</label>
                      <textarea
                        value={talkScript}
                        onChange={(e) => setTalkScript(e.target.value)}
                        rows={3}
                        placeholder="Contoh: Halo semua, hari ini aku mau kasih tau produk favoritku..."
                        className="mt-2 w-full rounded-xl bg-background border border-border p-3 text-sm outline-none focus:border-primary resize-none placeholder:text-muted"
                      />
                      <p className="mt-1 text-xs text-muted">
                        Teks ini dipakai model untuk menggerakkan mulut. Jika upload audio, teks diabaikan.
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-semibold">Audio ucapan (opsional)</label>
                      <div className="mt-2 rounded-xl border border-dashed border-border p-4 text-center">
                        <div className="text-2xl">🗣️</div>
                        <p className="mt-1 text-xs text-muted">
                          Upload audio sendiri untuk lip-sync yang lebih akurat
                        </p>
                        <button
                          type="button"
                          onClick={() => talkAudioRef.current?.click()}
                          className="mt-3 text-xs font-semibold text-primary border border-border rounded-lg px-3 py-2 bg-card"
                        >
                          📁 Pilih Audio Ucapan
                        </button>
                        <p className="mt-2 text-[10px] text-muted">MP3 / WAV / M4A · maks 25MB · ≤ 15 detik</p>
                      </div>

                      {talkAudioFile && (
                        <div className="mt-2 rounded-xl border border-border p-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs truncate">🎧 {talkAudioFile.name}</span>
                            <button
                              type="button"
                              onClick={clearTalkAudioFile}
                              className="text-xs font-semibold text-red-600 shrink-0"
                            >
                              Hapus
                            </button>
                          </div>
                          <audio src={talkAudioFile.url} controls className="mt-2 w-full h-9" />
                        </div>
                      )}
                    </div>

                    {(characterImages.length === 0 && moodImages.length === 0) && (
                      <p className="text-xs text-red-600">
                        ⚠️ Wajib upload minimal 1 foto wajah di &ldquo;Karakter / Model&rdquo;.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Voiceover */}
              <div className="mt-7 pt-6 border-t border-border">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-bold">Voiceover</h2>
                    <p className="mt-1 text-xs text-muted">
                      Pakai suara AI, atau unggah/rekam suaramu sendiri untuk di-mix
                      dengan musik.
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
                    {/* Mode suara */}
                    <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-gray-100">
                      {[
                        { key: "ai" as const, label: "🤖 Suara AI" },
                        { key: "own" as const, label: "🎙️ Suara Sendiri" },
                      ].map((m) => (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => setVoiceMode(m.key)}
                          className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                            voiceMode === m.key
                              ? "bg-card shadow-sm text-foreground"
                              : "text-muted hover:text-foreground"
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

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

                    {voiceMode === "own" && (
                      <div className="space-y-4">
                        <div className="rounded-xl border border-dashed border-border p-5 text-center">
                          <div className="text-2xl">🎙️</div>
                          <p className="mt-2 text-sm font-semibold">
                            Unggah atau rekam suaramu
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            Suaramu akan dipakai sebagai narasi voiceover dan di-mix
                            dengan musik pilihanmu. AI cukup menyesuaikan durasi tiap
                            segmen.
                          </p>

                          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => voiceFileRef.current?.click()}
                              className="text-xs font-semibold text-primary border border-border rounded-lg px-3 py-2 bg-card"
                            >
                              📁 Pilih File Audio
                            </button>
                            {!recording ? (
                              <button
                                type="button"
                                onClick={startRecording}
                                className="text-xs font-semibold text-white bg-red-600 rounded-lg px-3 py-2"
                              >
                                ⏺ Rekam Sekarang
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={stopRecording}
                                className="text-xs font-semibold text-white bg-gray-900 rounded-lg px-3 py-2 animate-pulse"
                              >
                                ⏹ Stop Rekaman
                              </button>
                            )}
                          </div>
                          <p className="mt-2 text-[10px] text-muted">
                            MP3 / WAV / M4A · maks 25MB · durasi disarankan ≤ {duration}s
                          </p>
                        </div>

                        {recordError && (
                          <p className="text-xs text-red-600">{recordError}</p>
                        )}

                        {voiceFile && (
                          <div className="rounded-xl border border-border p-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs truncate">
                                🎧 {voiceFile.name}
                              </span>
                              <button
                                type="button"
                                onClick={clearVoiceFile}
                                className="text-xs font-semibold text-red-600 shrink-0"
                              >
                                Hapus
                              </button>
                            </div>
                            <audio
                              src={voiceFile.url}
                              controls
                              className="mt-2 w-full h-9"
                            />
                          </div>
                        )}
                      </div>
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
                      <p className="mt-2 text-xs text-muted">🎵 {selectedBgm.desc}</p>
                    </div>
                  </div>
                )}

                <input
                  ref={voiceFileRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    setVoiceFromFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <input
                  ref={talkAudioRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    setTalkAudioFromFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
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
                    onChange={(e) => setModelId(e.target.value)}
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

              {selectedModel.supportsAudio && (
                <label className="mt-4 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={withAudio}
                    onChange={(e) => setWithAudio(e.target.checked)}
                    className="accent-primary"
                  />
                  Sertakan audio dari model (voice/ambience)
                </label>
              )}

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
                <dt className="text-muted">Motion</dt>
                <dd>
                  {motionMode === "talk" ? "Foto Ngomong" : "Iklan Standar"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Format</dt>
                <dd>{aspectRatio} · audio {withAudio ? "on" : "off"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Referensi</dt>
                <dd className="font-mono">
                  {moodImages.length + characterImages.length} foto
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Voiceover</dt>
                <dd className="text-right">
                  {voiceEnabled ? (
                    voiceMode === "own" ? (
                      <>
                        Suara Sendiri
                        <span className="block text-[10px] text-muted truncate max-w-[160px]">
                          {voiceFile ? voiceFile.name : "belum ada file"}
                        </span>
                      </>
                    ) : (
                      <>
                        {selectedVoice.name} (AI)
                        <span className="block text-[10px] text-muted">
                          {voiceLang.split(" ")[0]} ·{" "}
                          {(voiceSpeed / 100).toFixed(2)}×
                        </span>
                      </>
                    )
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
