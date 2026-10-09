import { z } from 'zod';
import type { Project, Shot } from './domain';

export const REMIX_MODEL = 'omni_flash_10s';
export const REMIX_SECONDS = 10;
export const remixBgmOptions = { reference: '参考原视频 BGM', remix: '二创 BGM' } as const;
export const remixPromptSteps = [
  {
    title: '提取原片镜头信息',
    description: '从视频拆解结果中，取出每个镜头的主体、服装、场景、道具、动作、机位、画面文字和转场方式。',
  },
  {
    title: '结合关键帧补充、校正细节',
    description: '对照每个镜头的首帧、中间关键帧和尾帧宫格画面，确认服装颜色、人物姿势、商品外观和背景布局，把拆解描述整理成具体、可生成的画面描述。',
  },
] as const;

export const remixSettingsSchema = z.object({
  character: z.string().trim().max(3000).default('一位全新虚构的亚洲年轻成年女性，约25岁，齐下巴深棕色短发，自然妆容，自信俏皮。'),
  preserve: z.string().trim().max(4000).default('保留原视频的服装、品牌、商品道具、场景、镜头顺序和换装结构。'),
  changes: z.string().trim().max(4000).default('更换为上述新人物，重新演绎动作，并将全部镜头编排为10秒。'),
  resolution: z.enum(['720p', '1080p']).default('720p'),
  aspectRatio: z.enum(['9:16', '16:9']).default('9:16'),
  bgmMode: z.enum(['reference', 'remix']).default('reference'),
});
export type RemixSettings = z.infer<typeof remixSettingsSchema>;
export const defaultRemixSettings = remixSettingsSchema.parse({});
export function getRemixSettings(project: Pick<Project, 'remix'>): RemixSettings {
  return { ...defaultRemixSettings, ...project.remix?.settings, bgmMode: project.remix?.settings.bgmMode || 'reference' };
}
export function buildRemixAudio(shots: Pick<Shot, 'sound' | 'narration'>[], settings: RemixSettings, hasAudio?: boolean) {
  const originalMusic = [...new Set(shots.map(shot => shot.sound).filter(Boolean))].join('；');
  const narration = shots.flatMap((shot, index) => shot.narration ? [`镜头 ${index + 1} 原片口播：${shot.narration}`] : []);
  return [
    `配音背景音：${remixBgmOptions[settings.bgmMode || 'reference']}`,
    settings.bgmMode === 'remix'
      ? '背景音乐：创作一段新的原创 BGM，根据当前视频的场景、情绪、动作与剪辑节奏设计风格、配器和节拍。贯穿整条视频，配合镜头衔接并自然收尾。原片音乐描述仅作观察资料，不能作为沿用原曲或原配器的要求。'
      : hasAudio === false
        ? '背景音乐：原视频没有音轨，保持无 BGM。'
        : originalMusic
          ? `背景音乐：参考原视频分析记录的音乐风格、节奏、配器与氛围，为当前视频生成相应配乐。原片背景音参考：${originalMusic}`
          : '背景音乐：原片分析未记录可确认的 BGM，不自行编造原曲或音乐风格，保持无 BGM。',
    narration.length ? `配音：保留原片记录的口播内容与语言，除非用户明确要求修改；BGM 不盖过人声。\n${narration.join('\n')}` : '配音：原片未记录口播，默认不额外添加旁白或对白；用户明确提出配音要求时按其要求执行。',
    '原片声音描述属于观察记录；实际背景音乐执行本节所选模式，不因其他镜头资料中的声音描述改变此选择。',
  ].join('\n');
}
export const remixDetailVersion = 'source-detail-patches-v2';
export const remixSourceFields = {
  subject: '主体 / 服装', visual: '画面 / 场景 / 道具', productPresence: '商品外观',
  action: '动作', camera: '机位 / 运镜', onScreenText: '画面文字', effects: '光影 / 画面效果',
  transition: '转场', reconstructionPrompt: '复刻描述',
} as const;
const sourceFieldSchema = z.enum(['subject', 'visual', 'productPresence', 'action', 'camera', 'onScreenText', 'effects', 'transition', 'reconstructionPrompt']);
const correctionChangeSchema = z.object({
  field: z.enum(['主体', '服装', '场景', '道具', '动作', '机位', '画面文字', '转场']),
  sourceField: sourceFieldSchema.optional(),
  kind: z.enum(['补充', '校正', '确认']),
  original: z.string().max(8000), corrected: z.string().min(1).max(8000),
  evidencePositions: z.array(z.enum(['first', 'middle', 'last'])).min(1).max(3),
});
// The model supplies only evidence-backed patches. The server retains the full source text.
export const remixCorrectionPatchSchema = z.object({ shots: z.array(z.object({
  sourceShotId: z.string().max(80),
  changes: z.array(correctionChangeSchema.required({ sourceField: true })).max(48),
  uncertainties: z.array(z.string().max(1000)).max(12),
})).min(1).max(120) });
export const remixCorrectionSchema = z.object({
  shots: z.array(z.object({
    sourceShotId: z.string().max(80),
    description: z.string().min(1).max(40000),
    correctedSource: z.record(z.string(), z.string()).optional(),
    changes: z.array(correctionChangeSchema).max(48),
    uncertainties: z.array(z.string().max(1000)).max(12),
  })).min(1).max(120),
});
export type RemixCorrection = z.infer<typeof remixCorrectionSchema> & {
  id: string; basis: string; model: string; startedAt: string; completedAt: string;
  sourceShots: NonNullable<Project['analysis']>['shots'];
  evidence: { shotId: string; sourceStart: number; sourceEnd: number; frames: { at: number; url: string; position: 'first' | 'middle' | 'last' }[] }[];
};
export function applyRemixShotPatches(source: Shot, patch: z.infer<typeof remixCorrectionPatchSchema>['shots'][number]) {
  const correctedSource = Object.fromEntries(Object.keys(remixSourceFields).map(field => [field, source[field as keyof typeof remixSourceFields] || '']));
  for (const change of patch.changes) {
    const value = correctedSource[change.sourceField];
    if (change.kind === '确认') continue; // A confirmation cannot replace detailed source text with a summary.
    if (change.kind === '补充') {
      correctedSource[change.sourceField] = [value, change.corrected].filter(Boolean).join('\n');
    } else {
      if (!change.original || !value.includes(change.original) || value.indexOf(change.original) !== value.lastIndexOf(change.original)) {
        throw new Error(`镜头 ${source.id} 的${remixSourceFields[change.sourceField]}校正未准确引用唯一原文，已停止覆盖，请重试。`);
      }
      correctedSource[change.sourceField] = value.replace(change.original, change.corrected);
    }
  }
  const uncertainties = [...new Set([source.uncertainty, ...patch.uncertainties].filter(Boolean))];
  const description = [
    ...Object.entries(remixSourceFields).map(([field, label]) => correctedSource[field] && `${label}：${correctedSource[field]}`),
    source.narration && `原片口播：${source.narration}`, source.sound && `原片声音：${source.sound}`,
    uncertainties.length && `待确认：${uncertainties.join('；')}`,
  ].filter(Boolean).join('\n');
  return { ...patch, correctedSource, description, uncertainties };
}
export function buildRemixCorrectionPrompt(correction: RemixCorrection) {
  return correction.shots.map((shot, index) => {
    const source = correction.sourceShots.find(item => item.id === shot.sourceShotId);
    return `镜头 ${index + 1}（${shot.sourceShotId}${source ? ` · 原片 ${source.start.toFixed(2)}–${source.end.toFixed(2)}s` : ''}）\n${shot.description}`;
  }).join('\n\n');
}
export type RemixPromptPhase = 'evidence' | 'correction' | 'prompt';
export const remixPlanSchema = z.object({
  direction: z.string().min(1).max(6000),
  audio: z.string().max(3000),
  shots: z.array(z.object({
    sourceShotId: z.string().max(80), start: z.number().min(0).max(10), end: z.number().min(0).max(10),
    description: z.string().min(1).max(40000),
  })).min(1).max(120),
});
export const remixTimingSchema = z.object({ shots: z.array(z.object({
  sourceShotId: z.string().max(80), start: z.number().min(0).max(10), end: z.number().min(0).max(10),
})).min(1).max(120) });
export type RemixPlan = z.infer<typeof remixPlanSchema> & {
  basis: string; prompt: string; generatedAt: string; model: string; correctionId?: string;
  evidence: { shotId: string; sourceStart: number; sourceEnd: number; frames: { at: number; url: string }[] }[];
};
export type RemixCharacter = {
  source?: 'generated' | 'uploaded'; name?: string;
  basis: string; prompt: string; model: string; generatedAt: string;
  filename: string; url: string; mime: 'image/png' | 'image/jpeg' | 'image/webp';
};
export type RemixVideo = {
  id: string; basis: string; model: typeof REMIX_MODEL; status: 'running' | 'completed' | 'failed';
  prompt: string; resolution: RemixSettings['resolution']; aspectRatio: RemixSettings['aspectRatio'];
  bgmMode?: RemixSettings['bgmMode'];
  characterFilename: string; requestId?: string; startedAt: string; finishedAt?: string; error?: string;
  filename?: string; url?: string; thumbnail?: string; duration?: number; width?: number; height?: number; hasAudio?: boolean;
};
export type RemixWorkflow = { settings: RemixSettings; character?: RemixCharacter; correction?: RemixCorrection; plan?: RemixPlan; videos: RemixVideo[] };
export type RemixAction = 'character' | 'plan' | 'video' | 'recover';

