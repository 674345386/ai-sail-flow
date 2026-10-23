import { keyframesReady } from '../shared/storyboard';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ReactFlow, Background, BackgroundVariant, Controls, MiniMap, Handle, Position, BaseEdge, useNodesState, type EdgeProps, type ReactFlowInstance, type Viewport } from '@xyflow/react';
import { AlertCircle, ArrowRight, CheckCircle2, Clapperboard, Download, Eye, FileText, Film, GripVertical, ImagePlus, LoaderCircle, LocateFixed, Maximize2, Minimize2, Package, PanelLeft, Play, RotateCcw, Settings2, Sparkles, Upload, WandSparkles, X } from 'lucide-react';
import { countries, languages, platforms, roles, type Market, type Product, type Project, type Shot } from '../shared/domain';
import { estimatedClips, finalVideo, workflowRequirements } from '../shared/workflow';
import { useImagePaste } from './useImagePaste';
import { buildCreativeGraph, creativeStages, creativeStatusLabels, type CreativeNode, type CreativeNodeData } from './creativeGraph';
import CreativeArtifactDialog, { type ArtifactSelection } from './CreativeArtifactDialog';
import ShotBreakdown from './ShotBreakdown';
import ShotRewriteBoard, { RewriteProductInputs } from './ShotRewriteBoard';
import FocusPointsEditor from './FocusPointsEditor';
import ShaderBackdrop from './ShaderBackdrop';
import { buildTierCanvasNodes, tierNodeTypes, type TierCanvasNode, type TierCanvasOptions } from './tierCanvas';
import '@xyflow/react/dist/style.css';

