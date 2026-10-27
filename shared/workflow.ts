import type { GeneratedVideo, Project, WorkflowStage, WorkflowTarget } from './domain';
import { validateMarket } from './domain';
import { buildVeoPlan } from './veo-plan';
import { buildVeoUnitPrompt } from './export';
import { keyframeCurrent } from './storyboard';

export const workflowStages: { id: WorkflowStage; label: string; description: string }[] = [
  { id: 'analysis', label: '理解参考视频', description: '提取镜头、动作和原片台词' },
  { id: 'rewrite', label: '产品与创意改写', description: '对照原片逐镜头生成描述与复刻关键帧' },
  { id: 'generation', label: '逐镜头图生视频', description: '用每个复刻关键帧和描述生成对应镜头片段' },
  { id: 'composition', label: '完成最终视频', description: '处理声音、字幕和片段拼接' },
];
export const keyframeWorkflowStages: { id: WorkflowStage; label: string; description: string }[] = [
  { id: 'analysis', label: '视频拆解', description: '提取每个参考镜头的关键帧与分析' },
  { id: 'rewrite', label: '产品与创意改写', description: '结合产品信息，逐镜头改写场景与动作描述' },
  { id: 'keyframe', label: '生成复刻关键帧', description: '生成对应镜头的图生视频首帧，完成后停下供你检查' },
];

export function workflowBusy(project: Project) {
  return project.workflow?.status === 'running' || project.workflow?.status === 'pausing';
}

export function workflowRequirements(project: Project, target: WorkflowTarget = 'keyframes') {
  const missing: string[] = [];
  if (!project.assets.some(asset => asset.kind === 'video')) missing.push('上传参考视频');
  if ((project.promptFlow || 'localized') === 'localized') {
    if (!project.product.name.trim()) missing.push('填写产品名称');
    if (!project.product.facts.trim()) missing.push('填写已确认的产品卖点');
    if (!project.assets.some(asset => asset.kind === 'product')) missing.push('上传产品参考图');
  }
  if (target === 'keyframes' && project.promptFlow === 'direct-analysis') missing.push('选择产品与创意改写路径以生成关键帧');
  if (target === 'video' && !['9:16', '16:9'].includes(project.market.aspectRatio)) missing.push('选择 9:16 或 16:9 的视频画幅');
  const marketError = validateMarket(project.market);
  if (marketError) missing.push(marketError);
  return missing;
}

export function productionSources(project: Project): (GeneratedVideo | undefined)[] {
  if (!project.rewrite || project.rewriteStale) return [];
  const mode = project.productionMode || 'veo-native';
  return buildVeoPlan(project.rewrite.shots).map(unit => [...project.generatedVideos].reverse().find(video =>
    video.unitId === unit.id && (video.productionMode || 'veo-native') === mode && videoCurrent(project, video) && video.status === 'completed' && !!video.filename));
}

export function videoCurrent(project: Project, video: GeneratedVideo) {
  if (video.stale) return false;
  const gridId = video.storyboardGridId || video.gridId;
  if (gridId) return !!(project.storyboardGrids || []).some(grid => grid.id === gridId);
  if (project.rewriteStale) return false;
  if (project.promptFlow === 'direct-analysis') return true;
  const shot = project.rewrite?.shots.find(shot => shot.id === video.keyframeShotId);
  return !!shot && keyframeCurrent(project, shot) && video.mode === 'i2v' &&
    video.keyframeFilename === shot.keyframe?.filename && video.keyframeBasis === shot.keyframe?.basis;
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
  return project.rewrite && !project.rewriteStale ? buildVeoPlan(project.rewrite.shots).length : project.analysis?.shots.length || Math.ceil(duration / 8);
}

export function editableUnitPrompt(project: Project, unit: ReturnType<typeof buildVeoPlan>[number]) {
  const basis = buildVeoUnitPrompt(project, unit);
  const draft = project.veoPromptDrafts?.[`${project.productionMode || 'veo-native'}:${unit.id}`];
  return draft?.basis === basis ? draft.prompt : basis;
}

export type WorkflowAction = { kind: 'analysis' | 'rewrite' | 'compose' } | { kind: 'keyframe'; shotId: string } | { kind: 'generation'; unitId: string; recoverId?: string } | { kind: 'completed' };
export function nextWorkflowAction(project: Project, target: WorkflowTarget = project.workflow?.target || 'keyframes'): WorkflowAction {
  if (!project.analysis) return { kind: 'analysis' };
  if (!project.rewrite || project.rewriteStale) return { kind: 'rewrite' };
  if (project.promptFlow !== 'direct-analysis') {
    const mapping = project.rewrite.shots.map(shot => shot.sourceShotId);
    if (mapping.length !== project.analysis.shots.length || new Set(mapping).size !== mapping.length || mapping.some(id => !id || !project.analysis!.shots.some(shot => shot.id === id))) return { kind: 'rewrite' };
    const pending = project.rewrite.shots.find(shot => !keyframeCurrent(project, shot));
    if (pending) return { kind: 'keyframe', shotId: pending.id };
  }
  if (target === 'keyframes') return { kind: 'completed' };
  const units = buildVeoPlan(project.rewrite.shots);
  const sources = productionSources(project);
  const index = sources.findIndex(video => !video);
  if (index >= 0) {
    const unitId = units[index].id;
    const latest = [...project.generatedVideos].reverse().find(video => video.unitId === unitId && videoCurrent(project, video) && (video.productionMode || 'veo-native') === (project.productionMode || 'veo-native'));
    return { kind: 'generation', unitId, recoverId: latest?.requestId && latest.status === 'failed' ? latest.id : undefined };
  }
  return finalVideo(project) ? { kind: 'completed' } : { kind: 'compose' };
}
