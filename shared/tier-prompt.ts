/* Step 1 of tiered replication: assemble each shot's final prompt and list its image inputs, without generating images. */
import type { Project, Shot, TierNewFrame, TierShot, TierStructured, TierSubject } from './domain';
import { defaultReplication } from './domain';
import { dimensionStates, levelInfo, type ReplicationLevel } from './replication-levels';
import { shotAnalysisPrompt, shotEvidenceFrames } from './shot-evidence';

export type TierInput = { role: string; label: string; url?: string; missing?: boolean };
export const framePositions = ['first', 'middle', 'last'] as const;
export type FramePosition = typeof framePositions[number];
export const frameLabel: Record<FramePosition, string> = { first: '首帧', middle: '中间帧', last: '尾帧' };
export type TierImage = { role: string; label: string; url: string };
export const roleHint: Record<string, string> = {
  底图: 'edit THIS image; keep its framing unless the text says otherwise',
  构图参考: 'composition and camera reference only; do not copy its people, products, logos or text',
  原片主体: 'identity reference from the source; keep this subject consistent',
  要替换: 'the source subject that must be REPLACED',
  换成: 'what to replace it with; match this identity and appearance',
  参考: 'appearance reference',
};
const OUTPUT_LINE = 'Output ONE photorealistic video still. No collage, no captions, no watermark, no UI.';
const imageBlock = (images: TierImage[]) => images.length
  ? `【输入图片】按传图顺序：\n${images.map((item, index) => `第 ${index + 1} 张参考图：${item.role}｜${item.label}（${roleHint[item.role] || 'reference'}）`).join('\n')}`
  : '【输入图片】无，按文字生成。';
/** The default text in a frame's input box: exactly what is sent to the image model. */
export const frameRequestText = (final: string, images: TierImage[]) => [final, imageBlock(images), OUTPUT_LINE].join('\n');
/** Keep a hand-edited text's 【输入图片】 list in step with the image chips. */
export function replaceImageBlock(text: string, images: TierImage[]) {
  const start = text.indexOf('【输入图片】');
  if (start < 0) return text;
  const tail = text.indexOf(OUTPUT_LINE, start);
  return text.slice(0, start) + imageBlock(images) + (tail < 0 ? '' : '\n' + text.slice(tail));
}
export type TierFramePlan = {
  /** The input box: text and images actually sent; edited = the user changed either. */
  text: string; images: TierImage[]; edited: boolean;
  position: FramePosition; label: string; extra: string; autoExtra: string; noteEdited: boolean; final: string;
  /** Hash of the inputs this frame was planned against; stamped onto generated results for 已过期. */
  basis: string;
  source?: { url: string; at: number }; inputs: TierInput[]; order: string;
  /** Step 1 result for this frame, and whether it is 已过期 (derived from an older new first frame). */
  result?: TierNewFrame; outdated: boolean; dependsOnFirst: boolean;
};
export type TierPlan = {
  shotId: string; level: ReplicationLevel; overridden: boolean; corrected: boolean;
  /** One prompt shared by the three frames; only this part is editable. */
  prompt: string; assembled: string; basis: string; manual: boolean; stale: boolean;
  frames: TierFramePlan[]; canVideo: boolean; chained: boolean; video: string; missingRefs: string[];
};

