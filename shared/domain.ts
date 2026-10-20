import { z } from 'zod';
import type { RemixPromptPhase, RemixWorkflow } from './remix';

export const MODEL = 'gemini-3.8-flash';
export const countries = [
  { code: 'US', name: '美国', language: 'en-US', currency: 'USD', locale: '美式英语；英制单位可补充公制；价格以美元表达。' },
  { code: 'GB', name: '英国', language: 'en-GB', currency: 'GBP', locale: '英式拼写与口语；价格以英镑表达；避免照搬美式表达。' },
  { code: 'AU', name: '澳大利亚', language: 'en-AU', currency: 'AUD', locale: '澳大利亚英语；公制单位；注意当地季节与北半球相反。' },
  { code: 'DE', name: '德国', language: 'de-DE', currency: 'EUR', locale: '德语；公制单位；清晰具体地解释使用方式与商品规格。' },
  { code: 'FR', name: '法国', language: 'fr-FR', currency: 'EUR', locale: '自然法语；公制单位；货币和小数格式采用当地习惯。' },
  { code: 'BR', name: '巴西', language: 'pt-BR', currency: 'BRL', locale: '巴西葡萄牙语；不要使用葡萄牙本土用词替代；公制单位。' },
  { code: 'JP', name: '日本', language: 'ja-JP', currency: 'JPY', locale: '自然日语；日元不显示小数；简洁清晰的字幕。' },
] as const;
export const languages = [
  ['en-US', 'English · 美国'], ['en-GB', 'English · 英国'], ['en-AU', 'English · 澳大利亚'],
  ['de-DE', 'Deutsch'], ['fr-FR', 'Français'], ['pt-BR', 'Português · 巴西'], ['ja-JP', '日本語'],
] as const;
export const platforms = [
  { id: 'tiktok', name: 'TikTok', detail: '自然口语 · 快速进入演示', guidance: '优先 9:16。开头迅速建立使用情境或问题，用可见动作演示产品，结尾一个明确 CTA。TikTok Shop 仅在用户选择站内购买且已配置店铺时使用商品卡引导。' },
  { id: 'reels', name: 'Instagram Reels', detail: '视觉演示 · 生活场景', guidance: '优先 9:16、有音轨，字幕与商品置于平台 UI 遮挡区以外。使用平台原生节奏，CTA 区分自然流量的主页链接与广告落地页。' },
  { id: 'shorts', name: 'YouTube Shorts', detail: '快速讲清 · 演示价值', guidance: '以竖屏短内容为创意方向，快速展示用途，清晰配音与字幕。不臆造可点击链接位置或购物组件；CTA 以用户填写的实际购买路径为准。' },
] as const;
export const roles = { hook: '吸引注意', demo: '商品演示', proof: '卖点证据', cta: '行动引导', other: '过渡内容' } as const;

