import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { Project } from '../shared/domain';
import { finalVideo } from '../shared/workflow';

export type CreativeStatus = 'empty' | 'ready' | 'running' | 'done' | 'stale' | 'failed';
export const creativeStages = [
  { title: '上传素材', subtitle: '参考视频与产品资料', action: '准备素材' },
  { title: '视频拆解', subtitle: '理解镜头、节奏与声音', action: '拆解参考视频' },
  { title: '产品与市场改写', subtitle: '从原片到可执行分镜', action: '生成创意方案' },
  { title: '提示词包与成片', subtitle: '检查 Prompt、生成与交付', action: '查看交付内容' },
];
export const creativeStatusLabels: Record<CreativeStatus, string> = { empty: '待准备', ready: '可执行', running: '处理中', done: '已完成', stale: '待更新', failed: '执行失败' };
export type CreativeArtifact = { key: string; title: string; detail: string; kind: 'video' | 'image' | 'document'; thumbnail?: string };
export type CreativeNodeData = Record<string, unknown> & {
  step: number; kind: 'stage' | 'artifact'; title: string; subtitle: string; status: CreativeStatus;
  artifacts: CreativeArtifact[]; message?: string; progress?: number; isDemo: boolean;
  onSelect?: (step: number) => void; onPreview?: (key: string) => void;
};
export type CreativeNode = Node<CreativeNodeData, 'creative'>;

export function buildCreativeGraph(project: Project): { nodes: CreativeNode[]; edges: Edge[]; statuses: CreativeStatus[] } {
  const reference = project.assets.find(asset => asset.kind === 'video');
  const output = finalVideo(project);
  const previewOutput = output || [...(project.composedVideos || [])].reverse().find(video => !video.unitId && video.mode === (project.productionMode || 'veo-native'));
  const latest = new Map<string, Project['generatedVideos'][number]>();
  for (const video of project.generatedVideos) {
    if (video.status === 'completed' && video.url && (video.productionMode || 'veo-native') === (project.productionMode || 'veo-native')) latest.set(video.unitId || video.shotId, video);
  }
  const statuses: CreativeStatus[] = [reference ? 'done' : 'empty', project.analysis ? 'done' : reference ? 'ready' : 'empty', project.rewriteStale ? 'stale' : project.rewrite ? 'done' : project.analysis ? 'ready' : 'empty', output ? 'done' : project.rewriteStale ? 'stale' : project.rewrite ? 'ready' : 'empty'];
  const activeStep = project.job?.kind === 'analysis' ? 1 : project.job?.kind === 'rewrite' ? 2 : 3;
  if (project.job?.status === 'running') statuses[activeStep] = 'running';
  if (project.job?.status === 'failed') statuses[activeStep] = 'failed';
  const artifacts: CreativeArtifact[][] = [
    project.assets.map(asset => ({ key: `asset:${asset.id}`, title: asset.name, detail: asset.kind === 'video' ? `${(asset.duration || 0).toFixed(1)} 秒 · 参考视频` : '产品 / 主体参考图', kind: asset.kind === 'video' ? 'video' : 'image', thumbnail: asset.kind === 'video' ? asset.thumbnail : asset.url })),
    project.analysis ? [{ key: 'analysis', title: '镜头片段与证据', detail: `${project.analysis.shots.length} 个镜头 · 切片 / 关键帧 / Prompt`, kind: 'document' }] : [],
    project.rewrite ? [{ key: 'rewrite', title: project.promptFlow === 'direct-analysis' ? '原片分镜与 Prompt' : '本地化创意分镜', detail: `${project.rewrite.shots.length} 个镜头${project.rewriteStale ? ' · 资料已变更' : ''}`, kind: 'document' }] : [],
    [
      ...(project.rewrite ? [{ key: 'delivery', title: '提示词与制作简报', detail: 'Prompt · 分镜 JSON · 字幕', kind: 'document' as const }] : []),
      ...(latest.size ? [{ key: 'generations', title: '生成视频片段', detail: `${latest.size} 个单元${[...latest.values()].some(video => video.stale) ? ' · 含待更新片段' : ''} · 点击预览`, kind: 'video' as const, thumbnail: [...latest.values()].find(video => video.thumbnail)?.thumbnail }] : []),
      ...(previewOutput ? [{ key: `final:${previewOutput.id}`, title: output ? '最终成片' : '历史成片', detail: `${previewOutput.duration.toFixed(1)} 秒 · ${output ? '可下载' : '供对照查看'}`, kind: 'video' as const }] : []),
    ],
  ];
  const positions = [{ x: 40, y: 45 }, { x: 385, y: 45 }, { x: 40, y: 480 }, { x: 385, y: 480 }];
  const nodes: CreativeNode[] = creativeStages.flatMap((stage, step) => {
    const base = { step, status: statuses[step], isDemo: project.isDemo };
    return [
      { id: `stage-${step}`, type: 'creative', position: positions[step], dragHandle: '.creative-node-drag', data: { ...base, kind: 'stage', title: stage.title, subtitle: stage.subtitle, artifacts: [], message: step === activeStep && project.job?.status === 'running' ? project.job.message : undefined, progress: step === activeStep && project.job?.status === 'running' ? project.job.progress : undefined } },
      { id: `artifact-${step}`, type: 'creative', position: { x: positions[step].x, y: positions[step].y + 183 }, dragHandle: '.creative-node-drag', data: { ...base, kind: 'artifact', title: ['输入素材', '原片分析产物', '创意方案产物', '交付产物'][step], subtitle: ['点击素材可直接预览', '结构化镜头与声音记录', '可编辑的分镜与生成指令', '提示词包与生成视频'][step], artifacts: artifacts[step] } },
    ];
  });
  const edges: Edge[] = [];
  for (let step = 0; step < 4; step++) {
    edges.push({ id: `output-${step}`, source: `stage-${step}`, target: `artifact-${step}`, sourceHandle: 'artifact', targetHandle: 'input', type: 'smoothstep', selectable: false, style: { stroke: '#bdc3c0', strokeWidth: 1.4 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#bdc3c0', width: 14, height: 14 } });
    if (step < 3) edges.push({ id: `flow-${step}`, source: `stage-${step}`, target: `stage-${step + 1}`, sourceHandle: 'next', targetHandle: 'previous', type: step === 1 ? 'bridge' : 'smoothstep', selectable: false, animated: statuses[step + 1] === 'running', style: { stroke: statuses[step] === 'done' ? '#40836a' : '#bfc4c1', strokeWidth: 1.8 }, markerEnd: { type: MarkerType.ArrowClosed, color: statuses[step] === 'done' ? '#40836a' : '#bfc4c1', width: 16, height: 16 } });
  }
  return { nodes, edges, statuses };
}