function fallbackStructured(shot: Shot): TierStructured {
  return { subject: shot.subject || '', product: shot.productPresence || '', scene: shot.visual, action: shot.action,
    composition: shot.camera, camera: [shot.camera, shot.transition].filter(Boolean).join('；'), look: shot.effects || '',
    firstFrame: shot.visual, middleFrame: '', lastFrame: '', motion: [shot.action, shot.camera].filter(Boolean).join('；') };
}
function hash(value: string) {
  let first = 2166136261, second = 5381;
  for (let index = 0; index < value.length; index++) { first = Math.imul(first ^ value.charCodeAt(index), 16777619); second = Math.imul(second, 33) ^ value.charCodeAt(index); }
  return `tier-v3:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
}

/** Version of the source analysis and evidence frames used by stage-3 results. */
export function tierSourceBasis(shot: Shot) {
  return hash(JSON.stringify(shot));
}

export function shotLevel(project: Project, shotId: string): ReplicationLevel {
  return project.replication?.shots?.[shotId]?.level || project.replication?.level || 'exact';
}

/** 用原片参考: the user's choice per subject, otherwise on for every tier except Remix. */
export function usesSource(subject: TierSubject, level: ReplicationLevel) {
  return !!subject.sources?.length && (subject.useSource ?? level !== 'remix');
}

export function tierPlan(project: Project, shot: Shot): TierPlan {
  const rules = project.replication || defaultReplication;
  const entry = rules.shots?.[shot.id];
  const level = shotLevel(project, shot.id);
  const productAssets = project.assets.filter(asset => asset.kind === 'product');
  const subjects = (rules.subjects || []).filter(subject => !subject.shotIds.length || subject.shotIds.includes(shot.id));
  const people = subjects.filter(subject => subject.kind === 'person');
  const things = subjects.filter(subject => subject.kind !== 'person');
  const hasRefs = productAssets.length > 0 || subjects.some(subject => subject.images.length > 0);
  const states = dimensionStates({ ...rules, level }, hasRefs);
  const sourceBasis = tierSourceBasis(shot);
  const structuredCurrent = !!entry?.structured && entry.structured.sourceBasis === sourceBasis;
  const structuredStale = !!entry?.structured && !structuredCurrent;
  const data = structuredCurrent ? entry!.structured! : fallbackStructured(shot);
  const brief = rules.change.trim();
  const missingRefs: string[] = [];
  const bind = (list: TierSubject[], fallback: string) => {
    if (!list.length) return fallback;
    return list.map(subject => {
      if (!subject.images.length) missingRefs.push(subject.name);
      return `「${subject.name}」${subject.images.length ? `（参考图 ${subject.images.length} 张）` : '【待上传参考图】'}${subject.note ? `：${subject.note}` : ''}`;
    }).join('；');
  };
  const field = (dim: keyof typeof states, label: string, source: string, yours: () => string) => {
    const state = states[dim];
    if (state === 'keep') return source ? `${label}：沿用原片，${source}` : '';
    if (state === 'yours') return `${label}：换成你的 ${yours()}，保持原片里的位置、比例和互动方式`;
    return `${label}：按新主题重新生成${brief ? `（${brief}）` : ''}`;
  };
  const productYours = () => bind(things, productAssets.length ? `产品「${project.product.name || '你的产品'}」（参考图 ${productAssets.length} 张）` : `产品「${project.product.name || '你的产品'}」【待上传参考图】`);
  if (states.product === 'yours' && !things.length && !productAssets.length) missingRefs.push(project.product.name || '产品');
  const frameLines = [
    field('composition', '构图机位', data.composition, () => ''),
    field('scene', '场景', data.scene, () => brief || '新场景'),
    field('subject', '人物', [data.subject, data.action].filter(Boolean).join('，'), () => bind(people, '人物【待在主体设定卡绑定】')),
    field('product', '产品', data.product, productYours),
    field('look', '风格光影', data.look, () => ''),
  ].filter(Boolean);
  const keepLayout = states.composition === 'keep';
  const frameState: Record<FramePosition, string> = keepLayout
    ? { first: data.firstFrame, middle: data.middleFrame || [data.action, data.scene].filter(Boolean).join('，'), last: data.lastFrame }
    : { first: `按新主题设计这个镜头动作刚开始的画面，景别和机位参照原片首帧${data.firstFrame ? `：${data.firstFrame}` : ''}`,
      middle: `与新首帧同一场景、同一人物和产品，动作进行到一半${data.middleFrame ? `，进度参照原片：${data.middleFrame}` : ''}`,
      last: `与新首帧同一场景、同一人物和产品，动作结束时${data.lastFrame ? `，进度参照原片：${data.lastFrame}` : ''}` };
  const context = [`运镜：沿用原片，${data.camera}`, data.motion ? `动作过程：${states.subject === 'new' ? `按新主题改写，节奏参照原片：${data.motion}` : data.motion}` : '', `时长：${(shot.end - shot.start).toFixed(1)} 秒`].filter(Boolean);
  const assembled = [`【档位】${levelInfo(level).label}`, ...frameLines, '【镜头上下文】', ...context].filter(Boolean).join('\n');
  const basis = hash(assembled), manual = entry?.prompt !== undefined, prompt = manual ? entry!.prompt! : assembled;
  const extraFor = (position: FramePosition) => [`【这一张】${frameLabel[position]}（这个镜头共 3 张：首帧、中间帧、尾帧）`, frameState[position] ? `画面状态：${frameState[position]}` : ''].filter(Boolean).join('\n');
  const use = levelInfo(level).frameUse;
  const productInputs = productAssets.map((asset): TierInput => ({ role: '参考', label: `产品参考图 ${asset.name}`, url: asset.url }));
  const origin = (subject: TierSubject, role: string, why: string): TierInput[] => !subject.sources?.[0] ? []
    : usesSource(subject, level) ? [{ role, label: `${subject.name} 原片参考，${why}`, url: subject.sources[0].url }]
    : subject.images.length ? [] : [{ role: '文生图', label: `${subject.name} 不用原片参考，只用描述` }];
  const yoursFor = (subject: TierSubject): TierInput[] => subject.images.length
    ? subject.images.map(image => ({ role: '换成', label: `${subject.name} ${image.generated ? '生成的新参考图' : '参考图'}`, url: image.url }))
    : states.subject === 'yours' || states.product === 'yours' ? [{ role: '换成', label: `${subject.name} 参考图（未上传）`, missing: true }] : [];
  // 复刻: no user refs → source crop keeps it consistent. 换角/改编: source crop + "换成" refs. Remix: never the source crop.
  const refInputs: TierInput[] = use === 'edit'
    ? [...productInputs, ...subjects.flatMap(subject => subject.images.length ? [] : origin(subject, '原片主体', '用来保持一致'))]
    : use === 'none'
      ? [...productInputs, ...subjects.flatMap((subject): TierInput[] => subject.images.length
        ? subject.images.map(image => ({ role: '参考', label: `${subject.name} ${image.generated ? '生成的新参考图' : '参考图'}`, url: image.url }))
        : origin(subject, '原片主体', '用来保持一致'))]
      : [...productInputs, ...subjects.flatMap(subject => [...origin(subject, '要替换', '把它换掉'), ...yoursFor(subject)])];
  const shotRefs: TierInput[] = (entry?.refImages || []).map(image => ({ role: '参考图', label: image.name || '上传的参考图', url: image.url }));
  refInputs.unshift(...shotRefs);
  const sourceFrame = (position: FramePosition) => {
    const saved = structuredCurrent ? entry?.frames?.find(item => item.position === position) : undefined;
    if (saved) return saved;
    const current = shotEvidenceFrames(shot).find(item => item.position === position)!;
    const legacy = entry?.frames?.find(item => item.position === position);
    return legacy ? { ...legacy, at: current.at } : undefined;
  };
  const original = (position: FramePosition, role: string): TierInput => {
    const found = sourceFrame(position);
    return { role, label: `原片${frameLabel[position]}${found ? ` ${found.at.toFixed(2)}s` : '（修正后才有）'}`, url: found?.url };
  };
  const newFirst = entry?.newFrames?.first;
  const generatedFirst: TierInput = { role: '底图', label: '新生成的首帧', url: newFirst?.url, missing: !newFirst };
  // 复刻/换角: each frame edits its own source frame. 改编/Remix: the first frame comes first; middle and last carry it plus their own source frame.
  const inputsFor = (position: FramePosition): TierInput[] => {
    if (use === 'edit' || use === 'swap') return [original(position, '底图'), ...refInputs];
    if (position !== 'first') return [generatedFirst, original(position, '构图参考'), ...refInputs];
    if (use === 'layout') return [original('first', '构图参考'), ...refInputs];
    return refInputs.length ? refInputs : [{ role: '文生图', label: '不输入图片' }];
  };
  const chained = use === 'layout' || use === 'none';
  const frames = framePositions.map((position): TierFramePlan => {
    const found = sourceFrame(position), autoExtra = extraFor(position), note = entry?.frameNotes?.[position];
    const extra = note ?? autoExtra, result = entry?.newFrames?.[position], dependsOnFirst = chained && position !== 'first';
    const final = `${prompt}\n${extra}`, custom = entry?.frameInputs?.[position];
    const defaults = inputsFor(position).flatMap((item): TierImage[] => item.url && !item.missing && item.role !== '文生图' ? [{ role: item.role, label: item.label, url: item.url }] : []);
    const images = custom?.images ?? defaults;
    const text = custom?.text ?? frameRequestText(final, images);
    const basis = hash(JSON.stringify([sourceBasis, level, final, text, images.map(image => image.url), found?.at]));
    return { position, label: frameLabel[position], extra, autoExtra, noteEdited: note !== undefined, final, basis,
      text, images, edited: !!custom,
      source: found ? { url: found.url, at: found.at } : undefined, inputs: inputsFor(position),
      order: chained ? (position === 'first' ? '第 1 步生成' : '第 2 步，带上新首帧生成') : '三张各自从原片同位置的帧编辑',
      result, dependsOnFirst, outdated: !!result && result.kind !== 'uploaded' && (structuredStale || !result.basis || result.basis !== basis || dependsOnFirst && result.firstFrom !== newFirst?.filename) };
  });
  return { shotId: shot.id, level, overridden: !!entry?.level, corrected: structuredCurrent,
    prompt, assembled, basis, manual, stale: manual && entry?.promptBasis !== basis, frames,
    canVideo: !!entry?.newFrames?.first && !!entry?.newFrames?.last, chained,
    video: 'veo_3_1-fl：新首帧 + 新尾帧 + 运动 prompt；新中间帧用来检查效果和当镜头封面', missingRefs: [...new Set(missingRefs)] };
}

/** Change one frame's input box (null = 恢复默认). Images changed on an edited text also rewrite its 【输入图片】 list. */
export function applyFrameInput(project: Project, shotId: string, position: FramePosition, patch: { text?: string; images?: TierImage[] } | null): Project {
  const rules = project.replication || defaultReplication;
  const entry: TierShot = rules.shots?.[shotId] || {};
  const inputs = { ...(entry.frameInputs || {}) };
  if (patch === null) delete inputs[position];
  else {
    const next = { ...inputs[position], ...patch };
    if (patch.images && next.text !== undefined) next.text = replaceImageBlock(next.text, patch.images);
    inputs[position] = next;
  }
  const shot: TierShot = { ...entry, frameInputs: Object.keys(inputs).length ? inputs : undefined };
  if (!shot.frameInputs) delete shot.frameInputs;
  return { ...project, replication: { ...rules, shots: { ...(rules.shots || {}), [shotId]: shot } } };
}

/** Build video instructions from the complete current shot analysis. */
export function tierVideoPrompt(shot: Shot) {
  return [
    'Generate this shot using the full video breakdown below. Preserve its scene, action, camera movement, pacing, speech, sound, visible text and transitions. Use the supplied new keyframes for the target subject identity and appearance when they differ from the source. Treat uncertain observations as unknown; do not invent missing details.',
    shotAnalysisPrompt(shot),
  ].join('\n\n');
}
