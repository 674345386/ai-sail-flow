import type { Shot } from './domain';

// Media is tied to the source interval, not editable descriptive text.
export function shotEvidenceFrames(shot: Pick<Shot, 'start' | 'end' | 'evidenceFrames'>) {
  const requested = (shot.evidenceFrames || []).filter(frame => Number.isFinite(frame.at) && frame.at >= shot.start && frame.at < shot.end)
    .sort((a, b) => a.at - b.at).filter((frame, index, frames) => !index || frame.at - frames[index - 1].at > .025).slice(0, 3);
  if (requested.length) return requested.map(frame => ({ ...frame, reason: frame.reason || '模型建议核对的画面', selection: 'model' as const }));
  const duration = shot.end - shot.start;
  return (duration < .5 ? [.5] : [.15, .5, .85]).map((fraction, index, fractions) => ({
    at: shot.start + duration * fraction,
    reason: fractions.length === 1 ? '镜头中段' : ['镜头前段', '镜头中段', '镜头后段'][index], selection: 'interval' as const,
  }));
}

export function shotReconstructionPrompt(shot: Shot) {
  if (shot.reconstructionPrompt?.trim()) return shot.reconstructionPrompt;
  return [
    'Reconstruct this observed reference shot. Follow the recorded details; do not invent missing elements.',
    `Source interval: ${shot.start.toFixed(3)}–${shot.end.toFixed(3)} seconds.`,
    shot.subject && `Subject: ${shot.subject}`, `Scene and composition: ${shot.visual}`, `Subject action: ${shot.action}`,
    `Camera and lens language: ${shot.camera}`, shot.effects && `Visual effects: ${shot.effects}`,
    shot.transition && `Transition: ${shot.transition}`, shot.productPresence && `Product appearance: ${shot.productPresence}`,
    shot.narration && `Original spoken words: ${shot.narration}`, shot.onScreenText && `Visible text: ${shot.onScreenText}`,
    shot.sound && `Sound: ${shot.sound}`, shot.uncertainty && `Uncertain details to confirm: ${shot.uncertainty}`,
  ].filter(Boolean).join('\n');
}

export type ShotMedia = {
  key: string; sourceAssetId: string; start: number; end: number;
  clipUrl: string; duration: number;
  frames: { at: number; reason: string; selection: 'model' | 'interval'; url: string }[];
};
