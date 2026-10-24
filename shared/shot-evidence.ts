import type { Shot } from './domain';

export const motionKindLabels = { subject: '人物动作', object: '物体运动', camera: '运镜', effect: '画面动画', transition: '转场', static: '静止核对', uncertain: '动态待确认' };
export function shotMotionPrompt(shot: Pick<Shot, 'motionBeats'>) {
  return (shot.motionBeats || []).map(beat => `${beat.start.toFixed(3)}–${beat.end.toFixed(3)}s · ${motionKindLabels[beat.kind]}：${beat.description}`).join('\n');
}

/** Complete current breakdown record; a reconstruction prompt never replaces its fields. */
export function shotAnalysisPrompt(shot: Shot) {
  const fields: [string, string | undefined][] = [
    ['镜头作用', shot.role], ['主体', shot.subject], ['画面与场景', shot.visual], ['动作', shot.action],
    ['运镜与构图', shot.camera], ['特效与画面风格', shot.effects], ['转场', shot.transition],
    ['产品与道具呈现', shot.productPresence], ['原片口播', shot.narration],
    ['画面文字', shot.onScreenText], ['原片声音', shot.sound],
    ['复刻描述', shot.reconstructionPrompt], ['待确认信息', shot.uncertainty],
  ];
  const priorities = shot.focusPoints?.filter(point => point.selected).map(point => point.text) || [];
  return [
    `【视频拆解 · ${shot.id}】原片 ${shot.start.toFixed(3)}–${shot.end.toFixed(3)}s`,
    ...fields.filter(([, value]) => value?.trim()).map(([label, value]) => `${label}：${value}`),
    shot.motionBeats?.length ? `动态时间线（原片绝对时间）：\n${shotMotionPrompt(shot)}` : '',
    priorities.length ? `已选镜头重点：${priorities.join('；')}` : '',
  ].filter(Boolean).join('\n');
}

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
  if (shot.reconstructionPrompt?.trim()) return [shot.reconstructionPrompt, shot.motionBeats?.length ? `Observed motion timeline (absolute source-video seconds):\n${shotMotionPrompt(shot)}` : ''].filter(Boolean).join('\n\n');
  return [
    'Reconstruct this observed reference shot. Follow the recorded details; do not invent missing elements.',
    `Source interval: ${shot.start.toFixed(3)}–${shot.end.toFixed(3)} seconds.`,
    shot.subject && `Subject: ${shot.subject}`, `Scene and composition: ${shot.visual}`, `Subject action: ${shot.action}`,
    `Camera and lens language: ${shot.camera}`, shot.effects && `Visual effects: ${shot.effects}`,
    shot.transition && `Transition: ${shot.transition}`, shot.productPresence && `Product appearance: ${shot.productPresence}`,
    shot.narration && `Original spoken words: ${shot.narration}`, shot.onScreenText && `Visible text: ${shot.onScreenText}`,
    shot.sound && `Sound: ${shot.sound}`, shot.uncertainty && `Uncertain details to confirm: ${shot.uncertainty}`,
    shot.motionBeats?.length ? `Observed motion timeline:\n${shotMotionPrompt(shot)}` : '',
  ].filter(Boolean).join('\n');
}

export type ShotMedia = {
  key: string; sourceAssetId: string; start: number; end: number;
  clipUrl: string; duration: number;
  frames: { at: number; reason: string; selection: 'model' | 'interval'; position: 'first' | 'middle' | 'last'; url: string; previewUrl?: string }[];
};
