import type { Shot } from './domain';

// Media is tied to the source interval, not editable descriptive text.
export function shotEvidenceFrames(shot: Pick<Shot, 'start' | 'end' | 'evidenceFrames'>) {
  const duration = shot.end - shot.start;
  const midpoint = shot.start + duration / 2;
  const lastAt = shot.end - Math.min(.001, duration / 4);
  const middle = (shot.evidenceFrames || [])
    .filter(frame => Number.isFinite(frame.at) && frame.at > shot.start && frame.at < lastAt)
    .sort((a, b) => Math.abs(a.at - midpoint) - Math.abs(b.at - midpoint))[0];
  // Always keep three slots, including short shots with repeated source images.
  return [
    { at: shot.start, reason: '镜头首帧', selection: 'interval' as const, position: 'first' as const },
    { at: middle?.at ?? midpoint, reason: middle?.reason || '镜头中间关键帧',
      selection: middle ? 'model' as const : 'interval' as const, position: 'middle' as const },
    { at: lastAt, reason: '镜头尾帧', selection: 'interval' as const, position: 'last' as const },
  ];
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
  frames: { at: number; reason: string; selection: 'model' | 'interval'; position: 'first' | 'middle' | 'last'; url: string; previewUrl?: string }[];
};
