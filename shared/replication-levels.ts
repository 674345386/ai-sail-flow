/* 复刻等级 / Replication levels (PM-final v1: 4 tiers, 7 display-only dimensions).
   Each tier decides, per dimension, whether it stays as in the source ("keep"), is replaced with the user's
   references or description ("yours"), or is rewritten from the user's new brief ("new").
   The tier also fixes how the source frame takes part in regenerating each shot's keyframe image. */

export const replicationDimensions = [
  { id: 'rhythm', label: '节奏和时长', en: 'rhythm: shot count, order, durations and cut points' },
  { id: 'composition', label: '构图 / 机位', en: 'framing, shot size, camera angle, subject placement and pose' },
  { id: 'camera', label: '运镜和转场', en: 'camera movement and transitions' },
  { id: 'look', label: '光影 / 色调 / 风格', en: 'lighting, color grade, texture and visual style' },
  { id: 'scene', label: '场景', en: 'location, set, background and props' },
  { id: 'subject', label: '人物', en: 'people and characters (appearance, wardrobe) and what they do' },
  { id: 'product', label: '产品 / 实体', en: 'the product or key object and how it is handled' },
] as const;
export type ReplicationDimension = typeof replicationDimensions[number]['id'];
export type DimensionState = 'keep' | 'yours' | 'new';

/** edit = source frame is the base image; swap = base image + user refs; layout = composition reference only; none = source frame not sent. */
export type SourceFrameUse = 'edit' | 'swap' | 'layout' | 'none';

export const replicationLevels = [
  { id: 'exact', step: 1, label: '复刻', short: '照原片重做', frameUse: 'edit' as SourceFrameUse,
    description: '全部沿用原片。上传了产品参考图就只替换产品，没上传就按原片重绘。' },
  { id: 'swap', step: 2, label: '换角', short: '换人换货不换戏', frameUse: 'swap' as SourceFrameUse,
    description: '沿用节奏、构图、运镜和风格，人物和产品换成你的参考图；需求里写了新场景也会一起换。' },
  { id: 'adapt', step: 3, label: '改编', short: '保留镜头骨架', frameUse: 'layout' as SourceFrameUse,
    description: '沿用节奏、构图和运镜，场景、人物、产品换成你的；风格默认沿用，需求里提到就改。' },
  { id: 'remix', step: 4, label: 'Remix', short: '只借节奏和运镜', frameUse: 'none' as SourceFrameUse,
    description: '只沿用节奏、运镜和转场，其余按你的新主题重写，原片画面不参与生图。' },
] as const;
export type ReplicationLevel = typeof replicationLevels[number]['id'];
export const replicationLevelIds = replicationLevels.map(item => item.id) as [ReplicationLevel, ...ReplicationLevel[]];

export function levelInfo(level?: ReplicationLevel) { return replicationLevels.find(item => item.id === level) || replicationLevels[0]; }

type Rules = { level?: ReplicationLevel; keepStyle?: boolean; preserve?: string; change?: string };
/** Per-dimension state for a tier. hasRefs = the user uploaded subject/product reference images. */
export function dimensionStates(rules: Rules, hasRefs: boolean): Record<ReplicationDimension, DimensionState> {
  const level = rules.level || 'exact';
  const ref: DimensionState = hasRefs ? 'yours' : 'new';
  switch (level) {
    case 'exact': return { rhythm: 'keep', composition: 'keep', camera: 'keep', look: 'keep', scene: 'keep', subject: 'keep', product: hasRefs ? 'yours' : 'keep' };
    case 'swap': return { rhythm: 'keep', composition: 'keep', camera: 'keep', look: 'keep', scene: 'keep', subject: 'yours', product: 'yours' };
    case 'adapt': return { rhythm: 'keep', composition: 'keep', camera: 'keep', look: 'keep', scene: 'yours', subject: 'yours', product: 'yours' };
    case 'remix': return { rhythm: 'keep', composition: 'new', camera: 'keep', look: rules.keepStyle === false ? 'new' : 'keep', scene: 'new', subject: ref, product: ref };
  }
}

const frameUseRule: Record<SourceFrameUse, string> = {
  edit: 'SOURCE FRAME USE = BASE IMAGE. The first image is the base: reproduce it as closely as possible (scene, framing, people, pose, lighting, colors). If target product references are supplied, replace only the source product with the target product at the same position, scale and interaction; otherwise redraw the source frame cleanly without its captions or watermarks.',
  swap: 'SOURCE FRAME USE = BASE IMAGE WITH REPLACEMENT. Keep the first image\'s scene, framing, camera angle, pose, lighting and color. Replace the people and the product with the user\'s reference images, matching the original placement, scale and interaction. Keep all other pixels as close to the source as possible.',
  layout: 'SOURCE FRAME USE = COMPOSITION REFERENCE ONLY. The first image is NOT a base image. Use it only for shot size, camera angle, subject placement, pose and depth layout. The scene, people and product come from the rewritten shot and the user\'s references and description. Do not copy the source location, people or objects.',
  none: 'NO SOURCE FRAME is supplied. Build the frame from the rewritten shot, the user\'s new theme and any user references. Follow the stated camera and shot-size labels.',
};

/** English contract appended to rewrite and keyframe prompts. */
export function replicationContract(rules: Rules, hasRefs: boolean, scope: 'rewrite' | 'keyframe') {
  const info = levelInfo(rules.level);
  const states = dimensionStates(rules, hasRefs);
  const pick = (state: DimensionState) => replicationDimensions.filter(item => states[item.id] === state).map(item => item.en).join('; ') || 'none';
  return [
    `REPLICATION LEVEL ${info.step}/4 "${info.id}".`,
    `KEEP FROM SOURCE (match the reference shot by shot, using the corrected analysis and its first/middle/last frames): ${pick('keep')}.`,
    `REPLACE WITH THE USER'S (use the user's reference images and description; keep the source role, placement and timing): ${pick('yours')}.`,
    `REWRITE FROM THE USER'S BRIEF (new content, coherent across shots and with the kept items): ${pick('new')}.`,
    info.id === 'adapt' ? 'Style is kept unless the user brief explicitly asks to change it.' : '',
    info.id === 'swap' ? 'The scene is kept unless the user brief explicitly asks for a new one.' : '',
    rules.preserve ? `User notes on what to keep: ${rules.preserve}` : '',
    rules.change ? `User brief: ${rules.change}` : '',
    'Conflict rule: an explicit user request beats a keep rule; a keep rule beats free creativity. Always keep the same shot count, order and relative durations as the source.',
    scope === 'keyframe' ? frameUseRule[info.frameUse] : '',
  ].filter(Boolean).join('\n');
}
