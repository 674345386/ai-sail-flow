import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { Project } from '../shared/domain';
import { remixCharacterCurrent, remixPlanCurrent, remixVideoBasis } from '../shared/remix';

export type CreativeStatus = 'empty' | 'ready' | 'running' | 'done' | 'stale' | 'failed';
export const creativeStages = [
  { title: '上传素材', subtitle: '参考视频与产品资料', action: '准备素材' },
  { title: '视频拆解', subtitle: '理解镜头、节奏与声音', action: '拆解参考视频' },
  { title: '人物与视频二创', subtitle: '新人物参考图 → 二创提示词 → Omni 视频', action: '生成二创视频' },
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
  const latest = [...(project.remix?.videos || [])].reverse();
  const output = latest.find(video => video.status === 'completed' && video.url && video.basis === remixVideoBasis(project) && remixPlanCurrent(project));
  const statuses: CreativeStatus[] = [reference ? 'done' : 'empty', project.analysis ? 'done' : reference ? 'ready' : 'empty',
    output ? 'done' : !project.analysis ? 'empty' : project.remix?.plan && !remixPlanCurrent(project) ? 'stale' : 'ready'];
  const activeStep = project.job?.kind === 'analysis' || project.job?.kind === 'analysis-refine' ? 1 : 2;
  if (project.job?.status === 'running') statuses[activeStep] = 'running';
  if (project.job?.status === 'failed') statuses[activeStep] = 'failed';
  const artifacts: CreativeArtifact[][] = [
    project.assets.map(asset => ({ key: `asset:${asset.id}`, title: asset.name, detail: asset.kind === 'video' ? `${(asset.duration || 0).toFixed(1)} 秒 · 参考视频` : '产品 / 主体参考图', kind: asset.kind === 'video' ? 'video' : 'image', thumbnail: asset.kind === 'video' ? asset.thumbnail : asset.url })),
    project.analysis ? [{ key: 'analysis', title: '镜头片段与证据', detail: `${project.analysis.shots.length} 个镜头 · 切片 / 关键帧 / Prompt`, kind: 'document' }] : [],
    [
      ...(project.remix?.character ? [{ key: 'remix-character', title: '新人物参考图', detail: remixCharacterCurrent(project) ? '全片人物身份参考' : '人物要求已变更', kind: 'image' as const, thumbnail: project.remix.character.url }] : []),
      ...(project.remix?.plan ? [{ key: 'remix-plan', title: '二创视频提示词', detail: `${project.remix.plan.shots.length} 个镜头 · 10秒${remixPlanCurrent(project) ? '' : ' · 待更新'}`, kind: 'document' as const }] : []),
      ...latest.filter(video => video.status === 'completed' && video.url).map(video => ({ key: `remix-video:${video.id}`, title: 'Omni 二创成片', detail: `${(video.duration || 10).toFixed(1)}秒 · ${video.resolution} · 可下载`, kind: 'video' as const, thumbnail: video.thumbnail })),
    ],
  ];
  const positions = [{ x: 40, y: 45 }, { x: 385, y: 45 }, { x: 40, y: 480 }, { x: 385, y: 480 }];
  const nodes: CreativeNode[] = creativeStages.flatMap((stage, step) => {
    const base = { step, status: statuses[step], isDemo: project.isDemo };
    return [
      { id: `stage-${step}`, type: 'creative', position: positions[step], dragHandle: '.creative-node-drag', data: { ...base, kind: 'stage', title: stage.title, subtitle: stage.subtitle, artifacts: [], message: step === activeStep && project.job?.status === 'running' ? project.job.message : undefined, progress: step === activeStep && project.job?.status === 'running' ? project.job.progress : undefined } },
      { id: `artifact-${step}`, type: 'creative', position: { x: positions[step].x, y: positions[step].y + 183 }, dragHandle: '.creative-node-drag', data: { ...base, kind: 'artifact', title: ['输入素材', '原片分析产物', '二创产物'][step], subtitle: ['点击素材可直接预览', '结构化镜头与声音记录', '新人物、提示词和视频'][step], artifacts: artifacts[step] } },
    ];
  });
  const edges: Edge[] = [];
  for (let step = 0; step < creativeStages.length; step++) {
    edges.push({ id: `output-${step}`, source: `stage-${step}`, target: `artifact-${step}`, sourceHandle: 'artifact', targetHandle: 'input', type: 'smoothstep', selectable: false, style: { stroke: '#bdc3c0', strokeWidth: 1.4 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#bdc3c0', width: 14, height: 14 } });
    if (step < creativeStages.length - 1) edges.push({ id: `flow-${step}`, source: `stage-${step}`, target: `stage-${step + 1}`, sourceHandle: 'next', targetHandle: 'previous', type: step === 1 ? 'bridge' : 'smoothstep', selectable: false, animated: statuses[step + 1] === 'running', style: { stroke: statuses[step] === 'done' ? '#40836a' : '#bfc4c1', strokeWidth: 1.8 }, markerEnd: { type: MarkerType.ArrowClosed, color: statuses[step] === 'done' ? '#40836a' : '#bfc4c1', width: 16, height: 16 } });
  }
  return { nodes, edges, statuses };
}
