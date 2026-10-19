"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type NavUser = { name: string; email: string } | null;

export default function Navbar({ user }: { user: NavUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!createOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (createRef.current && !createRef.current.contains(e.target as Node)) {
        setCreateOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [createOpen]);

  const link = (href: string, label: string) => (
    <Link
      href={href}
      className={`text-sm transition-colors ${
        pathname === href ? "text-foreground font-semibold" : "text-muted hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );

  const logout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-background/85 backdrop-blur border-b border-border">
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <span className="inline-block h-8 w-8 rounded-lg bg-primary" />
          Keeva<span className="text-primary">AI</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8">
          {link("/", "Beranda")}
          {link("/generator", "Generator")}
          {link("/motion", "Motion")}
          {link("/history", "Riwayat")}
          {link("/#templates", "Template")}
          {link("/#harga", "Harga")}
        </nav>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="hidden sm:block text-sm text-muted max-w-[180px] truncate">
                {user.name}
              </span>
              <button
                type="button"
                onClick={logout}
                disabled={loggingOut}
                className="text-sm font-semibold px-3 py-2 rounded-lg border border-border disabled:opacity-40"
              >
                {loggingOut ? "Keluar..." : "Keluar"}
              </button>
              <div ref={createRef} className="relative">
                <button
                  type="button"
                  onClick={() => setCreateOpen((o) => !o)}
                  aria-expanded={createOpen}
                  className="btn-primary text-white text-sm font-semibold px-4 py-2 rounded-lg"
                >
                  Buat Video {createOpen ? "▴" : "→"}
                </button>
                {createOpen && (
                  <div className="absolute right-0 mt-2 w-64 rounded-xl border border-border bg-card shadow-lg p-2 z-50">
                    <Link
                      href="/generator"
                      onClick={() => setCreateOpen(false)}
                      className="block rounded-lg px-3 py-2.5 hover:bg-primary/10"
                    >
                      <span className="block text-sm font-semibold">🎬 Video Iklan</span>
                      <span className="block text-xs text-muted">
                        Skenario AI, voiceover, musik — video iklan lengkap
                      </span>
                    </Link>
                    <Link
                      href="/motion"
                      onClick={() => setCreateOpen(false)}
                      className="block rounded-lg px-3 py-2.5 hover:bg-primary/10"
                    >
                      <span className="block text-sm font-semibold">🎙️ Motion Control</span>
                      <span className="block text-xs text-muted">
                        Satu foto bicara dengan suara AI (lip-sync)
                      </span>
                    </Link>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm font-semibold text-muted hover:text-foreground">
                Masuk
              </Link>
              <Link
                href="/login"
                className="btn-primary text-white text-sm font-semibold px-4 py-2 rounded-lg"
              >
                Buat Video →
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
