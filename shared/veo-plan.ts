import type { Shot } from './domain';

export const VEO_CLIP_SECONDS = 8;
export type VeoPlanShot = Shot & { generationPrompt: string };
export type VeoPlanUnit = {
  id: string;
  start: number;
  end: number;
  targetDuration: number;
  sourceShotIds: string[];
};

// Storyboard cuts are editorial annotations. Veo emits fixed 8-second clips, so
// production units are deterministic timeline windows, not one provider call per cut.
export function buildVeoPlan(shots: VeoPlanShot[]): VeoPlanUnit[] {
  const ordered = [...shots].sort((a, b) => a.start - b.start);
  if (!ordered.length) return [];
  const first = ordered[0].start;
  const finalEnd = ordered.at(-1)!.end;
  const units: VeoPlanUnit[] = [];
  for (let start = first, index = 1; start < finalEnd - 0.001; start += VEO_CLIP_SECONDS, index++) {
    const end = Math.min(start + VEO_CLIP_SECONDS, finalEnd);
    units.push({
      id: `veo-unit-${String(index).padStart(2, '0')}`,
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      targetDuration: Number((end - start).toFixed(3)),
      sourceShotIds: ordered.filter(shot => shot.start < end - 0.001 && shot.end > start + 0.001).map(shot => shot.id),
    });
  }
  return units;
}
