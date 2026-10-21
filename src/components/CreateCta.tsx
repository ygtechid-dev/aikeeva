"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function CreateCta({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={className}
      >
        🎬 Buat Video Sekarang
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 mt-3 w-72 rounded-xl border border-border bg-card shadow-xl p-2 z-50 text-left">
          <Link
            href="/generator"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-3 hover:bg-primary/10 transition-colors"
          >
            <span className="block text-sm font-semibold">🎬 Video Generate</span>
            <span className="block text-xs text-muted">
              Skenario AI, voiceover, musik — video iklan lengkap
            </span>
          </Link>
          <Link
            href="/motion"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-3 hover:bg-primary/10 transition-colors"
          >
            <span className="block text-sm font-semibold">🎙️ Motion Control</span>
            <span className="block text-xs text-muted">
              Satu foto bicara dengan suara AI (lip-sync)
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
