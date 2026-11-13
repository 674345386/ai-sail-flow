import type { CSSProperties } from 'react';
import { Handle, NodeResizer, Position, type Node, type NodeProps } from '@xyflow/react';
import { ArrowRight, Check, Film, GitBranch, GitFork as Github, GripVertical, Image, LoaderCircle, Maximize2, Play, Plus, Workflow } from 'lucide-react';
import { activeExperimentMethod, experimentKindLabels, type ExperimentNode } from '../shared/experiment';
import { CANVAS_REFERENCE_MIME } from './experiment-canvas-model';
import type { ExperimentNodePresentation } from './experiment-status';

export type ExperimentCanvasFlowNode = Node<{
  item: ExperimentNode; planTitle?: string; methodTitle?: string; dimmed?: boolean; related?: boolean; adopted?: boolean;
  ratio: number; presentation: ExperimentNodePresentation;
  onOpenCompleted: (id: string) => void; onNextMenu: (id: string, point: { x: number; y: number }) => void;
  onPreview: (id: string) => void; onMediaSize: (id: string, width: number, height: number) => void;
  onResize: (id: string, width: number, ratio: number, position: { x: number; y: number }) => void;
  role?: 'input' | 'output' | 'heading'; referenceId?: string; onSettings?: () => void;
}, 'experiment'>;
const kindIcons = { asset: Image, step: Workflow, skill: Github, artifact: Film, compare: GitBranch };

