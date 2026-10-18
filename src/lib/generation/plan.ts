import type { Scene } from "./prompt";

export const CLIP_SECONDS = 5;
export const MAX_VIDEO_SECONDS = 60;

export type ClipPlan = {
  clipIndex: number;
  start: number;
  end: number;
  scenes: Scene[];
};

/**
 * Memecah total durasi menjadi klip 5 detik. Scene yang lebih panjang dari 5 detik
 * dipotong menjadi beberapa klip, dan scene pendek digabung jika muat dalam satu klip.
 */
export function planClips(
  scenes: Scene[],
  totalDuration: number,
  clipSeconds: number = CLIP_SECONDS
): ClipPlan[] {
  const safeClip = Math.max(1, clipSeconds);
  const safeTotal = Math.min(Math.max(totalDuration, safeClip), MAX_VIDEO_SECONDS);
  const clipCount = Math.max(1, Math.round(safeTotal / safeClip));

  const plans: ClipPlan[] = [];
  for (let index = 0; index < clipCount; index += 1) {
    const start = index * safeClip;
    const end = Math.min(safeTotal, start + safeClip);

    const overlapping = scenes.filter((scene) => scene.end > start && scene.start < end);
    const clipped = (overlapping.length > 0 ? overlapping : scenes.slice(-1)).map((scene) => ({
      index: scene.index,
      start: Math.max(scene.start, start) - start,
      end: Math.min(scene.end, end) - start,
      visual: scene.visual,
      narration: scene.narration ?? "",
    }));

    plans.push({ clipIndex: index, start, end, scenes: clipped });
  }

  return plans;
}

export function clipDuration(plan: ClipPlan) {
  return Math.max(1, Math.round(plan.end - plan.start));
}
