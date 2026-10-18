/** Mengubah label bahasa di UI menjadi kode ISO singkat untuk kolom database. */
export function languageCodeFor(value: string | undefined): string {
  if (!value) return "id";
  const normalized = value.toLowerCase();
  if (normalized.startsWith("en")) return "en";
  if (normalized.includes("melayu")) return "ms";
  if (normalized.includes("mandarin") || normalized.includes("中文")) return "zh";
  return "id";
}