const stageIcons = [Upload, Clapperboard, WandSparkles, Package];
const CreativeNodeView = memo(function CreativeNodeView({ data }: { data: CreativeNodeData }) {
  const Icon = stageIcons[data.step];
  return <article className={`creative-node ${data.kind} ${data.status}`}>
    {data.kind === 'stage' && <Handle type="target" id="previous" position={Position.Left} />}
    {data.kind === 'artifact' && <Handle type="target" id="input" position={Position.Top} />}
    <div className="creative-node-drag"><span>{data.kind === 'stage' ? `STEP 0${data.step + 1}` : 'OUTPUT'}{data.isDemo && ' · 示例'}</span><GripVertical size={13} /></div>
    {data.kind === 'stage' ? <><button className="creative-node-heading nodrag" onClick={() => data.onSelect?.(data.step)}><span className="creative-stage-icon"><Icon size={19} /></span><span><strong>{data.title}</strong><small>{data.subtitle}</small></span><ArrowRight size={14} /></button><div className="creative-node-foot"><span className={`creative-status ${data.status}`}>{data.status === 'running' ? <LoaderCircle size={12} className="spin" /> : data.status === 'done' ? <CheckCircle2 size={12} /> : data.status === 'failed' ? <AlertCircle size={12} /> : <i />}{creativeStatusLabels[data.status]}</span><span>{data.progress !== undefined ? `${data.progress}%` : '查看与编辑'}</span></div>{data.progress !== undefined && <div className="creative-node-progress"><span style={{ width: `${data.progress}%` }} /></div>}<Handle type="source" id="next" position={Position.Right} /><Handle type="source" id="artifact" position={Position.Bottom} /></> : <><div className="creative-output-title">{data.title}<span>{data.artifacts.length} 份</span></div><div className="creative-node-artifacts nodrag nowheel">{data.artifacts.length ? data.artifacts.map(artifact => <button key={artifact.key} onClick={() => { data.onSelect?.(data.step); data.onPreview?.(artifact.key); }}><span className={`creative-artifact-thumb ${artifact.kind}`}>{artifact.thumbnail ? <img src={artifact.thumbnail} alt="" loading="lazy" /> : artifact.kind === 'video' ? <Film size={18} /> : artifact.kind === 'image' ? <ImagePlus size={18} /> : <FileText size={18} />}</span><span><strong>{artifact.title}</strong><small>{artifact.detail}</small></span><Eye size={13} /></button>) : <div className="creative-artifact-empty"><FileText size={19} /><span>完成这一步后，产物会出现在这里</span></div>}</div></>}
  </article>;
});
function BridgeEdge({ sourceX, sourceY, targetX, targetY, markerEnd, style, id }: EdgeProps) {
  const right = sourceX + 34, left = targetX - 34, middle = sourceY + (targetY - sourceY) * .83, radius = 12;
  const path = `M ${sourceX},${sourceY} H ${right - radius} Q ${right},${sourceY} ${right},${sourceY + radius} V ${middle - radius} Q ${right},${middle} ${right - radius},${middle} H ${left + radius} Q ${left},${middle} ${left},${middle + radius} V ${targetY - radius} Q ${left},${targetY} ${left + radius},${targetY} H ${targetX}`;
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />;
}
const nodeTypes = { creative: CreativeNodeView, ...tierNodeTypes };
type CanvasNode = CreativeNode | TierCanvasNode;
const edgeTypes = { bridge: BridgeEdge };
type CanvasPatch = Partial<Pick<Project, 'title' | 'product' | 'market' | 'replication' | 'promptFlow' | 'ttsVoice' | 'automaticSettings' | 'productionMode' | 'rewrite' | 'analysis'>>;
type Layout = { positions?: Record<string, { x: number; y: number }>; viewport?: Viewport };
function readLayout(id: string): Layout {
  try {
    const saved = localStorage.getItem(`sop-creative-layout-v2:${id}`);
    const value = JSON.parse(saved || localStorage.getItem(`sop-creative-layout-v1:${id}`) || '{}');
    const positions: Layout['positions'] = {};
    for (const [key, position] of Object.entries(value.positions || {})) {
      const point = position as { x: number; y: number };
      if (Number.isFinite(point?.x) && Number.isFinite(point?.y) && Math.abs(point.x) < 10000 && Math.abs(point.y) < 10000) positions[key] = point;
    }
    const viewport = saved ? value.viewport : undefined;
    return { positions, ...(Number.isFinite(viewport?.x) && Number.isFinite(viewport?.y) && viewport.zoom >= .35 && viewport.zoom <= 1.6 ? { viewport } : {}) };
  } catch { return {}; }
}
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="creative-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
export default function CreativeWorkspace({ project, step, onStep, disabled, busyLabel, automatic, voices, onPatch, onUpload, onChooseMedia, onRemove, onRun, onRetry, onGenerateKeyframe, onExport, onCopy, onSettings, onPipeline, onAutoStart, onTakeOver, renderShotEditor, production, remix, selectedShot, selectedRewrite, onSelectShot, onSelectRewrite, onSplitShot, onAcceptSuggestion, onDismissSuggestion, onAcceptGlobalSuggestion, onDismissGlobalSuggestion, onRefine, tierFrames }: {
  project: Project; step: number; onStep: (step: number) => void; disabled: boolean; busyLabel: string; automatic: boolean;
  voices: { name: string; language: string }[];
  onPatch: (patch: CanvasPatch) => void; onUpload: (files: File[], kind: 'video' | 'product') => void; onChooseMedia: (kind: 'video' | 'product') => void; onRemove: (id: string) => void;
  onGenerateKeyframe: (shotId: string) => void;
  onRun: (kind: 'analysis' | 'rewrite') => void; onRetry: () => void; onExport: () => void; onCopy: (text: string) => void;
  onSettings: () => void; onPipeline: () => void; onAutoStart: (limit: number) => void; onTakeOver: () => void;
  renderShotEditor: (shot: Shot, index: number, localized?: boolean) => ReactNode; production: ReactNode; remix: ReactNode;
  selectedShot: number; selectedRewrite: number; onSelectShot: (index: number) => void; onSelectRewrite: (index: number) => void;
  onSplitShot: (index: number) => void;
  onAcceptSuggestion: (shotId: string) => void; onDismissSuggestion: (shotId: string) => void;
  onAcceptGlobalSuggestion: () => void; onDismissGlobalSuggestion: () => void; onRefine: () => void;
  /** Trial: the tier shots' frame groups, opening App's shared frame drawer. */
  tierFrames?: TierCanvasOptions;
}) {
  const graph = useMemo(() => buildCreativeGraph(project), [project]);
  const tierNodes = useMemo(() => tierFrames ? buildTierCanvasNodes(project, tierFrames) : [], [project, tierFrames]);
  const baseNodes = useMemo((): CanvasNode[] => [...graph.nodes, ...tierNodes], [graph, tierNodes]);
  const [layout] = useState(() => readLayout(project.id));
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(baseNodes.map(node => ({ ...node, position: node.parentId ? node.position : layout.positions?.[node.id] || node.position })));
  const flow = useRef<ReactFlowInstance<CanvasNode>>(null);
  const [preview, setPreview] = useState<ArtifactSelection | null>(null);
  const [focused, setFocused] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [zoom, setZoom] = useState(Math.round((layout.viewport?.zoom || 1) * 100));
  const [limit, setLimit] = useState(project.workflow?.maxNewClips ?? estimatedClips(project));
  const imageBoxes = useRef<HTMLDivElement>(null);
  const reference = project.assets.find(asset => asset.kind === 'video');
  const images = project.assets.filter(asset => asset.kind === 'product');
  useImagePaste(imageBoxes, showInspector && !focused && step === 0 && !disabled && !preview, files => onUpload(files, 'product'));
  const selectStage = useCallback((next: number) => { onStep(next); setShowInspector(true); setFocused(false); }, [onStep]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !preview) { setFocused(false); setShowInspector(false); } };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [preview]);
  useEffect(() => {
    setNodes(previous => [
      ...graph.nodes.map((node): CanvasNode => ({ ...node, position: previous.find(item => item.id === node.id)?.position || layout.positions?.[node.id] || node.position, selected: node.data.kind === 'stage' && node.data.step === step, data: { ...node.data, onSelect: selectStage, onPreview: (key: string) => setPreview({ key }) } })),
      ...tierNodes.map((node): CanvasNode => node.parentId ? node : { ...node, position: previous.find(item => item.id === node.id)?.position || layout.positions?.[node.id] || node.position }),
    ]);
  }, [graph, tierNodes, step, selectStage, layout, setNodes]);
  // Opening the frame drawer (or switching to another shot's frame) pans that shot's group to the middle of the canvas area left of the drawer; closing it leaves the view alone.
  const openShot = tierFrames?.open?.shotId;
  const flowBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const instance = flow.current, box = flowBox.current?.getBoundingClientRect(), group = openShot && instance?.getNode(`tier-${openShot}`);
    if (!instance || !box || !group) return;
    const width = group.measured?.width ?? Number(group.style?.width) ?? 0, height = group.measured?.height ?? Number(group.style?.height) ?? 0;
    const drawerWidth = parseFloat(getComputedStyle(document.querySelector('.tier-drawer') || document.body).width) || 460;
    const visibleRight = Math.max(box.left + 160, Math.min(box.right, window.innerWidth - drawerWidth));
    const { zoom } = instance.getViewport(), screenX = (box.left + visibleRight) / 2 - box.left, screenY = box.height / 2;
    void instance.setViewport({ x: screenX - (group.position.x + width / 2) * zoom, y: screenY - (group.position.y + height / 2) * zoom, zoom }, { duration: 300 });
  }, [openShot]);
  const persist = (viewport?: Viewport) => {
    try { localStorage.setItem(`sop-creative-layout-v2:${project.id}`, JSON.stringify({ positions: Object.fromEntries((flow.current?.getNodes() || nodes).map(node => [node.id, node.position])), viewport: viewport || flow.current?.getViewport() })); } catch {}
  };
  const fit = () => { void flow.current?.fitView({ padding: .07, duration: 200, maxZoom: 1 }); };
  const reset = () => { setNodes(previous => previous.map(node => ({ ...node, position: baseNodes.find(item => item.id === node.id)?.position || node.position })) as CanvasNode[]); try { localStorage.removeItem(`sop-creative-layout-v2:${project.id}`); localStorage.removeItem(`sop-creative-layout-v1:${project.id}`); } catch {} window.requestAnimationFrame(fit); };
  const product = (patch: Partial<Product>) => onPatch({ product: { ...project.product, ...patch } });
  const market = (patch: Partial<Market>) => onPatch({ market: { ...project.market, ...patch } });
  const currentShot = step === 1 ? project.analysis?.shots[Math.min(selectedShot, project.analysis.shots.length - 1)] : project.rewrite?.shots[Math.min(selectedRewrite, project.rewrite.shots.length - 1)];
  const local = step === 2;
  const canRewrite = !!project.analysis && (project.promptFlow === 'direct-analysis' || !!project.product.name.trim() && !!project.product.facts.trim() && images.length > 0);
  const requirements = workflowRequirements(project);
  const output = finalVideo(project);
  const voiceOptions = voices.filter(voice => voice.language.toLowerCase() === project.market.language.toLowerCase());
  const job = project.job;
  const selectShot = (index: number) => local ? onSelectRewrite(index) : onSelectShot(index);
  const materialFields = <>
        <Field label="创意名称"><input className="input" value={project.title} maxLength={120} disabled={disabled} onChange={event => onPatch({ title: event.target.value })} /></Field>
        <div className="creative-section-label"><strong>参考视频</strong><span>1 条</span></div>
        {reference ? <div className="creative-source"><button className="creative-source-preview" onClick={() => setPreview({ key: `asset:${reference.id}` })}>{reference.thumbnail ? <img src={reference.thumbnail} alt="" /> : <Film size={30} />}<span><Play size={15} />预览原片</span></button><div><strong title={reference.name}>{reference.name}</strong><small>{reference.duration?.toFixed(1)} 秒 · {reference.width} × {reference.height}</small><button className="text-button" disabled={disabled} onClick={() => onChooseMedia('video')}>更换视频</button></div></div> : <button className="creative-upload-empty" disabled={disabled} onClick={() => onChooseMedia('video')} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!disabled && event.dataTransfer.files.length) onUpload(Array.from(event.dataTransfer.files), 'video'); }}><Upload size={25} /><strong>选择或拖入参考视频</strong><small>MP4、MOV、WebM · 最大 250 MB</small></button>}
        <div className="creative-section-label"><strong>产品 / 主体参考图</strong><span>{images.length} / 3</span></div>
        <div className="creative-image-grid" ref={imageBoxes}>{images.map(image => <div key={image.id}><button className="creative-image-preview" onClick={() => setPreview({ key: `asset:${image.id}` })}><img src={image.url} alt={image.name} /></button><button className="creative-image-remove" aria-label={`移除 ${image.name}`} disabled={disabled} onClick={() => onRemove(image.id)}><X size={12} /></button></div>)}{images.length < 3 && <button data-image-upload className="creative-add-image" disabled={disabled} onClick={() => onChooseMedia('product')}><ImagePlus size={20} /><span>素材 / 粘贴</span></button>}</div><p className="creative-hint">鼠标停在上传框，按 ⌘V / Ctrl+V 粘贴图片。</p>
  </>;
  const productFields = <>
        <div className="creative-section-label"><strong>产品资料</strong><Package size={14} /></div>
        <Field label="产品名称 · 必填"><input id="product-name" className="input" value={project.product.name} maxLength={160} disabled={disabled} onChange={event => product({ name: event.target.value })} placeholder="要推广的产品或主体" /></Field>
        <Field label="产品类别"><select className="input" value={project.product.category} disabled={disabled} onChange={event => product({ category: event.target.value })}>{['家居生活', '美妆个护', '服饰配件', '数码配件', '户外运动', '宠物用品', '其他'].map(value => <option key={value}>{value}</option>)}</select></Field>
        <Field label="已确认的卖点与规格 · 必填" hint="填写真实事实，供后续创意方案使用。"><textarea id="product-facts" className="input textarea" rows={4} value={project.product.facts} maxLength={8000} disabled={disabled} onChange={event => product({ facts: event.target.value })} placeholder="材质、规格、用途与明确卖点" /></Field>
        <Field label="目标购买人群"><textarea className="input textarea" rows={2} value={project.product.audience} maxLength={2000} disabled={disabled} onChange={event => product({ audience: event.target.value })} placeholder="什么人，在什么情境下会需要它？" /></Field>
        
  </>;
  return <section className={`creative-workspace ${focused ? 'is-focused' : ''} ${showInspector ? '' : 'inspector-hidden'}`} aria-label="全局创意画布工作台">
    {project.isDemo && <div className="creative-callout">当前是手写示例创意，画布中的产物用于体验编辑与导出。</div>}
    <div className="creative-workbench">
      <div className="creative-canvas-center"><div className="creative-canvas-toolbar sail-shader-surface"><ShaderBackdrop variant="canvas" /><div><button className={`creative-icon-button ${showInspector && !focused ? 'active' : ''}`} title="显示或收起节点表单" aria-label="显示或收起节点表单" aria-pressed={showInspector && !focused} onClick={() => { setFocused(false); setShowInspector(!showInspector || focused); }}><PanelLeft size={16} /></button><span>全局流程</span><small>点击节点打开对应表单</small></div><div><button className="creative-icon-button" title="适应全部节点" aria-label="适应全部节点" onClick={fit}><LocateFixed size={16} /></button><button className="creative-icon-button" title="恢复节点布局" aria-label="恢复节点布局" onClick={reset}><RotateCcw size={15} /></button><button className="creative-icon-button" title={focused ? '退出专注画布' : '专注画布'} aria-label={focused ? '退出专注画布' : '专注画布'} onClick={() => setFocused(!focused)}>{focused ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button><button className="creative-icon-button" title="连接与模型" aria-label="连接与模型" onClick={onSettings}><Sparkles size={16} /></button></div></div>
        <div className="creative-flow-viewport" ref={flowBox}><ReactFlow<CanvasNode> nodes={nodes} edges={graph.edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onNodeClick={(_event, node) => { if (node.type === 'creative') selectStage(node.data.step); }} onPaneClick={() => setShowInspector(false)} onNodeDragStop={() => persist()} onInit={instance => { flow.current = instance; }} onMoveEnd={(_event, viewport) => { setZoom(Math.round(viewport.zoom * 100)); persist(viewport); }} defaultViewport={layout.viewport} fitView={!layout.viewport} fitViewOptions={{ padding: .07, maxZoom: 1 }} minZoom={.35} maxZoom={1.6} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} selectionKeyCode={null} multiSelectionKeyCode={null} panOnScroll zoomOnScroll={false} zoomOnPinch snapToGrid snapGrid={[10, 10]} ariaLabelConfig={{ 'controls.zoomIn.ariaLabel': '放大画布', 'controls.zoomOut.ariaLabel': '缩小画布', 'controls.fitView.ariaLabel': '适应全部节点' }}><Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d4d9d6" /><Controls position="bottom-left" showInteractive={false} /><MiniMap position="bottom-right" pannable zoomable nodeColor={node => node.type === 'tierFrame' ? '#cfd8d1' : node.type === 'tierGroup' ? '#f1f4f1' : node.data.kind === 'stage' ? node.data.status === 'done' ? '#99b9ab' : '#808986' : '#e1e5e2'} maskColor="rgba(246,248,246,.72)" /></ReactFlow><div className="creative-canvas-hint"><span>拖动画布 / 滚动平移 · 点击节点编辑 · 点击产物预览</span><b>{zoom}%</b></div></div>
      </div>
      <aside className="creative-inspector" aria-label="选中节点的表单与执行操作"><div className="creative-panel-heading"><div><Settings2 size={15} /><strong>0{step + 1} · {creativeStages[step].title}</strong></div><button className="creative-icon-button" aria-label="收起节点表单" onClick={() => setShowInspector(false)}><X size={14} /></button></div><div className="creative-panel-scroll">
        <div className="creative-inspector-title"><span className={`creative-status ${graph.statuses[step]}`}><i />{creativeStatusLabels[graph.statuses[step]]}</span><h2>{creativeStages[step].title}</h2><p>{creativeStages[step].subtitle}</p></div>
        {disabled && <div className="creative-callout">{busyLabel || (project.job?.status === 'running' ? '任务执行中，完成后可继续编辑。' : '正在查看自动制作流程，接管后可编辑。')}</div>}
        {step === 0 && <>{materialFields}<div className="creative-readiness"><div><CheckCircle2 size={15} className={reference ? 'complete' : ''} /><span>一条参考视频</span><b>{reference ? '已上传' : '待上传'}</b></div><div><CheckCircle2 size={15} className={project.product.name.trim() ? 'complete' : ''} /><span>产品名称</span><b>{project.product.name.trim() ? '已填写' : '待填写'}</b></div><div><CheckCircle2 size={15} className={project.product.facts.trim() ? 'complete' : ''} /><span>卖点与规格</span><b>{project.product.facts.trim() ? '已填写' : '待填写'}</b></div></div><p className="creative-body-copy">上传值得借鉴的参考片，拆解会保留原片的镜头、动作和音轨信息。产品资料可在步骤 03 填写。</p>{reference && <button className="creative-inspect-link" onClick={() => setPreview({ key: `asset:${reference.id}` })}><Film size={16} />检查参考视频<Eye size={15} /></button>}<div className="creative-section-label"><strong>下一步将产生</strong></div><div className="creative-result-placeholder"><Clapperboard size={24} /><strong>原片镜头脚本</strong><p>镜头时间、画面、动作、口播、声音与商品展示</p></div></>}
        {step === 1 && <>{project.analysis ? <><div className="creative-analysis-summary"><strong>原片概览</strong><p>{project.analysis.summary}</p><span>{project.analysis.shots.length} 个镜头 · {project.analysis.duration.toFixed(1)} 秒 · {project.analysis.sourceLanguage}</span><button className="text-button" onClick={() => setPreview({ key: 'analysis' })}><Eye size={14} />查看完整产物</button></div>{!!project.analysis.uncertainties.length && <details className="creative-details"><summary>待确认内容 · {project.analysis.uncertainties.length}</summary><div>{project.analysis.uncertainties.map((item, index) => <p className="creative-hint" key={index}>{item}</p>)}</div></details>}</> : <div className="creative-result-placeholder"><Clapperboard size={25} /><strong>还没有原片拆解结果</strong><p>{reference ? '点击下方“拆解参考视频”，镜头脚本会出现在画布中。' : '先点击“上传素材”节点上传参考视频。'}</p></div>}</>}
        {step === 2 && remix}
        {step === 1 && project.analysis && <><section className="global-focus-panel"><div className="global-focus-heading"><h2>全片关注重点</h2><small>{(project.analysis.focusPoints || []).filter(point => point.selected).length}/{project.analysis.focusPoints?.length || 0} 项已勾选</small></div>{!!project.analysisReview?.globalFocusSuggestion?.length && <div className="global-focus-suggestion"><strong>AI 建议更新全片重点</strong><ul>{project.analysisReview.globalFocusSuggestion.map(point => <li key={point.id}>{point.selected ? '☑' : '□'} {point.text}</li>)}</ul><div className="global-focus-actions"><button className="btn small" disabled={disabled} onClick={onDismissGlobalSuggestion}>保留当前</button><button className="btn small primary" disabled={disabled} onClick={onAcceptGlobalSuggestion}>采用 AI 建议</button></div></div>}<FocusPointsEditor points={project.analysis.focusPoints} onChange={points => onPatch({ analysis: { ...project.analysis!, focusPoints: points } })} disabled={disabled} onSeek={seconds => reference && setPreview({ key: `asset:${reference.id}`, seek: seconds })} /></section>{!!project.analysisReview?.pendingIds.length && <button className="btn small" disabled={disabled} onClick={onRefine}><Sparkles size={14} />重新分析变动镜头（{project.analysisReview.pendingIds.length}）</button>}<ShotBreakdown compact project={project} selectedIndex={selectedShot} onSelect={onSelectShot} onSeek={seconds => reference && setPreview({ key: `asset:${reference.id}`, seek: seconds })} onCopy={onCopy} onSplit={onSplitShot} onAcceptSuggestion={onAcceptSuggestion} onDismissSuggestion={onDismissSuggestion} onFocusChange={(shotId, points) => onPatch({ analysis: { ...project.analysis!, shots: project.analysis!.shots.map(shot => shot.id === shotId ? { ...shot, focusPoints: points } : shot) } })} disabled={disabled} renderEditor={(shot, index) => renderShotEditor(shot, index)} /></>}



      </div><footer className="creative-inspector-actions">
        {project.workflow && project.job?.kind.startsWith('remix-') !== true && <p className="creative-hint" role="status">{project.workflow.message}{project.workflow.status === 'pausing' && ' · 当前任务结束后开放编辑'}</p>}

        {job?.status === 'running' && <div className="creative-run-status"><LoaderCircle className="spin" size={14} /><span>{job.message}</span><b>{job.progress}%</b></div>}
        {job?.status === 'failed' && <div className="creative-run-failure" role="alert"><p>{job.message}</p><button className="text-button" disabled={disabled} onClick={onRetry}>重试当前任务<RotateCcw size={13} /></button></div>}
        {step < 2 && <><button className="btn primary" disabled={disabled || !reference} onClick={() => onRun('analysis')}><Sparkles size={15} />{step === 1 && project.analysis ? '重新拆解' : '拆解参考视频'}</button>{step === 1 && project.analysis && <button className="btn" disabled={disabled} onClick={() => selectStage(2)}>人物与视频二创<ArrowRight size={14} /></button>}</>}
      </footer></aside>
    </div>
    <div className="creative-workspace-footer"><span><CheckCircle2 size={13} />编辑与步骤视图同步 · 自动保存到本机</span><div>{creativeStages.map((stage, index) => <button key={stage.title} className={step === index ? 'active' : ''} aria-current={step === index ? 'step' : undefined} onClick={() => { selectStage(index); }} title={stage.title}>0{index + 1}<span>{stage.title}</span></button>)}</div></div>
    {preview && <CreativeArtifactDialog project={project} selection={preview} onClose={() => setPreview(null)} onSelect={setPreview} onCopy={onCopy} onExport={onExport} />}
  </section>;
}
