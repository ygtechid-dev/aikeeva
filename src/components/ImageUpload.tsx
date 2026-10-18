"use client";

import { useRef, useState } from "react";

export type RefImage = { id: string; name: string; url: string; file?: File };

const MAX_MB = 5;

type Props = {
  label: string;
  hint: string;
  examples: string[];
  images: RefImage[];
  onChange: (images: RefImage[]) => void;
};

export default function ImageUpload({ label, hint, examples, images, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const picked = Array.from(files);

    const tooBig = picked.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (tooBig) {
      setError(`"${tooBig.name}" lebih dari ${MAX_MB}MB.`);
      return;
    }
    const notImage = picked.find((f) => !f.type.startsWith("image/"));
    if (notImage) {
      setError(`"${notImage.name}" bukan file gambar.`);
      return;
    }

    setError(null);
    const next: RefImage[] = picked.map((f) => ({
      id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 8)}`,
      name: f.name,
      url: URL.createObjectURL(f),
      file: f,
    }));
    onChange([...images, ...next].slice(0, 6));
  };

  const remove = (id: string) => {
    const target = images.find((i) => i.id === id);
    if (target) URL.revokeObjectURL(target.url);
    onChange(images.filter((i) => i.id !== id));
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`w-full rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/60 hover:bg-primary/5"
        }`}
      >
        <div className="text-2xl">📷</div>
        <p className="mt-2 text-sm font-semibold">{label}</p>
        <p className="mt-1 text-xs text-muted">{hint}</p>
        <span className="mt-3 inline-block text-xs font-semibold text-primary border border-border rounded-lg px-3 py-1.5">
          Pilih Foto
        </span>
        <p className="mt-2 text-[10px] text-muted">
          JPG / PNG · maks {MAX_MB}MB · hingga 6 foto
        </p>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {images.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {images.map((img) => (
            <div key={img.id} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.name}
                className="aspect-square w-full object-cover rounded-lg border border-border"
              />
              <button
                type="button"
                onClick={() => remove(img.id)}
                aria-label={`Hapus ${img.name}`}
                className="absolute top-1 right-1 h-6 w-6 rounded-full bg-gray-900/80 text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
          Contoh foto yang cocok
        </summary>
        <ul className="mt-2 space-y-1 text-xs text-muted list-disc list-inside">
          {examples.map((ex) => (
            <li key={ex}>{ex}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
