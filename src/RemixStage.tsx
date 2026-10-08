import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Background, BackgroundVariant, BaseEdge, Handle, MarkerType, Position, getBezierPath, getSmoothStepPath, ReactFlow, useNodesState, type Edge, type EdgeProps, type Node, type ReactFlowInstance, type Viewport } from '@xyflow/react';
import { Check, ChevronDown, Copy, Download, FileText, Film, GripVertical, Hand, ImagePlus, LoaderCircle, LocateFixed, Maximize2, Minimize2, MousePointer2, Play, RotateCcw, Save, Settings2, Sparkles, Upload, WandSparkles, ZoomIn, ZoomOut } from 'lucide-react';
import type { Project } from '../shared/domain';
import { defaultRemixSettings, remixCharacterCurrent, remixPlanCurrent, remixVideoBasis, type RemixAction, type RemixSettings } from '../shared/remix';
import { RemixShotClip, RemixShotFrames } from './RemixShotMedia';
import '@xyflow/react/dist/style.css';
import './remix-stage.css';

type CanvasData = { id: string; position: { x: number; y: number }; title: string; kind: 'source' | 'character' | 'prompt' | 'video' | 'shot' | 'frames'; status: string; ready: boolean; content: ReactNode };
type CanvasNode = Node<CanvasData, 'remix'>;
type Layout = { positions?: Record<string, { x: number; y: number }>; viewport?: Viewport };
const positions = { source: { x: 0, y: 0 }, character: { x: 1680, y: 400 }, prompt: { x: 2140, y: 110 }, video: { x: 2760, y: 170 } };
function readLayout(id: string): Layout {
  try {
    const raw = JSON.parse(localStorage.getItem(`sop-remix-canvas-v2:${id}`) || '{}');
    const saved: Layout = { positions: {} };
    for (const key of Object.keys(raw.positions || {})) {
      if (!Object.hasOwn(positions, key) && !key.startsWith('shot:') && !key.startsWith('frames:')) continue;
      const point = raw.positions?.[key];
      if (Number.isFinite(point?.x) && Number.isFinite(point?.y) && Math.abs(point.x) < 100000 && Math.abs(point.y) < 100000) saved.positions![key] = point;
    }
    const view = raw.viewport;
    if (Number.isFinite(view?.x) && Number.isFinite(view?.y) && view.zoom >= .08 && view.zoom <= 1.8) saved.viewport = view;
    return saved;
  } catch { return {}; }
}
const RemixNode = memo(function RemixNode({ data }: { data: CanvasData }) {
  const Icon = data.kind === 'source' || data.kind === 'shot' ? Film : data.kind === 'frames' ? ImagePlus : data.kind === 'character' ? ImagePlus : data.kind === 'prompt' ? WandSparkles : Play;
  return <article className={`remix-node remix-node--${data.kind}`}>
    <header className="remix-node-drag"><span><Icon size={14} />{data.title}</span><span className={`remix-node-status ${data.ready ? 'ready' : ''}`}>{data.ready && <Check size={11} />}{data.status}<GripVertical size={13} /></span></header>
    {data.kind === 'prompt' && <><Handle type="target" id="source" position={Position.Top} style={{ left: 35 }} /><Handle type="target" id="character" position={Position.Left} style={{ top: 195 }} className="image-port" /></>}
    {data.kind === 'video' && <><Handle type="target" id="prompt" position={Position.Left} style={{ top: 102 }} className="text-port" /><Handle type="target" id="character" position={Position.Left} style={{ top: 151 }} className="image-port" /></>}
    {(data.kind === 'shot' || data.kind === 'frames') && <Handle type="target" id="input" position={Position.Left} style={{ top: 135 }} />}
    {data.kind === 'source' && <Handle type="source" id="plan" position={Position.Top} />}
    <div className="remix-node-content nodrag nowheel nopan">{data.content}</div>
    {data.kind !== 'video' && data.kind !== 'frames' && <Handle type="source" id="output" position={Position.Right} style={{ top: data.kind === 'prompt' ? 80 : data.kind === 'shot' ? 135 : 145 }} className={data.kind === 'character' ? 'image-port' : 'text-port'} />}
  </article>;
});
const nodeTypes = { remix: RemixNode };
function EvidenceEdge({ id, sourceX, sourceY, targetX, targetY, style, label, labelStyle, labelBgStyle }: EdgeProps) {
  const top = Math.min(sourceY, targetY) - 70;
  const direction = targetX >= sourceX ? 1 : -1;
  return <BaseEdge id={id} path={`M ${sourceX},${sourceY} V ${top + 12} Q ${sourceX},${top} ${sourceX + direction * 12},${top} H ${targetX - direction * 12} Q ${targetX},${top} ${targetX},${top + 12} V ${targetY}`} style={style} label={label} labelX={(sourceX + targetX) / 2} labelY={top} labelStyle={labelStyle} labelBgStyle={labelBgStyle} labelBgPadding={[8, 5]} />;
}
function GenerationInputEdge(props: EdgeProps) {
  const [path] = props.targetHandleId === 'character' ? getSmoothStepPath(props) : getBezierPath(props);
  return <BaseEdge id={props.id} path={path} style={props.style} markerEnd={props.markerEnd} label={props.label} labelX={props.targetX - 85} labelY={props.targetY - 13} labelStyle={props.labelStyle} labelBgStyle={props.labelBgStyle} labelBgPadding={[7, 4]} />;
}
const edgeTypes = { evidence: EvidenceEdge, generationInput: GenerationInputEdge };
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="remix-field"><span>{label}</span>{children}</label>;
}

