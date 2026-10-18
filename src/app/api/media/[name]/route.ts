import { Readable } from "node:stream";
import { videoStat, videoStream } from "@/lib/media/storage";

function toWebStream(nodeStream: Readable) {
  return Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const info = await videoStat(name);

  if (!info) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers({
    "content-type": "video/mp4",
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=31536000, immutable",
  });

  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Number(match[2]) : info.size - 1;

    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= info.size) {
      return new Response(null, {
        status: 416,
        headers: { "content-range": `bytes */${info.size}` },
      });
    }

    headers.set("content-range", `bytes ${start}-${end}/${info.size}`);
    headers.set("content-length", String(end - start + 1));

    return new Response(toWebStream(videoStream(name, start, end)), { status: 206, headers });
  }

  headers.set("content-length", String(info.size));
  return new Response(toWebStream(videoStream(name)), { status: 200, headers });
}
