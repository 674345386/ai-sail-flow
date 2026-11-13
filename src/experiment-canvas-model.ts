import type { Project } from '../shared/domain';
import { IMAGE_MODELS, IMAGE_QUALITIES, imageRequestSize } from '../shared/image-generation-options';
import { minimaxVideoInput } from '../shared/minimax-video';
import { activeExperimentMethod, type ExperimentGraph, type ExperimentNode, type ExperimentMethod } from '../shared/experiment';
import type { WorkbenchSource } from './ExperimentPlans';

export const CANVAS_REFERENCE_MIME = 'application/x-sail-experiment-node';
export type CanvasModel = { id: string; label: string; kind: 'image' | 'video'; tool: 'generate_image' | 'generate_minimax_video' | 'generate_video' };
export type CanvasStatus = { imageGeneration?: { configured?: boolean; model?: string }; videoGeneration?: { configured?: boolean }; minimaxVideoGeneration?: { configured?: boolean; models?: string[] }; keyframeStorage?: { configured?: boolean } };
export function canvasModels(status: CanvasStatus): CanvasModel[] {
  const models: CanvasModel[] = [];
  if (status.imageGeneration?.configured) for (const id of new Set([status.imageGeneration.model, ...IMAGE_MODELS].filter((id): id is string => !!id))) models.push({ id, label: id.replace('gpt-image-', 'GPT Image '), kind: 'image', tool: 'generate_image' });
  if (status.minimaxVideoGeneration?.configured) for (const id of (status.minimaxVideoGeneration.models || ['h3-video']).filter(id => ['h3-video', 'h3-video-flex'].includes(id))) models.push({ id, label: id === 'h3-video-flex' ? 'MiniMax H3 Flex' : 'MiniMax H3', kind: 'video', tool: 'generate_minimax_video' });
  if (status.videoGeneration?.configured) models.push({ id: 'omni_flash_10s', label: 'Omni Video', kind: 'video', tool: 'generate_video' });
  return models;
}
export function composerStep(graph: ExperimentGraph, selected?: ExperimentNode) {
  return selected?.kind === 'step' ? selected : selected?.kind === 'artifact' && !selected.runId && !selected.sourceId && !selected.content.trim()
    ? graph.nodes.find(node => node.kind === 'step' && selected.inputs.includes(node.id)) : undefined;
}
export function canvasOutputKind(graph: ExperimentGraph, step: ExperimentNode): 'image' | 'video' | undefined {
  const method = activeExperimentMethod(step);
  if (step.mediaType === 'image' || step.mediaType === 'video') return step.mediaType;
  if (/image/i.test(method?.model || '')) return 'image';
  if (/video|omni|veo|h3/i.test(method?.model || '')) return 'video';
  const output = graph.nodes.find(node => node.kind === 'artifact' && node.inputs.includes(step.id));
  return output?.mediaType === 'image' || output?.mediaType === 'video' ? output.mediaType : undefined;
}
export function parseCanvasRatio(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d+(?:\.\d+)?)[x:](\d+(?:\.\d+)?)$/.exec(value);
  if (!match || Number(match[2]) <= 0) return undefined;
  const ratio = Number(match[1]) / Number(match[2]);
  return Number.isFinite(ratio) && ratio >= .1 && ratio <= 10 ? ratio : undefined;
}
export function canvasNodeRatio(node: ExperimentNode, graph: ExperimentGraph, project: Project, natural?: number) {
  if (natural) return natural;
  const source = project.assets.find(item => item.id === node.sourceId) || project.agentImages?.find(item => item.id === node.sourceId) || project.generatedVideos.find(item => item.id === node.sourceId);
  if (source && 'width' in source && source.width && source.height) return source.width / source.height;
  const producer = node.kind === 'step' ? node : graph.nodes.find(item => item.kind === 'step' && node.inputs.includes(item.id));
  const method = producer && activeExperimentMethod(producer);
  return parseCanvasRatio(method?.parameters.size) || parseCanvasRatio(method?.parameters.aspectRatio) || node.display?.aspectRatio || (source && 'aspectRatio' in source ? parseCanvasRatio(source.aspectRatio) : undefined) || 1;
}
export function canvasReference(graph: ExperimentGraph, nodeId: string, sources: WorkbenchSource[]) {
  const node = graph.nodes.find(item => item.id === nodeId);
  if (!node) { const source = sources.find(item => item.id === nodeId && item.mediaType === 'image' && item.referenceAvailable !== false); return source ? { source, node: undefined } : undefined; }
  if (!node || node.mediaType !== 'image' || node.status !== 'completed' || !node.sourceId) return undefined;
  const source = sources.find(item => item.id === node.sourceId && item.mediaType === 'image' && item.referenceAvailable !== false);
  return source ? { node, source } : undefined;
}
export function addCanvasReference(method: ExperimentMethod, reference: { node?: ExperimentNode; source: WorkbenchSource }) {
  if (reference.source.mediaType !== 'image' || reference.source.referenceAvailable === false) throw new Error('请选择已完成的参考图片；视频请先提取画面。');
  if (method.referenceIds.includes(reference.source.id)) return reference.node && !method.inputs.includes(reference.node.id) ? { ...method, inputs: [...method.inputs, reference.node.id] } : method;
  const limit = method.model.startsWith('h3-video') ? 9 : method.model.startsWith('omni_') ? 7 : /image/i.test(method.model) ? 4 : 20;
  if (method.referenceIds.length >= limit) throw new Error(`这个模型最多引用 ${limit} 张图片。`);
  return { ...method, referenceIds: [...method.referenceIds, reference.source.id], inputs: reference.node ? [...new Set([...method.inputs, reference.node.id])] : method.inputs };
}
export function validateCanvasMethod(method: ExperimentMethod, models: CanvasModel[]) {
  const model = models.find(item => item.id === method.model);
  if (!model) return;
  if (!method.prompt.trim() || method.prompt.length > 12000) throw new Error('生成提示词需要填写，且不能超过 12000 字。');
  if (new Set(method.referenceIds).size !== method.referenceIds.length) throw new Error('参考图不能重复。');
  const p = method.parameters;
  if (model.kind === 'image') {
    if (method.referenceIds.length > 4) throw new Error('图片生成最多引用 4 张参考图。');
    imageRequestSize(typeof p.aspectRatio === 'string' ? p.aspectRatio : undefined, typeof p.size === 'string' ? p.size : undefined);
    if (p.quality !== undefined && !IMAGE_QUALITIES.includes(p.quality as typeof IMAGE_QUALITIES[number])) throw new Error('图片质量设置无效。');
  } else if (model.tool === 'generate_minimax_video') {
    const result = minimaxVideoInput.safeParse({ prompt: method.prompt, model: method.model, referenceIds: method.referenceIds,
      ...(p.aspectRatio !== undefined ? { aspectRatio: p.aspectRatio } : {}), ...(p.duration !== undefined ? { duration: p.duration } : {}), ...(p.resolution !== undefined ? { resolution: p.resolution } : {}),
    });
    if (!result.success) throw new Error(result.error.issues[0]?.message || '视频参数组合不受当前模型支持。');
  } else {
    if (method.referenceIds.length > 7) throw new Error('Omni 最多引用 7 张参考图。');
    if (p.aspectRatio !== undefined && !['16:9', '9:16'].includes(String(p.aspectRatio))) throw new Error('Omni 视频画幅仅支持 16:9 或 9:16。');
    if (p.duration !== undefined && ![8, 10].includes(Number(p.duration))) throw new Error('Omni 视频时长仅支持 8 或 10 秒。');
    if (p.resolution !== undefined && !['720p', '1080p'].includes(String(p.resolution))) throw new Error('Omni 视频清晰度仅支持 720p 或 1080p。');
  }
}
export function selectedCanvasRelations(graph: ExperimentGraph, id: string) {
  const result = new Set([id]);
  const upstream = (current: string) => { for (const input of graph.nodes.find(node => node.id === current)?.inputs || []) if (!result.has(input)) { result.add(input); upstream(input); } };
  upstream(id);
  const downstream = (current: string) => { for (const node of graph.nodes.filter(node => node.inputs.includes(current))) if (!result.has(node.id)) { result.add(node.id); downstream(node.id); } };
  downstream(id);
  return result;
}
