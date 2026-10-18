"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Mode = "login" | "register";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/generator";

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          mode === "register" ? { name, email, password } : { email, password }
        ),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Gagal memproses permintaan.");
        return;
      }
      router.replace(next.startsWith("/") ? next : "/generator");
      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card-soft rounded-2xl p-7">
      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-gray-100">
        {[
          { key: "login" as const, label: "Masuk" },
          { key: "register" as const, label: "Daftar" },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setMode(item.key);
              setError(null);
            }}
            className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
              mode === item.key
                ? "bg-card shadow-sm text-foreground"
                : "text-muted hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4">
        {mode === "register" && (
          <div>
            <label htmlFor="name" className="text-sm font-semibold">
              Nama
            </label>
            <input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              autoComplete="name"
              className="mt-2 w-full rounded-xl bg-background border border-border px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>
        )}

        <div>
          <label htmlFor="email" className="text-sm font-semibold">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            className="mt-2 w-full rounded-xl bg-background border border-border px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </div>

        <div>
          <label htmlFor="password" className="text-sm font-semibold">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={mode === "register" ? 8 : undefined}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            className="mt-2 w-full rounded-xl bg-background border border-border px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          {mode === "register" && (
            <p className="mt-1 text-xs text-muted">Minimal 8 karakter.</p>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full btn-primary text-white font-semibold py-3 rounded-xl disabled:opacity-40 disabled:pointer-events-none"
        >
          {loading ? "Memproses..." : mode === "register" ? "Buat Akun" : "Masuk"}
        </button>
      </form>
    </div>
  );
}

export default function LoginShell() {
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-bold">
        Selamat datang di <span className="grad-text">KeevaAI</span>
      </h1>
      <p className="mt-2 text-sm text-muted">
        Masuk untuk menyimpan riwayat video dan memakai kredit generator.
      </p>
      <div className="mt-8">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
