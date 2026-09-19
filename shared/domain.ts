import { z } from 'zod';

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
  keepStructure: z.boolean(), subtitles: z.boolean(), aspectRatio: z.enum(['9:16', '4:5', '1:1']),
});
export const shotSchema = z.object({
  id: z.string().max(80), start: z.number().min(0).max(2700), end: z.number().min(0).max(2700),
  role: z.enum(['hook', 'demo', 'proof', 'cta', 'other']),
  visual: z.string().max(6000), action: z.string().max(4000), camera: z.string().max(2000),
  narration: z.string().max(4000), onScreenText: z.string().max(2000), sound: z.string().max(2000),
  productPresence: z.string().max(2000), uncertainty: z.string().max(2000),
});
export const analysisSchema = z.object({
  summary: z.string().max(8000), sourceLanguage: z.string().max(100), duration: z.number().min(0.1).max(2700),
  sellingPoints: z.array(z.string().max(1500)).max(15),
  productAppearance: z.string().max(6000), shots: z.array(shotSchema).min(1).max(120),
  uncertainties: z.array(z.string().max(2000)).max(30),
});
export const rewriteSchema = z.object({
  angle: z.string().max(3000), audienceInsight: z.string().max(3000),
  hookVariants: z.array(z.object({ label: z.string().max(200), text: z.string().max(1000) })).min(1).max(3),
  localizationNotes: z.array(z.string().max(2000)).max(15),
  productionNotes: z.array(z.string().max(2000)).max(15),
  globalPrompt: z.string().max(12000), negativePrompt: z.string().max(6000),
  shots: z.array(shotSchema.extend({ generationPrompt: z.string().max(8000) })).min(1).max(120),
});
export type Product = z.infer<typeof productSchema>;
export type Market = z.infer<typeof marketSchema>;
export type Shot = z.infer<typeof shotSchema>;
export type Analysis = z.infer<typeof analysisSchema>;
export type Rewrite = z.infer<typeof rewriteSchema>;
export type Asset = {
  id: string; kind: 'video' | 'product'; name: string; mime: string; size: number;
  url: string; filename: string; thumbnail?: string; duration?: number; width?: number; height?: number; hasAudio?: boolean;
};
export type Job = {
  id: string; kind: 'analysis' | 'rewrite'; status: 'running' | 'completed' | 'failed';
  progress: number; message: string; startedAt: string; finishedAt?: string;
};
export type AnalysisMeta = {
  mode: 'native-video' | 'sampled-frames';
  transport: 'gemini-inline' | 'gemini-files' | 'openai-images';
  audioSubmitted: boolean; requestedModel: string; providerModel?: string; analyzedAt: string;
};
export type Project = {
  id: string; title: string; createdAt: string; updatedAt: string; revision: number; isDemo: boolean;
  product: Product; market: Market; assets: Asset[]; analysis: Analysis | null; rewrite: Rewrite | null;
  analysisMeta?: AnalysisMeta | null;
  rewriteStale: boolean; job: Job | null; model: string; usage: { input: number; output: number };
};
export type ProjectSummary = Pick<Project, 'id' | 'title' | 'updatedAt' | 'isDemo'> & { stage: number };
export const emptyProduct: Product = { name: '', category: '家居生活', facts: '', audience: '', price: '', currency: 'USD', offer: '', landingUrl: '' };
export const defaultMarket: Market = { country: 'US', language: 'en-US', platform: 'tiktok', destination: 'website', cta: '', tone: 'natural', duration: 'original', people: 'preserve', keepStructure: true, subtitles: true, aspectRatio: '9:16' };
export const projectPatchSchema = z.object({
  revision: z.number().int().nonnegative(), title: z.string().trim().min(1).max(120),
  product: productSchema, market: marketSchema, analysis: analysisSchema.nullable(), rewrite: rewriteSchema.nullable(),
});
export function stageOf(project: Pick<Project, 'assets' | 'analysis' | 'rewrite' | 'rewriteStale'>) {
  return project.rewrite && !project.rewriteStale ? 4 : project.analysis ? 3 : project.assets.some(a => a.kind === 'video') ? 2 : 1;
}
export function timeLabel(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}
export function validateTimeline(shots: Shot[], duration?: number) {
  const ids = new Set<string>();
  let previousEnd = 0;
  for (const shot of shots) {
    if (ids.has(shot.id) || shot.end <= shot.start || shot.start < previousEnd - 0.05) return '镜头编号应唯一，结束时间应晚于开始时间，镜头不能重叠。';
    if (duration && shot.end > duration + 0.5) return '镜头时间超出视频时长。';
    ids.add(shot.id); previousEnd = shot.end;
  }
  return null;
}
export function validateMarket(market: Market) {
  if (market.destination === 'shop' && market.platform !== 'tiktok') return '当前站内商品卡方案仅适用于 TikTok；请选择独立站并填写实际购买路径。';
  return null;
}
