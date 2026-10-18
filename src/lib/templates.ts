export type Template = {
  id: string;
  title: string;
  category: string;
  duration: number; // seconds
  gradient: string;
  hook: string;
  description: string;
};

export const TEMPLATES: Template[] = [
  {
    id: "beauty-glow",
    title: "Skincare Glow Up",
    category: "Beauty",
    duration: 30,
    gradient: "from-rose-200 to-rose-100",
    hook: "Kulit kusam? Ini rahasianya ✨",
    description:
      "Before–after dramatis, close-up tekstur serum, testimoni singkat, CTA belanja.",
  },
  {
    id: "fnm-kopi",
    title: "Kopi Pagi Hari",
    category: "F&B",
    duration: 20,
    gradient: "from-amber-200 to-amber-100",
    hook: "Pagi tanpa kopi = bug 🐛",
    description:
      "Seduhan slow-motion, uap hangat, barista handal, diskon pagi hari.",
  },
  {
    id: "fashion-drop",
    title: "Fashion Drop Terbaru",
    category: "Fashion",
    duration: 30,
    gradient: "from-violet-200 to-violet-100",
    hook: "Koleksi terbatas, habis ya habis 🔥",
    description:
      "Runway cepat, detail bahan, countdown rilis, urgency FOMO.",
  },
  {
    id: "gadget-unbox",
    title: "Gadget Unboxing",
    category: "Teknologi",
    duration: 45,
    gradient: "from-sky-200 to-sky-100",
    hook: "Gadget sekeren ini cuma 1 jutaan?!",
    description:
      "Unboxing satisfying, fitur utama, benchmark singkat, CTA pre-order.",
  },
  {
    id: "travel-escape",
    title: "Liburan Hidden Gem",
    category: "Travel",
    duration: 30,
    gradient: "from-emerald-200 to-emerald-100",
    hook: "Tempat ini cuma 2 jam dari Jakarta 🏝️",
    description:
      "Drone shot pantai, aktivitas seru, harga paket, booking sekarang.",
  },
  {
    id: "app-demo",
    title: "Demo Aplikasi Startup",
    category: "SaaS",
    duration: 45,
    gradient: "from-indigo-200 to-indigo-100",
    hook: "Kerjaan 3 jam jadi 5 menit ⚡",
    description:
      "Masalah → solusi, screen recording animasi, hasil nyata, free trial.",
  },
];

export type TokenPack = {
  id: string;
  name: string;
  tokens: number;
  priceIdr: number;
  popular?: boolean;
  note: string;
};

export const TOKEN_PACKS: TokenPack[] = [
  {
    id: "starter",
    name: "Starter",
    tokens: 50,
    priceIdr: 49000,
    note: "Cukup untuk ~10 video pendek (≤15 detik)",
  },
  {
    id: "creator",
    name: "Creator",
    tokens: 200,
    priceIdr: 149000,
    popular: true,
    note: "~40 video pendek atau 13 video 1 menit",
  },
  {
    id: "studio",
    name: "Studio",
    tokens: 600,
    priceIdr: 349000,
    note: "Untuk tim & agensi, prioritas render",
  },
];

export const TOKEN_COSTS = [
  { label: "Generate skenario (per video)", cost: 1 },
  { label: "Video 5 detik", cost: 2 },
  { label: "Video 15 detik", cost: 5 },
  { label: "Video 30 detik", cost: 9 },
  { label: "Video 60 detik", cost: 15 },
];

export function formatIdr(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export type Voice = {
  id: string;
  name: string;
  gender: "Pria" | "Wanita";
  tone: string;
  description: string;
};

export const VOICES: Voice[] = [
  {
    id: "budi",
    name: "Budi",
    gender: "Pria",
    tone: "Hangat & Ramah",
    description: "Cocok untuk produk keluarga, edukasi, testimoni.",
  },
  {
    id: "rara",
    name: "Rara",
    gender: "Wanita",
    tone: "Ceria & Enerjik",
    description: "Pas untuk F&B, fashion, promo diskon.",
  },
  {
    id: "dimas",
    name: "Dimas",
    gender: "Pria",
    tone: "Berwibawa",
    description: "Ideal untuk korporat, properti, otomotif.",
  },
  {
    id: "sinta",
    name: "Sinta",
    gender: "Wanita",
    tone: "Lembut & Elegan",
    description: "Untuk skincare, perhiasan, brand premium.",
  },
  {
    id: "reza",
    name: "Reza",
    gender: "Pria",
    tone: "Santai / Gaul",
    description: "Cocok untuk produk anak muda dan teknologi.",
  },
  {
    id: "maya",
    name: "Maya",
    gender: "Wanita",
    tone: "Profesional",
    description: "Untuk SaaS, fintech, dan layanan B2B.",
  },
];

export const VOICE_LANGUAGES = [
  "Bahasa Indonesia",
  "English (US)",
  "English (UK)",
  "Bahasa Melayu",
  "中文 (Mandarin)",
];

export const BGM_OPTIONS = [
  { id: "none", label: "Tanpa Musik", desc: "Hanya voiceover" },
  { id: "upbeat", label: "Upbeat", desc: "Enerjik, cocok promo" },
  { id: "calm", label: "Calm", desc: "Tenang, cocok skincare" },
  { id: "corporate", label: "Corporate", desc: "Bersih & profesional" },
  { id: "dramatic", label: "Dramatic", desc: "Sinematik, epik" },
];