export const productSchema = z.object({
  name: z.string().max(160), category: z.string().max(100), facts: z.string().max(8000),
  audience: z.string().max(2000), price: z.string().max(50), currency: z.enum(['USD', 'GBP', 'AUD', 'EUR', 'BRL', 'JPY']),
  offer: z.string().max(2000), landingUrl: z.string().max(1000),
});
export const marketSchema = z.object({
  country: z.enum(['US', 'GB', 'AU', 'DE', 'FR', 'BR', 'JP']),
  language: z.enum(['en-US', 'en-GB', 'en-AU', 'de-DE', 'fr-FR', 'pt-BR', 'ja-JP']),
  platform: z.enum(['tiktok', 'reels', 'shorts']), destination: z.enum(['shop', 'website']),
  cta: z.string().max(1000), tone: z.enum(['natural', 'expert', 'energetic']),
  duration: z.enum(['original', '15', '30', '45', '60']), people: z.enum(['preserve', 'localize', 'hands']),
  keepStructure: z.boolean(), subtitles: z.boolean(), aspectRatio: z.enum(['9:16', '16:9', '4:5', '1:1']),
});
export const replicationSchema = z.object({
  preserve: z.string().trim().max(3000),
  change: z.string().trim().max(3000),
});
export const focusCategorySchema = z.enum(['scene', 'subject', 'action', 'camera', 'editing', 'audio', 'text', 'product', 'other']);
export const focusCandidateSchema = z.object({
  category: focusCategorySchema, text: z.string().trim().min(1).max(400),
  evidenceAt: z.number().min(0).max(2700).optional(), selected: z.boolean(),
});
export const focusPointSchema = focusCandidateSchema.extend({
  id: z.string().max(80), source: z.enum(['ai', 'user']), userEdited: z.boolean(),
});
export const shotSchema = z.object({
  id: z.string().max(80), start: z.number().min(0).max(2700), end: z.number().min(0).max(2700),
  role: z.enum(['hook', 'demo', 'proof', 'cta', 'other']),
  visual: z.string().max(6000), action: z.string().max(4000), camera: z.string().max(2000),
  narration: z.string().max(4000), onScreenText: z.string().max(2000), sound: z.string().max(2000),
  productPresence: z.string().max(2000), uncertainty: z.string().max(2000),
  subject: z.string().max(3000).optional(), effects: z.string().max(3000).optional(),
  transition: z.string().max(2000).optional(), reconstructionPrompt: z.string().max(8000).optional(),
  evidenceFrames: z.array(z.object({ at: z.number().min(0).max(2700), reason: z.string().max(1000) })).max(3).optional(),
  focusPoints: z.array(focusPointSchema).max(12).optional(),
});
export const shotSuggestionSchema = shotSchema.omit({ id: true, start: true, end: true, evidenceFrames: true }).extend({
  analyzedAt: z.string(), source: z.enum(['video', 'frames']),
});
export const analysisReviewSchema = z.object({
  pendingIds: z.array(z.string().max(80)).max(120),
  suggestions: z.record(z.string(), shotSuggestionSchema),
  globalFocusSuggestion: z.array(focusPointSchema).max(12).optional(),
});
export const analysisSchema = z.object({
  summary: z.string().max(8000), sourceLanguage: z.string().max(100), duration: z.number().min(0.1).max(2700),
  sellingPoints: z.array(z.string().max(1500)).max(15),
  productAppearance: z.string().max(6000), shots: z.array(shotSchema).min(1).max(120),
  uncertainties: z.array(z.string().max(2000)).max(30),
  focusPoints: z.array(focusPointSchema).max(12).optional(),
  // Shots the user unticked: kept for display/restore, but not part of `shots`, so nothing downstream uses them.
  excludedShots: z.array(shotSchema).max(120).optional(),
});
// New model responses must supply the observation structure; old saved projects remain valid.
export const analysisModelSchema = analysisSchema.omit({ excludedShots: true }).extend({
  focusPoints: z.array(focusCandidateSchema).min(1).max(12),
  shots: z.array(shotSchema.extend({ focusPoints: z.array(focusCandidateSchema).min(1).max(8) }).required({
  subject: true, effects: true, transition: true, reconstructionPrompt: true, evidenceFrames: true,
  })).min(1).max(120),
});
export const rewriteShotSchema = shotSchema.extend({
  generationPrompt: z.string().max(8000),
  sourceShotId: z.string().max(80).optional(),
  keyframePrompt: z.string().max(8000).optional(),
  keyframe: z.object({
    status: z.enum(['running', 'completed', 'failed']), basis: z.string().max(80),
    prompt: z.string().max(100000), model: z.string().max(160),
    attemptId: z.uuid().optional(),
    sourceAt: z.number(), sourceFrameUrl: z.string().max(500),
    filename: z.string().max(200).optional(), url: z.string().max(500).optional(),
    mime: z.enum(['image/png', 'image/jpeg', 'image/webp']).optional(),
    error: z.string().max(2000).optional(), generatedAt: z.string().optional(),
  }).optional(),
});
export const rewriteSchema = z.object({
  angle: z.string().max(3000), audienceInsight: z.string().max(3000),
  hookVariants: z.array(z.object({ label: z.string().max(200), text: z.string().max(1000) })).min(1).max(3),
  localizationNotes: z.array(z.string().max(2000)).max(15),
  productionNotes: z.array(z.string().max(2000)).max(15),
  globalPrompt: z.string().max(12000), negativePrompt: z.string().max(6000),
  shots: z.array(rewriteShotSchema).min(1).max(120),
});
export const rewriteModelSchema = rewriteSchema.extend({
  shots: z.array(rewriteShotSchema.omit({ keyframe: true }).required({ sourceShotId: true, keyframePrompt: true })).min(1).max(120),
});
export type Product = z.infer<typeof productSchema>;
export type Market = z.infer<typeof marketSchema>;
export type Replication = z.infer<typeof replicationSchema>;
export type FocusPoint = z.infer<typeof focusPointSchema>;
export type FocusCandidate = z.infer<typeof focusCandidateSchema>;
export type Shot = z.infer<typeof shotSchema>;
export type ShotSuggestion = z.infer<typeof shotSuggestionSchema>;
export type AnalysisReview = z.infer<typeof analysisReviewSchema>;
export type Analysis = z.infer<typeof analysisSchema>;
export type Rewrite = z.infer<typeof rewriteSchema>;
export type Asset = {
  id: string; kind: 'video' | 'product'; name: string; mime: string; size: number;
  url: string; filename: string; thumbnail?: string; duration?: number; width?: number; height?: number; hasAudio?: boolean;
};
export type Job = {
  id: string; kind: 'analysis' | 'analysis-refine' | 'rewrite' | 'keyframe' | 'generation' | 'composition' | 'remix-character' | 'remix-plan' | 'remix-video' | 'remix-recover'; status: 'running' | 'completed' | 'failed' | 'needs-input';
  remixPhase?: RemixPromptPhase; imageBasis?: string; progress: number; message: string; startedAt: string; finishedAt?: string; videoId?: string; unitId?: string; shotId?: string;
};
export type ProductionMode = 'veo-native' | 'tts-subtitles';
export type TtsTimingNotice = { targetDuration: number; requiredDuration: number; voice: string; basis: string };
export type WorkflowMode = 'automatic' | 'manual';
export type PromptFlow = 'direct-analysis' | 'localized';
export type WorkflowStage = 'analysis' | 'rewrite' | 'keyframe' | 'generation' | 'composition' | 'completed';
export type WorkflowTarget = 'keyframes' | 'video';
export type WorkflowRun = {
  id: string; status: 'running' | 'pausing' | 'paused' | 'needs-input' | 'failed' | 'completed';
  stage: WorkflowStage; message: string; startedAt: string; finishedAt?: string;
  target?: WorkflowTarget;
  maxNewClips: number; newClipCount: number; unitId?: string;
};
export const automaticSettingsSchema = z.object({
  resolution: z.enum(['720p', '1080p', 'lite']).default('720p'),
  aspectRatio: z.enum(['9:16', '16:9']).default('9:16'),
});
export type AutomaticSettings = z.infer<typeof automaticSettingsSchema>;
export type ModelRequestSnapshot = {
  model: string; transport: string; systemInstruction: string; prompt: string;
  responseSchema: unknown; media: { kind: string; mimeType?: string; size?: number; mediaProcessing?: string }[];
  parameters: Record<string, string | number | boolean>;
  recordedAt: string;
};
export type GeneratedVideo = {
  id: string; provider: 'veo-3.1' | 'grok-imagine'; model: 'veo_3_1' | 'veo_3_1-fl' | 'veo_3_1-components' | 'grok-imagine-video-1.5'; shotId: string;
  mode?: 't2v' | 'i2v' | 'r2v'; imageUrls?: string[]; resolution?: '720p' | '1080p' | 'lite';
  unitId?: string; sourceShotIds?: string[]; targetStart?: number; targetEnd?: number; targetDuration?: number;
  requestId?: string; status: 'running' | 'completed' | 'failed'; prompt: string; productionMode?: ProductionMode;
  duration: number; aspectRatio: Market['aspectRatio'] | '16:9'; startedAt: string; finishedAt?: string;
  filename?: string; url?: string; mime?: string; size?: number; width?: number; height?: number;
  hasAudio?: boolean; thumbnail?: string; stale?: boolean; error?: string;
  defaultPrompt?: string; providerRequest?: { model: string; prompt: string; resolution: string; aspect_ratio: string; images?: string[] };
  keyframeShotId?: string; keyframeFilename?: string; keyframeBasis?: string; keyframeUrl?: string;
};
export type ComposedVideo = {
  id: string; mode: ProductionMode; unitId?: string; sourceVideoIds: string[]; voice: string;
  filename: string; url: string; subtitleFilename?: string; subtitleUrl?: string;
  duration: number; startedAt: string; finishedAt: string; stale?: boolean;
  renderTrace?: {
    timingVersion?: 'continuous-v1'; targetDuration?: number; extendedBy?: number;
    speechTimeline?: { shotId: string; text: string; start: number; end: number; sourceDuration: number; speed: number }[];
    voiceSegments: { shotId: string; text: string; sourceDuration: number; speed: number; start: number; offset: number; length: number }[];
    captionCues: { shotId: string; start: number; end: number; headline: string; caption: string }[];
    filterGraph: string; videoCodec: string; audioCodec: string; originalAudio: 'removed';
  };
};
export type AnalysisMeta = {
  mode: 'agentic-video' | 'native-video' | 'sampled-frames';
  transport: 'gemini-inline' | 'gemini-files' | 'openai-images';
  audioSubmitted: boolean; requestedModel: string; providerModel?: string; agenticTrace?: boolean; analyzedAt: string;
};
export const defaultWorkspace = { id: 'default', title: '我的工作空间' } as const;
export type WorkspaceProject = { id: string; workspaceId: string; title: string; createdAt: string; updatedAt: string; revision: number };
// The existing production record and its API retain the Project name for compatibility; each record represents one creative.
export type Project = {
  id: string; title: string; createdAt: string; updatedAt: string; revision: number; isDemo: boolean;
  parentProjectId?: string;
  archivedAt?: string;
  product: Product; market: Market; replication?: Replication; assets: Asset[]; analysis: Analysis | null; rewrite: Rewrite | null;
  analysisReview?: AnalysisReview;
  analysisMeta?: AnalysisMeta | null;
  analysisRequest?: ModelRequestSnapshot | null; rewriteRequest?: ModelRequestSnapshot | null;
  rewriteStale: boolean; generatedVideos: GeneratedVideo[]; composedVideos?: ComposedVideo[];
  productionMode?: ProductionMode; ttsVoice?: string; job: Job | null; model: string; usage: { input: number; output: number };
  workflowMode?: WorkflowMode; workflow?: WorkflowRun | null; automaticSettings?: AutomaticSettings; jobHistory?: Job[];
  promptFlow?: PromptFlow;
  veoPromptDrafts?: Record<string, { prompt: string; basis: string }>;
  ttsTimingNotice?: TtsTimingNotice;
  remix?: RemixWorkflow;
};
export type ProjectSummary = Pick<Project, 'id' | 'title' | 'parentProjectId' | 'updatedAt' | 'isDemo' | 'archivedAt'> & { stage: number };
export const emptyProduct: Product = { name: '', category: '家居生活', facts: '', audience: '', price: '', currency: 'USD', offer: '', landingUrl: '' };
export const defaultMarket: Market = { country: 'US', language: 'en-US', platform: 'tiktok', destination: 'website', cta: '', tone: 'natural', duration: 'original', people: 'preserve', keepStructure: true, subtitles: true, aspectRatio: '9:16' };
export const defaultReplication: Replication = {
  preserve: '参考视频的整体视觉形式、场景、主体角色与动作、构图、运镜、剪辑顺序与节奏、声音表达方式。',
  change: '按本项目的产品资料和参考图替换指定主体或物品；人物面孔与少量配色可按项目要求调整。',
};
export const projectPatchSchema = z.object({
  revision: z.number().int().nonnegative(), title: z.string().trim().min(1).max(120),
  parentProjectId: z.uuid().optional(),
  product: productSchema, market: marketSchema, replication: replicationSchema.optional(), analysis: analysisSchema.nullable(), analysisReview: analysisReviewSchema.optional(), rewrite: rewriteSchema.nullable(),
  productionMode: z.enum(['veo-native', 'tts-subtitles']).default('veo-native'),
  ttsVoice: z.string().max(120).default(''),
  automaticSettings: automaticSettingsSchema.optional(),
  promptFlow: z.enum(['direct-analysis', 'localized']).default('localized'),
  veoPromptDrafts: z.record(z.string(), z.object({ prompt: z.string(), basis: z.string() })).default({}),
});
export function stageOf(project: Pick<Project, 'assets' | 'analysis' | 'rewrite' | 'rewriteStale'>) {
  return project.analysis ? 3 : project.assets.some(a => a.kind === 'video') ? 2 : 1;
}
export function timeLabel(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}
export function validateTimeline(shots: Pick<Shot, 'id' | 'start' | 'end'>[], duration?: number) {
  const ids = new Set<string>();
  let previousEnd = 0;
  for (const shot of shots) {
    if (ids.has(shot.id) || shot.end <= shot.start || shot.start < previousEnd - 0.05) return '镜头编号应唯一，结束时间应晚于开始时间，镜头不能重叠。';
    if (duration && shot.end > duration + 0.5) return '镜头时间超出视频时长。';
    ids.add(shot.id); previousEnd = shot.end;
  }
  return null;
}
export function validateContinuousTimeline(shots: Pick<Shot, 'id' | 'start' | 'end'>[], duration: number) {
  const basic = validateTimeline(shots, duration);
  if (basic) return basic;
  if (shots[0]?.start > 0.05) return '本地化分镜必须从 0 秒开始。';
  for (let index = 1; index < shots.length; index++) {
    if (Math.abs(shots[index].start - shots[index - 1].end) > 0.05) return '本地化分镜不能留出未规划的时间空档。';
  }
  if (Math.abs(shots.at(-1)!.end - duration) > 0.5) return '本地化分镜的结束时间必须匹配目标时长。';
  return null;
}
export function validateMarket(market: Market) {
  if (market.destination === 'shop' && market.platform !== 'tiktok') return '当前站内商品卡方案仅适用于 TikTok；请选择独立站并填写实际购买路径。';
  return null;
}