// Use the same serializable basis on the client and server. Old outputs remain
// available, but changed inputs cannot silently reuse an old character or plan.
export function characterBasis(project: Pick<Project, 'remix'>) {
  const settings = project.remix?.settings || defaultRemixSettings;
  return JSON.stringify([settings.character, settings.aspectRatio]);
}
export function remixPlanBasis(project: Pick<Project, 'analysis' | 'assets' | 'remix'>) {
  const settings = project.remix?.settings || defaultRemixSettings;
  const inputs = [project.assets.find(asset => asset.kind === 'video')?.id, project.analysis,
    { character: settings.character, preserve: settings.preserve, changes: settings.changes, aspectRatio: settings.aspectRatio, bgmMode: settings.bgmMode || 'reference' }, project.remix?.character?.filename];
  if (project.remix?.correction) inputs.push(project.remix.correction.id);
  inputs.push(remixDetailVersion);
  return JSON.stringify(inputs);
}
export function remixCorrectionBasis(project: Pick<Project, 'analysis' | 'assets'>) {
  return JSON.stringify([project.assets.find(asset => asset.kind === 'video')?.id, project.analysis, remixDetailVersion]);
}
export function remixCorrectionCurrent(project: Pick<Project, 'analysis' | 'assets' | 'remix'>) {
  return !!project.remix?.correction && project.remix.correction.basis === remixCorrectionBasis(project);
}
export function remixCharacterCurrent(project: Pick<Project, 'remix'>) {
  return !!project.remix?.character && (project.remix.character.source === 'uploaded' || project.remix.character.basis === characterBasis(project));
}
export function remixPlanCurrent(project: Pick<Project, 'analysis' | 'assets' | 'remix'>) {
  return remixCharacterCurrent(project) && !!project.remix?.plan && project.remix.plan.basis === remixPlanBasis(project);
}
export function remixVideoBasis(project: Pick<Project, 'remix'>) {
  return JSON.stringify([project.remix?.plan?.prompt, project.remix?.character?.filename,
    project.remix?.settings.resolution, project.remix?.settings.aspectRatio, project.remix?.settings.bgmMode || 'reference']);
}
export function buildRemixPrompt(plan: z.infer<typeof remixPlanSchema>, settings: RemixSettings) {
  return [
    `生成一条完整的${REMIX_SECONDS}秒、${settings.aspectRatio}视频。参考图中的人物是本片唯一人物参考，人物外观以参考图为准。`,
    `${settings.character ? `人物补充描述：${settings.character}。` : ''}所有镜头保持参考图中的同一张脸、发型、发色、体型和摄影质感。服装按校正后的镜头资料执行。`,
    `保留要求：${settings.preserve || '沿用原片的场景和镜头结构'}。修改要求：${settings.changes}。`,
    `整体编排：${plan.direction}`,
    '下列镜头资料保留原片细节并应用关键帧校正。原片的人物称谓、年龄和面容仅用于标记动作主体；实际人物身份、面容、发型和体型统一采用人物参考图。场景、服装、道具、动作顺序、运镜、光影、画面文字与转场按校正后的资料执行，只有用户明确要求修改的内容可以改变。资料中的原片绝对时间属于观察记录；实际动作和效果按每段分配时长执行。',
    ...plan.shots.map((shot, index) => `${shot.start.toFixed(2)}–${shot.end.toFixed(2)}秒，镜头${index + 1}（原片${shot.sourceShotId}）：${shot.description}`),
    `声音：${plan.audio}`,
    '逐镜头依次演绎，最终画面为单一全幅视频。人物比例正常，双手自然，商品外形稳定。',
  ].join('\n\n');
}
