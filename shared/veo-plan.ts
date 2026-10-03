import type { Shot } from './domain';

export const VEO_CLIP_SECONDS = 8;
export type VeoPlanShot = Shot & { generationPrompt: string; sourceShotId?: string };
export type VeoPlanUnit = {
  id: string;
  start: number;
  end: number;
  targetDuration: number;
  sourceShotIds: string[];
};

// One reference shot produces one provider clip. Provider duration is separate
// from the editorial duration; short clips are trimmed and long clips are retimed.
export function buildVeoPlan(shots: VeoPlanShot[]): VeoPlanUnit[] {
  const ordered = [...shots].sort((a, b) => a.start - b.start);
  return ordered.map(shot => ({ id: `veo-shot-${shot.id}`, start: shot.start, end: shot.end,
    targetDuration: Number((shot.end - shot.start).toFixed(6)), sourceShotIds: [shot.id] }));
}

export function clipTiming(targetDuration: number, sourceDuration = VEO_CLIP_SECONDS) {
  const sourceSeconds = Math.min(targetDuration, sourceDuration);
  return { sourceSeconds, videoScale: targetDuration / sourceSeconds, audioTempo: sourceSeconds / targetDuration };
}
