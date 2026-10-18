import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const NAME_PATTERN = /^[0-9a-f-]{36}\.mp4$/i;

/**
 * Path dibuat statis relatif ke cwd supaya Turbopack tidak men-trace seluruh
 * project. Override lewat MEDIA_DIR hanya untuk absolute path di server sendiri.
 */
function mediaRoot() {
  const override = process.env.MEDIA_DIR;
  if (override && override.startsWith("/")) {
    return join(/* turbopackIgnore: true */ override);
  }
  return join(process.cwd(), ".data", "media");
}

export async function saveVideo(id: string, data: Buffer) {
  const root = mediaRoot();
  await mkdir(root, { recursive: true });
  await writeFile(join(/* turbopackIgnore: true */ root, `${id}.mp4`), data);
}

export async function videoStat(name: string) {
  if (!NAME_PATTERN.test(name)) return null;
  try {
    return await stat(join(/* turbopackIgnore: true */ mediaRoot(), name));
  } catch {
    return null;
  }
}

export function videoStream(name: string, start?: number, end?: number) {
  return createReadStream(join(/* turbopackIgnore: true */ mediaRoot(), name), { start, end });
}
