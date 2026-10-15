import Link from "next/link";
import { TEMPLATES, TOKEN_PACKS, TOKEN_COSTS, formatIdr } from "@/lib/templates";

export default function Home() {
  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-32 right-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute top-20 -left-10 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="mx-auto max-w-7xl px-6 pt-24 pb-20 text-center relative">
          <span className="inline-block text-xs font-semibold tracking-widest uppercase text-accent border border-border rounded-full px-3 py-1 mb-6 bg-card">
            ✦ AI Video Ad Generator
          </span>
          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight tracking-tight">
            Satu prompt, jadi <span className="grad-text">video iklan</span>
            <br />
            hingga 1 menit.
          </h1>
          <p className="mt-6 text-muted max-w-2xl mx-auto text-lg">
            Tulis ide iklanmu, AI agent kami menyusun skenario per 5 detik, lalu
            video generator merubahnya menjadi iklan siap tayang.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/generator"
              className="btn-primary text-white font-semibold px-7 py-3.5 rounded-xl"
            >
              🎬 Buat Video Sekarang
            </Link>
            <Link
              href="#templates"
              className="card-soft font-semibold px-7 py-3.5 rounded-xl transition-shadow"
            >
              Lihat Template
            </Link>
          </div>

          {/* Fake preview cards */}
          <div className="mt-16 grid grid-cols-3 gap-4 max-w-3xl mx-auto animate-floaty">
            {["00:00", "00:05", "00:10"].map((t, i) => (
              <div
                key={t}
                className={`card-soft rounded-2xl p-3 text-left ${
                  i === 1 ? "-translate-y-4" : ""
                }`}
              >
                <div className="shimmer aspect-video rounded-xl" />
                <div className="mt-3 flex items-center justify-between text-xs text-muted">
                  <span>Scene {i + 1}</span>
                  <span className="font-mono text-accent">{t}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <h2 className="text-3xl font-bold text-center">
            Cara <span className="grad-text">kerjanya</span>
          </h2>
          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {[
              {
                step: "01",
                title: "Tulis Prompt",
                desc: "Jelaskan produk, konsep, dan durasi iklanmu (maks 1 menit, dipecah per 5 detik).",
                icon: "✍️",
              },
              {
                step: "02",
                title: "AI Agent Menyusun Skenario",
                desc: "AI agent mengolah idemu menjadi skenario cerita lengkap per segmen 5 detik.",
                icon: "🧠",
              },
              {
                step: "03",
                title: "Video Generator Bekerja",
                desc: "Skenario dikirim ke video generator dan menjadi video iklan siap pakai.",
                icon: "🎥",
              },
            ].map((f) => (
              <div
                key={f.step}
                className="card-soft rounded-2xl p-7 transition-shadow"
              >
                <div className="text-3xl">{f.icon}</div>
                <div className="mt-4 text-xs font-mono text-accent">{f.step}</div>
                <h3 className="mt-1 font-bold text-lg">{f.title}</h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TEMPLATES */}
      <section id="templates" className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <h2 className="text-3xl font-bold">
            Template <span className="grad-text">siap pakai</span>
          </h2>
          <p className="mt-2 text-muted">
            Pilih template, ganti nama produk atau karaktermu, langsung generate.
          </p>

          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {TEMPLATES.map((t) => (
              <div
                key={t.id}
                className="group card-soft rounded-2xl overflow-hidden transition-all hover:-translate-y-1"
              >
                <div
                  className={`aspect-video bg-gradient-to-br ${t.gradient} relative flex items-center justify-center`}
                >
                  <span className="text-4xl">▶</span>
                  <span className="absolute top-3 left-3 text-[10px] font-semibold uppercase tracking-wider bg-gray-900 text-white rounded-full px-2.5 py-1">
                    {t.category}
                  </span>
                  <span className="absolute bottom-3 right-3 text-[10px] font-mono bg-gray-900 text-white rounded-full px-2 py-1">
                    {t.duration}s
                  </span>
                </div>
                <div className="p-5">
                  <h3 className="font-bold">{t.title}</h3>
                  <p className="mt-1 text-sm text-primary">{t.hook}</p>
                  <p className="mt-2 text-xs text-muted leading-relaxed">
                    {t.description}
                  </p>
                  <Link
                    href={`/generator?template=${t.id}`}
                    className="mt-4 inline-block text-sm font-semibold text-accent hover:text-primary transition-colors"
                  >
                    Pakai template →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HARGA / TOKEN */}
      <section id="harga" className="border-t border-border bg-gray-50">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="text-center">
            <h2 className="text-3xl font-bold">
              Harga & <span className="grad-text">Token</span>
            </h2>
            <p className="mt-3 text-muted max-w-xl mx-auto">
              Sistem token yang simpel — beli token, pakai sesuai kebutuhan.
              Tanpa langganan bulanan yang mengikat.
            </p>
          </div>

          <div className="mt-12 grid md:grid-cols-3 gap-6 items-start">
            {TOKEN_PACKS.map((p) => (
              <div
                key={p.id}
                className={`card-soft rounded-2xl p-7 relative transition-shadow ${
                  p.popular ? "border-primary ring-1 ring-primary md:-translate-y-2" : ""
                }`}
              >
                {p.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-bold uppercase tracking-wider rounded-full px-3 py-1">
                    Paling Laris
                  </span>
                )}
                <h3 className="font-bold text-lg">{p.name}</h3>
                <div className="mt-3 flex items-end gap-1">
                  <span className="text-4xl font-extrabold">{p.tokens}</span>
                  <span className="text-muted text-sm mb-1">token</span>
                </div>
                <p className="mt-1 text-2xl font-bold text-primary">
                  {formatIdr(p.priceIdr)}
                </p>
                <p className="mt-3 text-sm text-muted">{p.note}</p>
                <button className="mt-6 w-full btn-primary text-white font-semibold py-3 rounded-xl">
                  Beli Token
                </button>
              </div>
            ))}
          </div>

          {/* Token cost table */}
          <div className="mt-12 max-w-2xl mx-auto card-soft rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-card">
              <h3 className="font-bold">Biaya pemakaian token</h3>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {TOKEN_COSTS.map((c) => (
                  <tr key={c.label} className="border-b border-border last:border-0">
                    <td className="px-6 py-3 text-muted">{c.label}</td>
                    <td className="px-6 py-3 text-right font-mono font-semibold">
                      {c.cost} token
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-center text-xs text-muted">
            * Harga dummy untuk keperluan demo.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <h2 className="text-3xl md:text-4xl font-bold">
            Siap bikin iklan pertamamu?
          </h2>
          <p className="mt-4 text-muted">
            Daftar dapat 10 token gratis. Tanpa skill editing. Hasil dalam hitungan menit.
          </p>
          <Link
            href="/generator"
            className="mt-8 inline-block btn-primary text-white font-semibold px-8 py-4 rounded-xl"
          >
            🚀 Mulai Generate
          </Link>
        </div>
      </section>
    </div>
  );
}