export function ExperimentCanvasNode({ data, selected, id }: NodeProps<ExperimentCanvasFlowNode>) {
  const n = data.item, Icon = n.mediaType === 'video' ? Film : n.mediaType === 'image' ? Image : kindIcons[n.kind];
  if (data.role === 'heading') return <div className="lab-turn-heading"><strong>{n.title}</strong><span>{n.description}{n.content && ` · ${n.content}`}</span></div>;
  const hasMedia = !!n.url && (n.mediaType === 'image' || n.mediaType === 'video');
  const emptyArtifact = n.kind === 'artifact' && !n.url && !n.content;
  const visual = hasMedia || emptyArtifact && (n.mediaType === 'image' || n.mediaType === 'video');
  const method = n.kind === 'step' ? activeExperimentMethod(n) : undefined;
  const menu = (element: HTMLElement) => { const rect = element.getBoundingClientRect(); data.onNextMenu(n.id, { x: rect.right + 8, y: rect.top }); };
  return <article className={`lab-node lab-node-${n.kind}${hasMedia ? ' has-media' : ''}${visual ? ' has-media-ratio' : ''}${selected ? ' is-selected' : ''}${data.dimmed ? ' is-dimmed' : ''}${data.related ? ' is-related' : ''}`}
    data-status={n.status} data-canvas-node={id} style={{ '--lab-node-ratio': data.ratio } as CSSProperties} aria-label={`${data.role === 'input' ? '本轮输入' : data.role === 'output' ? '本轮输出' : experimentKindLabels[n.kind]}：${n.title}，${data.presentation.label}`}>
    <NodeResizer isVisible={!!selected && visual} keepAspectRatio minWidth={160} maxWidth={720} minHeight={40} maxHeight={7200} color="#c7dce9" onResizeEnd={(_, params) => data.onResize(n.id, params.width, data.ratio, { x: params.x, y: params.y })} />
    <div className="lab-node-caption">{data.role && <span className="lab-turn-role">{data.role === 'input' ? '输入' : '输出'}</span>}<Icon size={13} strokeWidth={1.6} /><h3 title={n.title}>{n.title}</h3>{data.onSettings && <button type="button" className="lab-turn-settings nodrag" onClick={event => { event.stopPropagation(); data.onSettings!(); }}>参数</button>}</div>
    <Handle type="target" position={Position.Left} className="lab-node-port" aria-label="上游输入连接点" title="拖动连接上游输入"><Plus size={12} strokeWidth={1.7} /></Handle>
    <div className="lab-node-surface">
      <div className="lab-node-badges">{data.adopted && <span className="lab-adopted"><Check size={11} />已采用</span>}<span className={`lab-status lab-status-${n.status}`} title={data.presentation.hint}>{n.status === 'running' ? <LoaderCircle size={11} className="lab-spin" /> : n.status === 'completed' ? <Check size={11} /> : <span className="lab-node-state-dot" />}{data.presentation.label}</span></div>
      {n.url && n.mediaType === 'image' ? <img className="lab-node-image" src={n.url} alt={n.title} loading="lazy" draggable={false} onLoad={event => data.onMediaSize(n.id, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} onDoubleClick={event => { event.stopPropagation(); data.onPreview(n.id); }} />
        : n.url && n.mediaType === 'video' ? <video className="lab-node-image nodrag nowheel" src={n.url} poster={`${n.url}.jpg`} controls playsInline preload={data.role === 'input' ? 'none' : 'metadata'} onLoadedMetadata={event => data.onMediaSize(n.id, event.currentTarget.videoWidth, event.currentTarget.videoHeight)} onDoubleClick={event => { event.stopPropagation(); data.onPreview(n.id); }} />
        : <div className={`lab-node-content${emptyArtifact ? ' lab-node-placeholder' : ''}`}>
          {n.skill ? <div className="lab-skill-source"><Github size={32} strokeWidth={1.3} /><strong>{n.skill.repository}</strong><code>{n.skill.commit.slice(0, 9)} · 版本已固定</code></div> : <><div className="lab-node-symbol">{emptyArtifact ? <Play size={42} strokeWidth={1.1} /> : <Icon size={29} strokeWidth={1.25} />}</div>{method && <strong className="lab-node-method-title">{method.title || n.method || '制作步骤'}</strong>}{emptyArtifact && <strong className="lab-node-method-title">{data.presentation.label}</strong>}<p className="lab-node-excerpt">{emptyArtifact && data.presentation.hint ? data.presentation.hint : n.content || n.prompt || n.description || (n.kind === 'step' ? '添加方法与参考素材，交给 Agent 继续。' : n.kind === 'compare' ? '连接不同方案，比较真实制作结果。' : '等待添加参考素材。')}</p></>}
          {n.kind === 'compare' && n.selectedInput && <div className="lab-node-method"><Check size={11} />已选定制作方案</div>}{n.kind === 'step' && data.presentation.hint && <p className="lab-node-execution-hint">{data.presentation.hint}</p>}
        </div>}
      {hasMedia && <div className="lab-node-media-actions"><button type="button" className="nodrag" title="放大查看素材" aria-label="放大查看素材" onClick={event => { event.stopPropagation(); data.onPreview(n.id); }}><Maximize2 size={13} /></button>{n.mediaType === 'image' && n.status === 'completed' && n.sourceId && <button type="button" className="nodrag" draggable title="拖入创作面板作为参考" aria-label="拖入创作面板作为参考" onDragStart={event => { event.dataTransfer.setData(CANVAS_REFERENCE_MIME, data.referenceId || n.id); event.dataTransfer.setData('text/plain', n.title); event.dataTransfer.effectAllowed = 'copy'; }}><GripVertical size={13} /></button>}</div>}
      {data.presentation.completedArtifactId && <button type="button" className="lab-node-result-link nodrag" onClick={event => { event.stopPropagation(); data.onOpenCompleted(data.presentation.completedArtifactId!); }}><Check size={12} />{n.kind === 'step' && data.presentation.label === '当前方法未执行' ? '查看已有结果' : '查看原方案结果'}<ArrowRight size={12} /></button>}
    </div>
    <footer><span title={data.planTitle || data.methodTitle || n.method}>{n.kind === 'step' ? `${n.methods?.length || 1} 种方法 · ${method?.referenceIds.length || 0} 张参考图` : data.methodTitle ? `来自 ${data.methodTitle}` : data.planTitle || n.method || (n.inputs.length ? `${n.inputs.length} 个上游输入` : experimentKindLabels[n.kind])}</span><span>v{n.revision}</span></footer>
    <Handle type="source" position={Position.Right} className="lab-node-port lab-node-next" aria-label="添加下一步或拖动连接" title="点击添加下一步，拖动建立连线" tabIndex={0}
      onClick={event => { event.stopPropagation(); menu(event.currentTarget); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); menu(event.currentTarget); } }}><Plus size={12} strokeWidth={1.7} /></Handle>
  </article>;
}
