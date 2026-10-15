"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();
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
          {link("/#templates", "Template")}
          {link("/#harga", "Harga")}
        </nav>
        <Link
          href="/generator"
          className="btn-primary text-white text-sm font-semibold px-4 py-2 rounded-lg"
        >
          Buat Video →
        </Link>
      </div>
    </header>
  );
}