export default function RemixStage({ project, disabled, onAction, onSave, onUpload, onCopy, onSettings }: {
  project: Project; disabled: boolean;
  onAction: (action: RemixAction, settings: RemixSettings, prompt?: string, videoId?: string) => void;
  onSave: (settings: RemixSettings, prompt?: string) => void;
  onUpload: (file: File, settings: RemixSettings) => void;
  onCopy: (text: string) => void; onSettings: () => void;
}) {
  const [settings, setSettings] = useState(project.remix?.settings || defaultRemixSettings);
  const [prompt, setPrompt] = useState(project.remix?.plan?.prompt || '');
  const [layout] = useState(() => readLayout(project.id));
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const [zoom, setZoom] = useState(Math.round((layout.viewport?.zoom || 1) * 100));
  const [tool, setTool] = useState<'select' | 'hand'>('select');
  const [expanded, setExpanded] = useState(false);
  const [videoId, setVideoId] = useState('');
  const [briefOpen, setBriefOpen] = useState(!project.remix?.plan);
  const savedSettings = JSON.stringify(project.remix?.settings || defaultRemixSettings);
  const flow = useRef<ReactFlowInstance<CanvasNode>>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const sourcePlayer = useRef<HTMLVideoElement>(null);
  const shots = project.analysis?.shots || [];
  const [focusedShot, setFocusedShot] = useState('');
  useEffect(() => { setSettings(project.remix?.settings || defaultRemixSettings); }, [project.id, savedSettings]);
  useEffect(() => { setPrompt(project.remix?.plan?.prompt || ''); }, [project.id, project.remix?.plan?.prompt]);
  useEffect(() => {
    if (!expanded) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [expanded]);
  const patch = (change: Partial<RemixSettings>) => setSettings(previous => ({ ...previous, ...change }));
  const changed = JSON.stringify(settings) !== JSON.stringify(project.remix?.settings || defaultRemixSettings);
  const proposed = { ...project, remix: { ...(project.remix || { settings, videos: [] }), settings } };
  const characterReady = remixCharacterCurrent(proposed);
  const planReady = remixPlanCurrent(proposed);
  const editablePrompt = planReady ? prompt : undefined;
  const videos = [...(project.remix?.videos || [])].reverse();
  const video = videos.find(item => item.id === videoId) || videos[0];
  const job = project.job?.kind.startsWith('remix-') ? project.job : undefined;
  const uploaded = project.remix?.character?.source === 'uploaded';
  const valid = !!project.analysis && (!!settings.character.trim() || uploaded);
  const reference = project.assets.find(asset => asset.kind === 'video');
  const uploadFile = (file?: File) => { if (file && !disabled) onUpload(file, settings); };
  const persist = (viewport?: Viewport) => {
    try { localStorage.setItem(`sop-remix-canvas-v2:${project.id}`, JSON.stringify({ positions: Object.fromEntries((flow.current?.getNodes() || nodes).map(node => [node.id, node.position])), viewport: viewport || flow.current?.getViewport() })); } catch {}
  };
  const fit = () => { void flow.current?.fitView({ padding: .12, maxZoom: 1, duration: 180 }); };
  const focusMedia = (shotId: string) => {
    setFocusedShot(shotId);
    const ids = shotId ? [`shot:${shotId}`, `frames:${shotId}`] : ['source', ...shots.flatMap(shot => [`shot:${shot.id}`, `frames:${shot.id}`])];
    void flow.current?.fitView({ nodes: ids.map(id => ({ id })), padding: .15, minZoom: .08, maxZoom: .9, duration: 200 });
  };
  const focusRemix = () => { void flow.current?.fitView({ nodes: ['character', 'prompt', 'video'].map(id => ({ id })), padding: .12, maxZoom: .9, duration: 200 }); };
  const reset = () => {
    setNodes(previous => previous.map(node => ({ ...node, position: node.data.position })));
    try { localStorage.removeItem(`sop-remix-canvas-v2:${project.id}`); } catch {}
    window.requestAnimationFrame(fit);
  };
  const state = (kind: string, ready: boolean, stale = false) => job?.status === 'running' && job.kind === `remix-${kind}` ? '处理中' : stale ? '需要更新' : ready ? '已就绪' : '待准备';
  const sourceContent = <>
    {reference ? <><div className="remix-source-preview"><video ref={sourcePlayer} src={reference.url} poster={reference.thumbnail} controls playsInline preload="metadata" /></div><div className="remix-media-caption"><strong title={reference.name}>{reference.name}</strong><span>{(reference.duration || project.analysis?.duration || 0).toFixed(1)}s · {project.analysis?.shots.length || 0} 个镜头</span></div></> : <div className="remix-empty-media"><Film size={28} /><strong>先上传参考视频</strong><span>在第一阶段准备原片</span></div>}
    <div className="remix-source-evidence"><span>视频拆解素材 · {shots.length} 个片段 / {shots.length * 3} 张关键帧</span><div className="remix-shot-strip">{shots.map((shot, index) => <button key={shot.id} title={`查看镜头 ${index + 1} 及其关键帧`} onClick={() => focusMedia(shot.id)}><b>{String(index + 1).padStart(2, '0')}</b><small>{shot.start.toFixed(1)}s</small></button>)}</div><p className="remix-hint">右侧按镜头依次列出真实片段，以及首帧、中间关键帧、尾帧。</p></div>
  </>;
  const characterContent = <>
    <input ref={uploadInput} type="file" hidden accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" aria-label="上传人物参考图" disabled={disabled} onChange={event => { uploadFile(event.target.files?.[0]); event.target.value = ''; }} />
    <div className="remix-character-preview" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); uploadFile(event.dataTransfer.files[0]); }}>
      {project.remix?.character ? <a href={project.remix.character.url} target="_blank" rel="noreferrer"><img src={project.remix.character.url} alt={uploaded ? '上传的人物参考图' : '生成的人物参考图'} /></a> : <button className="remix-empty-media" disabled={disabled} onClick={() => uploadInput.current?.click()}><ImagePlus size={30} /><strong>拖入一张人物参考图</strong><span>或点击上传 · JPG / PNG / WebP</span><small>单张最大 10 MB</small></button>}
    </div>
    <div className="remix-node-actions"><button className="remix-button" disabled={disabled} onClick={() => uploadInput.current?.click()}><Upload size={13} />{project.remix?.character ? '替换图片' : '上传图片'}</button>{project.remix?.character && <a className="remix-icon-button" href={project.remix.character.url} download title="下载人物图" aria-label="下载人物图"><Download size={14} /></a>}<span>{uploaded ? '已上传' : project.remix?.character ? 'AI 生成' : '人物参考'}</span></div>
    <div className="remix-node-form"><Field label={uploaded ? '人物补充描述 · 选填' : '描述你想要的人物'}><textarea rows={3} maxLength={3000} disabled={disabled} value={settings.character} onChange={event => patch({ character: event.target.value })} /></Field><button className="remix-button remix-run" disabled={disabled || !project.analysis || !settings.character.trim()} onClick={() => onAction('character', settings)}>{job?.kind === 'remix-character' && job.status === 'running' ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}{project.remix?.character ? '重新生成人物' : '生成人物参考图'}</button>{project.remix?.character && !characterReady && <p className="remix-warning">人物描述或画幅已修改，请更新参考图。</p>}{project.remix?.character && !uploaded && <details><summary>人物图生成提示词</summary><pre>{project.remix.character.prompt}</pre></details>}</div>
  </>;
  const promptContent = <div className="remix-node-form">
    <div className="remix-prompt-basis"><strong>提示词编写依据</strong><div className="remix-input-chips"><span className={project.analysis ? 'connected' : ''}><Film size={12} />原片分析与证据帧</span><span className={characterReady ? 'connected image' : ''}><ImagePlus size={12} />人物参考</span></div><p>将镜头、关键帧和人物要求整理为文字提示词。</p></div>
    <details className="remix-brief-details" open={briefOpen} onToggle={event => setBriefOpen(event.currentTarget.open)}><summary>二创要求<ChevronDown size={14} /></summary><div><Field label="希望保留的内容"><textarea rows={3} maxLength={4000} disabled={disabled} value={settings.preserve} onChange={event => patch({ preserve: event.target.value })} /></Field><Field label="希望修改的内容"><textarea rows={3} maxLength={4000} disabled={disabled} value={settings.changes} onChange={event => patch({ changes: event.target.value })} /></Field><button className="remix-button" disabled={disabled || !valid} onClick={() => onSave(settings, editablePrompt)}><Save size={13} />保存要求</button></div></details>
    <div className="remix-prompt-label"><span>输出 · 文字提示词</span><small>提交给 Omni Flash</small></div>
    <textarea aria-label="二创视频生成提示词" className="remix-prompt-editor" rows={10} value={prompt} placeholder="先准备人物参考图，再根据原片镜头和二创要求编写提示词。生成后可以在这里继续编辑。" disabled={disabled || !planReady} onChange={event => setPrompt(event.target.value)} />
    <div className="remix-node-actions"><button className="remix-button remix-run" disabled={disabled || !valid || !characterReady} onClick={() => onAction('plan', settings)}>{job?.kind === 'remix-plan' && job.status === 'running' ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}{project.remix?.plan ? '重新编写' : '编写提示词'}</button><button className="remix-icon-button" title="保存提示词" aria-label="保存提示词" disabled={disabled || !planReady || !prompt.trim()} onClick={() => onSave(settings, prompt)}><Save size={15} /></button><button className="remix-icon-button" title="复制提示词" aria-label="复制提示词" disabled={!prompt} onClick={() => onCopy(prompt)}><Copy size={15} /></button></div>
    {changed && <p className="remix-hint">要求已修改，运行时会保存并检查已有产物。</p>}
    {project.remix?.plan && !planReady && <p className="remix-warning">输入已更新，请重新编写提示词。</p>}
    {!project.analysis && <p className="remix-warning">请先完成第二阶段的视频拆解。</p>}
    {project.remix?.plan && <details><summary>提示词依据与镜头安排</summary><p className="remix-hint">由 {project.remix.plan.model} 编写。证据帧用于编写文字提示词；Omni Flash 接收人物参考图和文字提示词。</p><div className="remix-shot-plan">{project.remix.plan.shots.map(shot => { const item = project.remix!.plan!.evidence.find(frame => frame.shotId === shot.sourceShotId); return <div key={shot.sourceShotId}><b>{shot.start.toFixed(1)}–{shot.end.toFixed(1)}s</b><span>{shot.sourceShotId}</span><small>原片 {item?.sourceStart.toFixed(1)}–{item?.sourceEnd.toFixed(1)}s</small></div>; })}</div></details>}
  </div>;
  const videoContent = <>
    <div className="remix-generation-inputs" aria-label="下一次生成提交给视频模型的输入">
      <div className="remix-generation-inputs-heading"><strong>下一次生成的输入</strong><span>Omni Flash · 2 项</span></div>
      <div className="remix-generation-input-row text"><span className="remix-generation-input-icon"><FileText size={17} /></span><div><strong>文字提示词</strong><small>来自「二创视频提示词」节点</small></div><span className="remix-generation-input-state">{planReady && prompt.trim() ? '已就绪' : '待编写'}</span></div>
      <div className="remix-generation-input-row image"><span className="remix-generation-input-icon">{project.remix?.character ? <img src={project.remix.character.url} alt="将提交给视频模型的人物参考图" /> : <ImagePlus size={17} />}</span><div><strong>人物参考图</strong><small>1 张 · 来自「人物参考图」节点</small></div><span className="remix-generation-input-state">{characterReady ? '已就绪' : project.remix?.character ? '需更新' : '待上传'}</span></div>
      <p>原视频、镜头片段与证据关键帧用于编写提示词，不作为图片或视频提交给 Omni Flash。</p>
    </div>
    <div className="remix-video-preview">{video?.status === 'completed' && video.url ? <video key={video.id} src={video.url} poster={video.thumbnail} controls playsInline preload="metadata" /> : <div className="remix-empty-media">{video?.status === 'running' ? <LoaderCircle size={30} className="spin" /> : <Play size={30} strokeWidth={1.3} />}<strong>{video?.status === 'running' ? '正在生成二创视频' : video?.status === 'failed' ? '本次生成未完成' : '让新人物演绎你的镜头'}</strong><span>{video?.status === 'running' ? '结果会自动出现在这里' : '人物参考图 + 文字提示词 → 10 秒视频'}</span></div>}</div>
    <div className="remix-node-form">
      <div className="remix-video-inputs"><div><strong>Omni Flash</strong><span>人物参考图 + 文字提示词</span></div><span className="remix-duration">10s</span></div>
      <div className="remix-generation-settings"><Field label="画幅"><select disabled={disabled} value={settings.aspectRatio} onChange={event => patch({ aspectRatio: event.target.value as RemixSettings['aspectRatio'] })}><option value="9:16">9:16 竖屏</option><option value="16:9">16:9 横屏</option></select></Field><Field label="分辨率"><select disabled={disabled} value={settings.resolution} onChange={event => patch({ resolution: event.target.value as RemixSettings['resolution'] })}><option value="720p">720p</option><option value="1080p">1080p</option></select></Field></div>
      <button className="remix-button remix-run remix-generate" disabled={disabled || !planReady || !prompt.trim()} onClick={() => { setVideoId(''); onAction('video', settings, prompt); }}><Play size={14} />生成 10 秒视频</button>
      {!planReady && <p className="remix-hint">{!characterReady ? '先上传或生成人物参考图，再编写提示词。' : '先编写二创提示词，再生成视频。'}</p>}
      {job?.status === 'running' && <div className="remix-progress" role="status"><LoaderCircle size={14} className="spin" /><span>{job.message}</span><b>{job.progress}%</b></div>}
      {job?.status === 'failed' && <p className="remix-warning" role="alert">{job.message}</p>}
      {!!videos.length && <div className="remix-version-bar"><label><span>生成记录</span><select aria-label="选择二创视频版本" value={video?.id || ''} onChange={event => setVideoId(event.target.value)}>{videos.map((item, index) => <option key={item.id} value={item.id}>版本 {videos.length - index} · {item.status === 'completed' ? '已完成' : item.status === 'running' ? '生成中' : '未完成'}</option>)}</select></label>{video?.url && video.status === 'completed' && <a className="remix-icon-button" href={video.url} download title="下载此版本视频" aria-label="下载此版本视频"><Download size={15} /></a>}</div>}
      {video && <><p className="remix-hint">{video.resolution} · {video.aspectRatio}{video.basis !== remixVideoBasis(proposed) && ' · 历史版本'}</p>{video.error && <p className="remix-warning">{video.error}</p>}{video.status === 'failed' && video.requestId && <button className="remix-button" disabled={disabled} onClick={() => onAction('recover', settings, undefined, video.id)}><RotateCcw size={13} />恢复查询 / 下载已提交任务</button>}<details><summary>本次生成详情</summary><p className="remix-hint">{video.model}{video.requestId && ` · 任务 ID：${video.requestId}`}</p><pre>{video.prompt}</pre></details></>}
    </div>
  </>;
  const definitions: CanvasData[] = [
    { id: 'source', position: positions.source, kind: 'source', title: '原视频', status: project.analysis ? `${project.analysis.shots.length} 个镜头` : '待拆解', ready: !!project.analysis, content: sourceContent },
    { id: 'character', position: positions.character, kind: 'character', title: '人物参考图', status: state('character', characterReady, !!project.remix?.character && !characterReady), ready: characterReady, content: characterContent },
    { id: 'prompt', position: positions.prompt, kind: 'prompt', title: '二创视频提示词', status: state('plan', planReady, !!project.remix?.plan && !planReady), ready: planReady, content: promptContent },
    { id: 'video', position: positions.video, kind: 'video', title: '二创视频', status: video?.status === 'completed' ? '已完成' : video?.status === 'running' ? '生成中' : video?.status === 'failed' ? '未完成' : 'Omni Flash', ready: video?.status === 'completed', content: videoContent },
  ];
  const mediaDefinitions: CanvasData[] = shots.flatMap((shot, index) => [
    { id: `shot:${shot.id}`, position: { x: 430, y: index * 380 }, kind: 'shot', title: `镜头片段 ${String(index + 1).padStart(2, '0')}`, status: `${(shot.end - shot.start).toFixed(2)}s`, ready: false, content: <RemixShotClip key={shot.id} project={project} shot={shot} index={index} /> },
    { id: `frames:${shot.id}`, position: { x: 850, y: index * 380 }, kind: 'frames', title: `镜头 ${String(index + 1).padStart(2, '0')} · 证据关键帧`, status: '3 张 · 原片截取', ready: false, content: <RemixShotFrames key={shot.id} project={project} shot={shot} /> },
  ]);
  // Only content changes with job polling; preserve node positions, selection and input DOM.
  useEffect(() => {
    setNodes(previous => {
      const byId = new Map(previous.map(node => [node.id, node]));
      return [...definitions, ...mediaDefinitions].map(data => ({ ...byId.get(data.id), id: data.id, type: 'remix', dragHandle: '.remix-node-drag', position: byId.get(data.id)?.position || layout.positions?.[data.id] || data.position, data }));
    });
  }, [project, settings, prompt, disabled, videoId, briefOpen]);
  const edges = useMemo<Edge[]>(() => [
    { id: 'source-plan', source: 'source', sourceHandle: 'plan', target: 'prompt', targetHandle: 'source', type: 'evidence', label: '原片分析与关键帧 · 用于编写文字', labelStyle: { fill: '#8994a2', fontSize: 11 }, labelBgStyle: { fill: '#fafbfc' }, style: { stroke: '#b0bcc9', strokeWidth: 1.4, strokeDasharray: '5 5' } },
    { id: 'character-plan', source: 'character', sourceHandle: 'output', target: 'prompt', targetHandle: 'character', style: { stroke: '#aebccc', strokeWidth: 1.4, strokeDasharray: '5 5' } },
    { id: 'plan-video', source: 'prompt', sourceHandle: 'output', target: 'video', targetHandle: 'prompt', type: 'generationInput', label: '文字提示词', labelStyle: { fill: '#63816a', fontSize: 11, fontWeight: 500 }, labelBgStyle: { fill: '#f3f7f3' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#a8b6a4', width: 15, height: 15 }, animated: job?.status === 'running' && job.kind === 'remix-video', style: { stroke: '#a8b6a4', strokeWidth: 1.7 } },
    { id: 'character-video', source: 'character', sourceHandle: 'output', target: 'video', targetHandle: 'character', type: 'generationInput', label: '人物参考图 · 1 张', labelStyle: { fill: '#638fca', fontSize: 11, fontWeight: 500 }, labelBgStyle: { fill: '#eef5fd' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#91bdf2', width: 15, height: 15 }, style: { stroke: '#91bdf2', strokeWidth: 1.5 } },
    ...shots.flatMap<Edge>(shot => [
      { id: `source-shot:${shot.id}`, source: 'source', sourceHandle: 'output', target: `shot:${shot.id}`, targetHandle: 'input', style: { stroke: '#b0bcc9', strokeWidth: 1.4 } },
      { id: `shot-frames:${shot.id}`, source: `shot:${shot.id}`, sourceHandle: 'output', target: `frames:${shot.id}`, targetHandle: 'input', style: { stroke: '#b0bcc9', strokeWidth: 1.5 } },
    ]),
  ], [job?.status, job?.kind, project.analysis]);
  return <section className={`remix-stage${expanded ? ' is-expanded' : ''}`} aria-label="人物与视频二创画布">
    <header className="remix-canvas-header"><div><span className="remix-canvas-mark"><WandSparkles size={17} /></span><div><h2>人物与视频二创</h2><p>把参考、想法和成片放在同一张画布上</p></div></div><div className="remix-canvas-navigation"><button className="remix-button" onClick={() => focusMedia('')}><Film size={13} />镜头素材</button>{!!shots.length && <select aria-label="定位镜头及关键帧" value={shots.some(shot => shot.id === focusedShot) ? focusedShot : ''} onChange={event => focusMedia(event.target.value)}><option value="">全部镜头</option>{shots.map((shot, index) => <option key={shot.id} value={shot.id}>镜头 {String(index + 1).padStart(2, '0')} · {shot.start.toFixed(1)}–{shot.end.toFixed(1)}s</option>)}</select>}<button className="remix-button" onClick={focusRemix}><WandSparkles size={13} />二创流程</button><span className="remix-model-label">Omni Flash · 10s</span><button className="remix-icon-button" title="模型连接" aria-label="模型连接" onClick={onSettings}><Settings2 size={16} /></button><button className="remix-icon-button" title={expanded ? '退出全屏画布' : '全屏画布'} aria-label={expanded ? '退出全屏画布' : '全屏画布'} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button></div></header>
    <div className="remix-canvas-viewport"><ReactFlow<CanvasNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onNodeDragStop={() => persist()} onInit={instance => { flow.current = instance; }} onMoveEnd={(_event, viewport) => { setZoom(Math.round(viewport.zoom * 100)); persist(viewport); }} defaultViewport={layout.viewport} fitView={!layout.viewport} fitViewOptions={{ padding: .12, minZoom: .08, maxZoom: .9 }} minZoom={.08} maxZoom={1.8} nodesConnectable={false} edgesReconnectable={false} edgesFocusable={false} deleteKeyCode={null} nodesDraggable={tool === 'select'} panOnDrag={tool === 'hand' ? true : [1, 2]} selectionOnDrag={tool === 'select'} panOnScroll zoomOnScroll={false} zoomOnPinch preventScrolling ariaLabelConfig={{ 'node.a11yDescription.default': '使用方向键移动节点，按 Enter 选中。' }}><Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#d4d9df" /></ReactFlow>
      <div className="remix-canvas-tools" role="toolbar" aria-label="画布工具"><button className={`remix-icon-button ${tool === 'select' ? 'active' : ''}`} title="选择和拖动节点" aria-label="选择工具" aria-pressed={tool === 'select'} onClick={() => setTool('select')}><MousePointer2 size={17} /></button><button className={`remix-icon-button ${tool === 'hand' ? 'active' : ''}`} title="拖动画布" aria-label="平移工具" aria-pressed={tool === 'hand'} onClick={() => setTool('hand')}><Hand size={17} /></button><i /><button className="remix-icon-button" title="缩小画布" aria-label="缩小画布" onClick={() => void flow.current?.zoomOut({ duration: 150 })}><ZoomOut size={16} /></button><button className="remix-zoom" title="重置到 100%" aria-label="重置到百分之百缩放" onClick={() => void flow.current?.zoomTo(1, { duration: 150 })}>{zoom}%</button><button className="remix-icon-button" title="放大画布" aria-label="放大画布" onClick={() => void flow.current?.zoomIn({ duration: 150 })}><ZoomIn size={16} /></button><i /><button className="remix-icon-button" title="适应全部节点" aria-label="适应全部节点" onClick={fit}><LocateFixed size={17} /></button><button className="remix-icon-button" title="整理节点布局" aria-label="整理节点布局" onClick={reset}><RotateCcw size={15} /></button></div>
      <div className="remix-canvas-help">拖动节点标题移动 · 滚动平移 · 双指缩放</div>
    </div>
    <footer className="remix-canvas-footer"><span><Check size={12} />画布布局保存在此设备</span><span>修改要求后点击保存，或直接运行节点</span></footer>
  </section>;
}
