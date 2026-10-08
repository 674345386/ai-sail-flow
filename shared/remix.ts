import { z } from 'zod';
import type { Project } from './domain';

export const REMIX_MODEL = 'omni_flash_10s';
export const REMIX_SECONDS = 10;
export const remixSettingsSchema = z.object({
  character: z.string().trim().max(3000).default('一位全新虚构的亚洲年轻成年女性，约25岁，齐下巴深棕色短发，自然妆容，自信俏皮。'),
  preserve: z.string().trim().max(4000).default('保留原视频的服装、品牌、商品道具、场景、镜头顺序和换装结构。'),
  changes: z.string().trim().max(4000).default('更换为上述新人物，重新演绎动作，并将全部镜头编排为10秒。'),
  resolution: z.enum(['720p', '1080p']).default('720p'),
  aspectRatio: z.enum(['9:16', '16:9']).default('9:16'),
});
export type RemixSettings = z.infer<typeof remixSettingsSchema>;
export const defaultRemixSettings = remixSettingsSchema.parse({});
export const remixPlanSchema = z.object({
  direction: z.string().min(1).max(6000),
  audio: z.string().max(3000),
  shots: z.array(z.object({
    sourceShotId: z.string().max(80), start: z.number().min(0).max(10), end: z.number().min(0).max(10),
    description: z.string().min(1).max(6000),
  })).min(1).max(120),
});
export type RemixPlan = z.infer<typeof remixPlanSchema> & {
  basis: string; prompt: string; generatedAt: string; model: string;
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
  characterFilename: string; requestId?: string; startedAt: string; finishedAt?: string; error?: string;
  filename?: string; url?: string; thumbnail?: string; duration?: number; width?: number; height?: number; hasAudio?: boolean;
};
export type RemixWorkflow = { settings: RemixSettings; character?: RemixCharacter; plan?: RemixPlan; videos: RemixVideo[] };
export type RemixAction = 'character' | 'plan' | 'video' | 'recover';

// Use the same serializable basis on the client and server. Old outputs remain
// available, but changed inputs cannot silently reuse an old character or plan.
export function characterBasis(project: Pick<Project, 'remix'>) {
  const settings = project.remix?.settings || defaultRemixSettings;
  return JSON.stringify([settings.character, settings.aspectRatio]);
}
export function remixPlanBasis(project: Pick<Project, 'analysis' | 'assets' | 'remix'>) {
  const settings = project.remix?.settings || defaultRemixSettings;
  return JSON.stringify([project.assets.find(asset => asset.kind === 'video')?.id, project.analysis,
    { character: settings.character, preserve: settings.preserve, changes: settings.changes, aspectRatio: settings.aspectRatio }, project.remix?.character?.filename]);
}
export function remixCharacterCurrent(project: Pick<Project, 'remix'>) {
  return !!project.remix?.character && (project.remix.character.source === 'uploaded' || project.remix.character.basis === characterBasis(project));
}
export function remixPlanCurrent(project: Pick<Project, 'analysis' | 'assets' | 'remix'>) {
  return remixCharacterCurrent(project) && !!project.remix?.plan && project.remix.plan.basis === remixPlanBasis(project);
}
export function remixVideoBasis(project: Pick<Project, 'remix'>) {
  return JSON.stringify([project.remix?.plan?.prompt, project.remix?.character?.filename,
    project.remix?.settings.resolution, project.remix?.settings.aspectRatio]);
}
export function buildRemixPrompt(plan: z.infer<typeof remixPlanSchema>, settings: RemixSettings) {
  return [
    `生成一条完整的${REMIX_SECONDS}秒、${settings.aspectRatio}视频。参考图中的人物是本片唯一人物参考，人物外观以参考图为准。`,
    `${settings.character ? `人物补充描述：${settings.character}。` : ''}所有镜头保持参考图中的同一张脸、发型、发色、体型和摄影质感。服装按镜头切换。`,
    `保留要求：${settings.preserve || '沿用原片的场景和镜头结构'}。修改要求：${settings.changes}。`,
    `整体编排：${plan.direction}`,
    ...plan.shots.map((shot, index) => `${shot.start.toFixed(2)}–${shot.end.toFixed(2)}秒，镜头${index + 1}（原片${shot.sourceShotId}）：${shot.description}`),
    `声音：${plan.audio}`,
    '逐镜头依次演绎，最终画面为单一全幅视频。人物比例正常，双手自然，商品外形稳定。',
  ].join('\n\n');
}
