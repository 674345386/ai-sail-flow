import type { GeneratedVideo, Project, WorkflowStage } from './domain';
import { validateMarket } from './domain';
import { buildVeoPlan } from './veo-plan';
import { buildVeoUnitPrompt } from './export';

export const workflowStages: { id: WorkflowStage; label: string; description: string }[] = [
  { id: 'analysis', label: '理解参考视频', description: '提取镜头、动作和原片台词' },
  { id: 'rewrite', label: '生成你的分镜', description: '结合产品事实、市场和目标语言改写' },
  { id: 'generation', label: '制作视频画面', description: '按时间线生成并下载视频片段' },
  { id: 'composition', label: '完成最终视频', description: '处理声音、字幕和片段拼接' },
];

export function workflowBusy(project: Project) {
  return project.workflow?.status === 'running' || project.workflow?.status === 'pausing';
}

export function workflowRequirements(project: Project) {
  const missing: string[] = [];
  if (!project.assets.some(asset => asset.kind === 'video')) missing.push('上传参考视频');
  if ((project.promptFlow || 'localized') === 'localized') {
    if (!project.product.name.trim()) missing.push('填写产品名称');
    if (!project.product.facts.trim()) missing.push('填写已确认的产品卖点');
  }
  if (!['9:16', '16:9'].includes(project.market.aspectRatio)) missing.push('选择 9:16 或 16:9 的视频画幅');
  const marketError = validateMarket(project.market);
  if (marketError) missing.push(marketError);
  return missing;
}

export function productionSources(project: Project): (GeneratedVideo | undefined)[] {
  if (!project.rewrite || project.rewriteStale) return [];
  const mode = project.productionMode || 'veo-native';
  return buildVeoPlan(project.rewrite.shots).map(unit => [...project.generatedVideos].reverse().find(video =>
    video.unitId === unit.id && (video.productionMode || 'veo-native') === mode && !video.stale && video.status === 'completed' && !!video.filename));
}

export function finalVideo(project: Project) {
  const sources = productionSources(project);
  if (!sources.length || sources.some(video => !video)) return undefined;
  const mode = project.productionMode || 'veo-native';
  return [...(project.composedVideos || [])].reverse().find(video => !video.unitId && !video.stale && video.mode === mode &&
    (mode === 'veo-native' || !project.ttsVoice || video.voice === project.ttsVoice) &&
    video.sourceVideoIds.length === sources.length && video.sourceVideoIds.every((id, index) => id === sources[index]?.id));
}

export function estimatedClips(project: Project) {
  const duration = project.market.duration === 'original' ? project.assets.find(asset => asset.kind === 'video')?.duration || project.analysis?.duration || 15 : Number(project.market.duration);
  return project.rewrite && !project.rewriteStale ? buildVeoPlan(project.rewrite.shots).length : Math.ceil(duration / 8);
}

export function editableUnitPrompt(project: Project, unit: ReturnType<typeof buildVeoPlan>[number]) {
  const basis = buildVeoUnitPrompt(project, unit);
  const draft = project.veoPromptDrafts?.[`${project.productionMode || 'veo-native'}:${unit.id}`];
  return draft?.basis === basis ? draft.prompt : basis;
}

export type WorkflowAction = { kind: 'analysis' | 'rewrite' | 'compose' } | { kind: 'generation'; unitId: string; recoverId?: string } | { kind: 'completed' };
export function nextWorkflowAction(project: Project): WorkflowAction {
  if (!project.analysis) return { kind: 'analysis' };
  if (!project.rewrite || project.rewriteStale) return { kind: 'rewrite' };
  const units = buildVeoPlan(project.rewrite.shots);
  const sources = productionSources(project);
  const index = sources.findIndex(video => !video);
  if (index >= 0) {
    const unitId = units[index].id;
    const latest = [...project.generatedVideos].reverse().find(video => video.unitId === unitId && !video.stale && (video.productionMode || 'veo-native') === (project.productionMode || 'veo-native'));
    return { kind: 'generation', unitId, recoverId: latest?.requestId && latest.status === 'failed' ? latest.id : undefined };
  }
  return finalVideo(project) ? { kind: 'completed' } : { kind: 'compose' };
}
