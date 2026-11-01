import Link from "next/link";

export default function CreateCta({ className }: { className?: string }) {
  return (
    <Link href="/generator" className={className}>
      🎬 Buat Video Sekarang
    </Link>
  );
}
