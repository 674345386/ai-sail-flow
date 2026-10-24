import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Background, BackgroundVariant, BaseEdge, Handle, MarkerType, Position, getBezierPath, getSmoothStepPath, ReactFlow, useNodesState, type Edge, type EdgeProps, type Node, type ReactFlowInstance, type Viewport } from '@xyflow/react';
import { AlertTriangle, Check, ChevronDown, Clapperboard, Copy, Download, FileText, Film, GripVertical, Hand, ImagePlus, LoaderCircle, LocateFixed, Maximize2, Minimize2, MousePointer2, Play, RefreshCw, RotateCcw, Save, Settings2, Sparkles, Upload, WandSparkles, ZoomIn, ZoomOut } from 'lucide-react';
import type { Project } from '../shared/domain';
import { getRemixSettings, remixBgmOptions, remixCharacterCurrent, remixCorrectionCurrent, remixPlanCurrent, remixVideoBasis, type RemixAction, type RemixSettings } from '../shared/remix';
import { RemixShotClip, RemixShotFrames } from './RemixShotMedia';
import { analysisModeLabel, RemixAnalysisResult, RemixCorrectionResult } from './RemixObservability';
import { shotEvidenceFrames } from '../shared/shot-evidence';
import { tierPlan, type FramePosition, type TierFramePlan, type TierPlan } from '../shared/tier-prompt';
import { levelInfo } from '../shared/replication-levels';
import { aspectOf, tierVideoState, type OpenFrame } from './TierWorkbench';
import '@xyflow/react/dist/style.css';
import './remix-stage.css';

type CanvasData = { id: string; position: { x: number; y: number }; title: string; kind: 'source' | 'character' | 'prompt' | 'video' | 'shot' | 'frames' | 'newFrames' | 'clip' | 'analysis' | 'correction' | 'frameInfo' | 'action'; status: string; ready: boolean; content: ReactNode; label?: ReactNode; open?: boolean };
/** The stage-3 canvas's new-keyframe column: the same frame data, generator and drawer as the storyboard overview. */
export type RemixTierFrames = {
  disabled: boolean; ratioLabel: string; frameBusy: string[]; frameFailed: Record<string, string>;
  onFrame: (shotId: string, position: FramePosition) => void; onGenerateShots: (shotIds: string[]) => void;
  open: OpenFrame | null; onOpen: (frame: OpenFrame) => void;
  openVideo: string | null; onOpenVideo: (shotId: string) => void; onVideo: (shotId: string) => void;
};
const NEW_FRAMES_X = 1610, CLIP_X = NEW_FRAMES_X + 440 + 120;
type CanvasNode = Node<CanvasData, 'remix'>;
type Layout = { positions?: Record<string, { x: number; y: number }>; viewport?: Viewport };
const positions = {
  source: { x: 0, y: 0 }, analysisAction: { x: 430, y: 0 }, analysis: { x: 900, y: 0 },
  mediaAction: { x: 430, y: 740 }, frameInfo: { x: 900, y: 740 },
  correctionAction: { x: 1480, y: 300 }, correction: { x: 1950, y: 300 },
  promptAction: { x: 2530, y: 300 }, prompt: { x: 3020, y: 300 },
  character: { x: 2530, y: 1050 }, videoAction: { x: 3600, y: 300 }, video: { x: 4170, y: 300 },
};
const correctionFlowIds = ['source', 'analysisAction', 'analysis', 'mediaAction', 'frameInfo', 'correctionAction', 'correction'];
function readLayout(id: string): Layout {
  try {
    const raw = JSON.parse(localStorage.getItem(`sop-remix-canvas-v4:${id}`) || '{}');
    const saved: Layout = { positions: {} };
    for (const key of Object.keys(raw.positions || {})) {
      if (!Object.hasOwn(positions, key) && !key.startsWith('shot:') && !key.startsWith('frames:') && !key.startsWith('newFrames:') && !key.startsWith('clip:')) continue;
      const point = raw.positions?.[key];
      if (Number.isFinite(point?.x) && Number.isFinite(point?.y) && Math.abs(point.x) < 100000 && Math.abs(point.y) < 100000) saved.positions![key] = point;
    }
    const view = raw.viewport;
    if (Number.isFinite(view?.x) && Number.isFinite(view?.y) && view.zoom >= .08 && view.zoom <= 1.8) saved.viewport = view;
    return saved;
  } catch { return {}; }
}
const RemixNode = memo(function RemixNode({ data }: { data: CanvasData }) {
  const Icon = data.kind === 'action' ? WandSparkles : data.kind === 'newFrames' ? Sparkles : data.kind === 'clip' ? Clapperboard : data.kind === 'source' || data.kind === 'shot' ? Film : ['frames', 'frameInfo', 'character'].includes(data.kind) ? ImagePlus : data.kind === 'video' ? Play : FileText;
  const role = data.kind === 'action' ? '动作' : ['analysis', 'correction', 'prompt', 'video', 'frameInfo', 'newFrames', 'clip'].includes(data.kind) ? '结果' : '素材';
  return <article className={`remix-node remix-node--${data.kind}${data.open ? ' is-open' : ''}`}>
    <header className="remix-node-drag"><span><Icon size={14} />{data.label ?? data.title}</span><span className={`remix-node-status ${data.ready ? 'ready' : ''}`}>{data.ready && <Check size={11} />}{data.status}<GripVertical size={13} /></span></header>
    <div className="remix-node-role"><span>{role}</span>{data.kind === 'action' ? '处理输入 → 输出结果' : data.kind === 'frameInfo' ? '关键帧证据 · 汇总入口' : data.kind === 'newFrames' ? '参照证据关键帧生成 · 点击帧编辑' : data.kind === 'clip' ? '新首帧 + 新尾帧 → Veo · 点击编辑' : role === '结果' ? '查看 / 复制产物' : '参考输入'}</div>
    {data.id === 'correctionAction' ? <><Handle type="target" id="analysis" position={Position.Left} style={{ top: 95 }} /><Handle type="target" id="frames" position={Position.Left} style={{ top: 180 }} className="image-port" /></>
      : data.id === 'videoAction' ? <><Handle type="target" id="prompt" position={Position.Left} style={{ top: 145 }} className="text-port" /><Handle type="target" id="character" position={Position.Bottom} className="image-port" /></>
      : data.kind !== 'source' && data.kind !== 'character' && data.kind !== 'shot' && <Handle type="target" id="input" position={Position.Left} style={{ top: data.kind === 'frames' || data.kind === 'newFrames' || data.kind === 'clip' ? 135 : 95 }} />}
    {data.id === 'promptAction' && <Handle type="target" id="character" position={Position.Bottom} className="image-port" />}
    <div className="remix-node-content nodrag nowheel nopan">{data.content}</div>
    {data.kind !== 'video' && data.kind !== 'clip' && <Handle type="source" id="output" position={Position.Right} style={{ top: data.kind === 'shot' || data.kind === 'frames' || data.kind === 'newFrames' ? 135 : 95 }} className={['character', 'frameInfo'].includes(data.kind) ? 'image-port' : 'text-port'} />}
    {data.kind === 'source' && <Handle type="source" id="media" position={Position.Bottom} />}
    {data.kind === 'character' && <Handle type="source" id="authoring" position={Position.Top} className="image-port" />}
  </article>;
});
const nodeTypes = { remix: RemixNode };
function GenerationInputEdge(props: EdgeProps) {
  const [path] = props.targetHandleId === 'character' ? getSmoothStepPath(props) : getBezierPath(props);
  const imageInput = props.targetHandleId === 'character';
  return <BaseEdge id={props.id} path={path} style={props.style} markerEnd={props.markerEnd} label={props.label} labelX={imageInput ? props.targetX : props.targetX - 85} labelY={imageInput ? props.targetY + 24 : props.targetY - 13} labelStyle={props.labelStyle} labelBgStyle={props.labelBgStyle} labelBgPadding={[7, 4]} />;
}
const edgeTypes = { generationInput: GenerationInputEdge };
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="remix-field"><span>{label}</span>{children}</label>;
}

const shotNo = (index: number) => String(index + 1).padStart(2, '0');
/** One new frame: uncropped, with the overview's states (未生成 dashed / 生成中 / 已过期 / 失败 + 重试). */
function NewFrameTile({ plan, frame, tier, onOpen }: { plan: TierPlan; frame: TierFramePlan; tier: RemixTierFrames; onOpen: (generate: boolean) => void }) {
  const key = `${plan.shotId}:${frame.position}`, running = tier.frameBusy.includes(key), failure = running ? '' : tier.frameFailed[key] || '';
  const waiting = !frame.result && frame.dependsOnFirst && !plan.frames[0].result;
  const selected = tier.open?.shotId === plan.shotId && tier.open.position === frame.position;
  const empty = !frame.result && !running && !failure;
  return <figure className="remix-newframe">
    <div role="button" tabIndex={0} aria-label={`新${frame.label}`} aria-pressed={selected}
      className={`tier-tile${frame.result ? '' : ' is-empty'}${running ? ' is-loading' : ''}${frame.outdated ? ' is-outdated' : ''}${selected ? ' is-selected' : ''}`}
      onClick={() => onOpen(empty && !waiting && !tier.disabled)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(false); } }}>
      {frame.result ? <img src={frame.result.url} alt={`新${frame.label}`} draggable={false} /> : null}
      {running ? <span className="tier-tile-running"><LoaderCircle size={16} className="spin" /><span>生成中</span></span>
        : failure ? <span className="tier-frame-fail tier-tile-fail"><span>{failure}</span><button type="button" disabled={tier.disabled || waiting} onClick={event => { event.stopPropagation(); tier.onFrame(plan.shotId, frame.position); }}>重试</button></span>
        : !frame.result ? <span className="remix-newframe-empty">{waiting ? <><LoaderCircle size={14} />等首帧</> : <><Sparkles size={14} />点击生成</>}</span>
        : frame.outdated ? <em className="tier-tile-tag is-outdated">已过期</em> : null}
    </div>
    <figcaption>{frame.label}</figcaption>
  </figure>;
}

export default function RemixStage({ project, disabled, tierFrames, onAction, onSave, onUpload, onCopy, onSettings }: {
  project: Project; disabled: boolean; tierFrames?: RemixTierFrames;
  onAction: (action: RemixAction, settings: RemixSettings, prompt?: string, videoId?: string) => void;
  onSave: (settings: RemixSettings, prompt?: string) => void;
  onUpload: (file: File, settings: RemixSettings) => void;
  onCopy: (text: string) => void; onSettings: () => void;
}) {
  const [settings, setSettings] = useState(getRemixSettings(project));
  const [prompt, setPrompt] = useState(project.remix?.plan?.prompt || '');
  const [layout] = useState(() => readLayout(project.id));
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const [zoom, setZoom] = useState(Math.round((layout.viewport?.zoom || 1) * 100));
  const [tool, setTool] = useState<'select' | 'hand'>('select');
  const [expanded, setExpanded] = useState(false);
  const [videoId, setVideoId] = useState('');
  const [briefOpen, setBriefOpen] = useState(!project.remix?.plan);
  const savedSettings = JSON.stringify(getRemixSettings(project));
  const flow = useRef<ReactFlowInstance<CanvasNode>>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const sourcePlayer = useRef<HTMLVideoElement>(null);
  const shots = project.analysis?.shots || [];
  const [focusedShot, setFocusedShot] = useState('');
  useEffect(() => { setSettings(getRemixSettings(project)); }, [project.id, savedSettings]);
  useEffect(() => { setPrompt(project.remix?.plan?.prompt || ''); }, [project.id, project.remix?.plan?.prompt]);
  useEffect(() => {
    if (!expanded) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [expanded]);
  const patch = (change: Partial<RemixSettings>) => setSettings(previous => ({ ...previous, ...change }));
  const changed = JSON.stringify(settings) !== JSON.stringify(getRemixSettings(project));
  const proposed = { ...project, remix: { ...(project.remix || { settings, videos: [] }), settings } };
  const characterReady = remixCharacterCurrent(proposed);
  const planReady = remixPlanCurrent(proposed);
  const correctionReady = remixCorrectionCurrent(project);
  const editablePrompt = planReady ? prompt : undefined;
  const videos = [...(project.remix?.videos || [])].reverse();
  const video = videos.find(item => item.id === videoId) || videos[0];
  const job = project.job?.kind.startsWith('remix-') ? project.job : undefined;
  const uploaded = project.remix?.character?.source === 'uploaded';
  const valid = !!project.analysis && (!!settings.character.trim() || uploaded);
  const reference = project.assets.find(asset => asset.kind === 'video');
  const uploadFile = (file?: File) => { if (file && !disabled) onUpload(file, settings); };
  const persist = (viewport?: Viewport) => {
    try { localStorage.setItem(`sop-remix-canvas-v4:${project.id}`, JSON.stringify({ positions: Object.fromEntries((flow.current?.getNodes() || nodes).map(node => [node.id, node.position])), viewport: viewport || flow.current?.getViewport() })); } catch {}
  };
  const fit = () => { void flow.current?.fitView({ padding: .12, maxZoom: 1, duration: 180 }); };
  const focusMedia = (shotId: string) => {
    setFocusedShot(shotId);
    const ids = shotId ? [`shot:${shotId}`, `frames:${shotId}`, ...(tierFrames ? [`newFrames:${shotId}`, `clip:${shotId}`] : [])] : ['source', 'mediaAction', 'frameInfo', ...shots.flatMap(shot => [`shot:${shot.id}`, `frames:${shot.id}`, ...(tierFrames ? [`newFrames:${shot.id}`] : [])])];
    void flow.current?.fitView({ nodes: ids.map(id => ({ id })), padding: .15, minZoom: .08, maxZoom: .9, duration: 200 });
  };
  const focusCorrection = () => { void flow.current?.fitView({ nodes: correctionFlowIds.map(id => ({ id })), padding: .12, maxZoom: .9, duration: 200 }); };
  const focusRemix = () => { void flow.current?.fitView({ nodes: ['correction', 'promptAction', 'character', 'prompt', 'videoAction', 'video'].map(id => ({ id })), padding: .12, maxZoom: .9, duration: 200 }); };
  const reset = () => {
    setNodes(previous => previous.map(node => ({ ...node, position: node.data.position })));
    try { localStorage.removeItem(`sop-remix-canvas-v4:${project.id}`); } catch {}
    window.requestAnimationFrame(fit);
  };
  const state = (kind: string, ready: boolean, stale = false) => job?.status === 'running' && job.kind === `remix-${kind}` ? '处理中' : stale ? '需要更新' : ready ? '已就绪' : '待准备';
  const sourceContent = <>
    {reference ? <><div className="remix-source-preview"><video ref={sourcePlayer} src={reference.url} poster={reference.thumbnail} controls playsInline preload="metadata" /></div><div className="remix-media-caption"><strong title={reference.name}>{reference.name}</strong><span>{(reference.duration || project.analysis?.duration || 0).toFixed(1)}s · {project.analysis?.shots.length || 0} 个镜头</span></div></> : <div className="remix-empty-media"><Film size={28} /><strong>先上传参考视频</strong><span>在第一阶段准备原片</span></div>}
    <div className="remix-source-evidence"><span>视频拆解素材 · {shots.length} 个片段 / {shots.length * 3} 张关键帧</span><div className="remix-shot-strip">{shots.map((shot, index) => <button key={shot.id} title={`查看镜头 ${index + 1} 及其关键帧`} onClick={() => focusMedia(shot.id)}><b>{String(index + 1).padStart(2, '0')}</b><small>{shot.start.toFixed(1)}s</small></button>)}</div><p className="remix-hint">下方素材区按镜头列出真实片段和关键帧，点击镜头编号定位。</p></div>
  </>;
  const characterContent = <>
    <input ref={uploadInput} type="file" hidden accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" aria-label="上传人物参考图" disabled={disabled} onChange={event => { uploadFile(event.target.files?.[0]); event.target.value = ''; }} />
    <div className="remix-character-preview" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); uploadFile(event.dataTransfer.files[0]); }}>
      {project.remix?.character ? <a href={project.remix.character.url} target="_blank" rel="noreferrer"><img src={project.remix.character.url} alt={uploaded ? '上传的人物参考图' : '生成的人物参考图'} /></a> : <button className="remix-empty-media" disabled={disabled} onClick={() => uploadInput.current?.click()}><ImagePlus size={30} /><strong>拖入一张人物参考图</strong><span>或点击上传 · JPG / PNG / WebP</span><small>单张最大 10 MB</small></button>}
    </div>
    <div className="remix-node-actions"><button className="remix-button" disabled={disabled} onClick={() => uploadInput.current?.click()}><Upload size={13} />{project.remix?.character ? '替换图片' : '上传图片'}</button>{project.remix?.character && <a className="remix-icon-button" href={project.remix.character.url} download title="下载人物图" aria-label="下载人物图"><Download size={14} /></a>}<span>{uploaded ? '已上传' : project.remix?.character ? 'AI 生成' : '人物参考'}</span></div>
    <div className="remix-node-form"><Field label={uploaded ? '人物补充描述 · 选填' : '描述你想要的人物'}><textarea rows={3} maxLength={3000} disabled={disabled} value={settings.character} onChange={event => patch({ character: event.target.value })} /></Field><button className="remix-button remix-run" disabled={disabled || !project.analysis || !settings.character.trim()} onClick={() => onAction('character', settings)}>{job?.kind === 'remix-character' && job.status === 'running' ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}{project.remix?.character ? '重新生成人物' : '生成人物参考图'}</button>{project.remix?.character && !characterReady && <p className="remix-warning">人物描述或画幅已修改，请更新参考图。</p>}{project.remix?.character && !uploaded && <details><summary>人物图生成提示词</summary><pre>{project.remix.character.prompt}</pre></details>}</div>
  </>;
  const promptActionContent = <div className="remix-node-form">
    <p className="remix-observation-intro">保留校正后的完整镜头资料，编排为 10 秒，并加入人物替换与二创要求。场景、动作、运镜等细节直接沿用上游结果。</p>
    <div className="remix-action-io"><span>输入</span><p>校正后提示词 · 保留原片完整细节<br />人物参考图 + 二创要求</p><span>输出</span><p>二创视频提示词 · 10 秒编排</p></div>
    <Field label="配音背景音"><select aria-label="配音背景音" disabled={disabled} value={settings.bgmMode} onChange={event => patch({ bgmMode: event.target.value as RemixSettings['bgmMode'] })}>{Object.entries(remixBgmOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small className="remix-audio-hint">{settings.bgmMode === 'remix' ? '根据画面、情绪与剪辑节奏生成新的原创 BGM；口播沿用原片记录或二创要求。' : '参考原片分析中的音乐风格、节奏与氛围生成配乐；原片未记录 BGM 时保持无 BGM。'}</small></Field>
    <details className="remix-brief-details" open={briefOpen} onToggle={event => setBriefOpen(event.currentTarget.open)}><summary>二创要求<ChevronDown size={14} /></summary><div><Field label="希望保留的内容"><textarea rows={3} maxLength={4000} disabled={disabled} value={settings.preserve} onChange={event => patch({ preserve: event.target.value })} /></Field><Field label="希望修改的内容"><textarea rows={3} maxLength={4000} disabled={disabled} value={settings.changes} onChange={event => patch({ changes: event.target.value })} /></Field><button className="remix-button" disabled={disabled || !valid} onClick={() => onSave(settings, editablePrompt)}><Save size={13} />保存要求</button></div></details>
    <button className="remix-button remix-run" disabled={disabled || !valid || !characterReady} onClick={() => onAction('plan', settings)}>{job?.kind === 'remix-plan' && job.status === 'running' ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}{project.remix?.plan ? '重新校正并编写' : '校正并编写提示词'}</button>
    <p className="remix-hint">此按钮按顺序执行上游校正与本节点编写；先保存校正记录，再保存提示词。</p>
    {job?.kind === 'remix-plan' && job.status === 'running' && <div className="remix-progress" role="status"><LoaderCircle size={14} className="spin" /><span>{job.message}</span><b>{job.progress}%</b></div>}
    {job?.kind === 'remix-plan' && job.status === 'failed' && job.remixPhase === 'prompt' && <p className="remix-warning" role="alert">{job.message}</p>}
    {changed && <p className="remix-hint">要求已修改，运行时会保存并检查已有产物。</p>}
    {!project.analysis && <p className="remix-warning">请先完成视频拆解。</p>}
  </div>;
  const promptContent = <div className="remix-node-form">
    <p className="remix-observation-intro">基于上游「校正后提示词」保留完整细节，增加 10 秒时间分配、人物替换和二创要求，可继续编辑、保存和复制。</p>
    {project.remix?.correction && <p className="remix-hint">{project.remix.plan?.correctionId === project.remix.correction.id ? '当前提示词使用校正记录：' : '待使用的校正记录：'}{project.remix.correction.id}</p>}
    {project.remix?.plan && !project.remix.plan.correctionId && <p className="remix-hint">历史提示词未留存独立校正记录，重新编写后可查看完整校正过程。</p>}
    <div className="remix-prompt-label"><span>输出 · 文字提示词</span><small>提交给 Omni Flash</small></div>
    <textarea aria-label="二创视频生成提示词" className="remix-prompt-editor" rows={10} value={prompt} placeholder="先准备人物参考图，再根据原片镜头和二创要求编写提示词。生成后可以在这里继续编辑。" disabled={disabled || !planReady} onChange={event => setPrompt(event.target.value)} />
    <div className="remix-node-actions"><button className="remix-icon-button" title="保存提示词" aria-label="保存提示词" disabled={disabled || !planReady || !prompt.trim()} onClick={() => onSave(settings, prompt)}><Save size={15} /></button><button className="remix-icon-button" title="复制提示词" aria-label="复制提示词" disabled={!prompt} onClick={() => onCopy(prompt)}><Copy size={15} /></button></div>
    {job?.kind === 'remix-plan' && job.status === 'failed' && project.remix?.plan && <p className="remix-hint">本次流程未完成，以上保留上次保存的提示词。</p>}
    {project.remix?.plan && !planReady && <p className="remix-warning">输入或校正规则已更新，请重新运行校正并编写提示词。</p>}
    {!project.analysis && <p className="remix-warning">请先完成第二阶段的视频拆解。</p>}
    {project.remix?.plan && <details><summary>提示词依据与镜头安排</summary><p className="remix-hint">由 {project.remix.plan.model} 编写。证据帧用于编写文字提示词；Omni Flash 接收人物参考图和文字提示词。</p><div className="remix-shot-plan">{project.remix.plan.shots.map(shot => { const item = project.remix!.plan!.evidence.find(frame => frame.shotId === shot.sourceShotId); return <div key={shot.sourceShotId}><b>{shot.start.toFixed(1)}–{shot.end.toFixed(1)}s</b><span>{shot.sourceShotId}</span><small>原片 {item?.sourceStart.toFixed(1)}–{item?.sourceEnd.toFixed(1)}s</small></div>; })}</div></details>}
  </div>;
  const videoActionContent = <>
    <div className="remix-generation-inputs" aria-label="下一次生成提交给视频模型的输入">
      <div className="remix-generation-inputs-heading"><strong>下一次生成的输入</strong><span>Omni Flash · 2 项</span></div>
      <div className="remix-generation-input-row text"><span className="remix-generation-input-icon"><FileText size={17} /></span><div><strong>文字提示词</strong><small>来自「二创视频提示词」节点</small></div><span className="remix-generation-input-state">{planReady && prompt.trim() ? '已就绪' : '待编写'}</span></div>
      <div className="remix-generation-input-row image"><span className="remix-generation-input-icon">{project.remix?.character ? <img src={project.remix.character.url} alt="将提交给视频模型的人物参考图" /> : <ImagePlus size={17} />}</span><div><strong>人物参考图</strong><small>1 张 · 来自「人物参考图」节点</small></div><span className="remix-generation-input-state">{characterReady ? '已就绪' : project.remix?.character ? '需更新' : '待上传'}</span></div>
      <p>原视频、镜头片段与证据关键帧用于编写提示词，不作为图片或视频提交给 Omni Flash。</p>
    </div>
    <div className="remix-node-form">
      <p className="remix-hint">配音背景音：{remixBgmOptions[settings.bgmMode]} · 随文字提示词提交</p>
      <div className="remix-video-inputs"><div><strong>Omni Flash</strong><span>人物参考图 + 文字提示词</span></div><span className="remix-duration">10s</span></div>
      <div className="remix-generation-settings"><Field label="画幅"><select disabled={disabled} value={settings.aspectRatio} onChange={event => patch({ aspectRatio: event.target.value as RemixSettings['aspectRatio'] })}><option value="9:16">9:16 竖屏</option><option value="16:9">16:9 横屏</option></select></Field><Field label="分辨率"><select disabled={disabled} value={settings.resolution} onChange={event => patch({ resolution: event.target.value as RemixSettings['resolution'] })}><option value="720p">720p</option><option value="1080p">1080p</option></select></Field></div>
      <button className="remix-button remix-run remix-generate" disabled={disabled || !planReady || !prompt.trim()} onClick={() => { setVideoId(''); onAction('video', settings, prompt); }}><Play size={14} />生成 10 秒视频</button>
      {!planReady && <p className="remix-hint">{!characterReady ? '先上传或生成人物参考图，再编写提示词。' : '先编写二创提示词，再生成视频。'}</p>}
      {job?.kind === 'remix-video' && job.status === 'running' && <div className="remix-progress" role="status"><LoaderCircle size={14} className="spin" /><span>{job.message}</span><b>{job.progress}%</b></div>}
      {job?.kind === 'remix-video' && job.status === 'failed' && <p className="remix-warning" role="alert">{job.message}</p>}
    </div>
  </>;
  const videoContent = <>
    <div className="remix-video-preview">{video?.status === 'completed' && video.url ? <video key={video.id} src={video.url} poster={video.thumbnail} controls playsInline preload="metadata" /> : <div className="remix-empty-media">{video?.status === 'running' ? <LoaderCircle size={30} className="spin" /> : <Play size={30} strokeWidth={1.3} />}<strong>{video?.status === 'running' ? '正在生成二创视频' : video?.status === 'failed' ? '本次生成未完成' : '让新人物演绎你的镜头'}</strong><span>{video?.status === 'running' ? '结果会自动出现在这里' : '人物参考图 + 文字提示词 → 10 秒视频'}</span></div>}</div>
    <div className="remix-node-form">
      {!!videos.length && <div className="remix-version-bar"><label><span>生成记录</span><select aria-label="选择二创视频版本" value={video?.id || ''} onChange={event => setVideoId(event.target.value)}>{videos.map((item, index) => <option key={item.id} value={item.id}>版本 {videos.length - index} · {item.status === 'completed' ? '已完成' : item.status === 'running' ? '生成中' : '未完成'}</option>)}</select></label>{video?.url && video.status === 'completed' && <a className="remix-icon-button" href={video.url} download title="下载此版本视频" aria-label="下载此版本视频"><Download size={15} /></a>}</div>}
      {video && <><p className="remix-hint">配音背景音：{video.bgmMode ? remixBgmOptions[video.bgmMode] : '历史版本未记录'}</p><p className="remix-hint">{video.resolution} · {video.aspectRatio}{video.basis !== remixVideoBasis(proposed) && ' · 历史版本'}</p>{video.error && <p className="remix-warning">{video.error}</p>}{video.status === 'failed' && video.requestId && <button className="remix-button" disabled={disabled} onClick={() => onAction('recover', settings, undefined, video.id)}><RotateCcw size={13} />恢复查询 / 下载已提交任务</button>}<details><summary>本次生成详情</summary><p className="remix-hint">{video.model}{video.requestId && ` · 任务 ID：${video.requestId}`}</p><pre>{video.prompt}</pre></details></>}
    </div>
  </>;
  const analysisRunning = !!project.job?.kind.startsWith('analysis') && project.job.status === 'running';
  const analysisFailed = !!project.job?.kind.startsWith('analysis') && project.job.status === 'failed';
  const planRunning = job?.kind === 'remix-plan' && job.status === 'running';
  const correctionRunning = planRunning && job.remixPhase !== 'prompt';
  const correctionFailed = job?.kind === 'remix-plan' && job.status === 'failed' && job.remixPhase !== 'prompt';
  const promptRunning = planRunning && job.remixPhase === 'prompt';
  const promptFailed = job?.kind === 'remix-plan' && job.status === 'failed' && job.remixPhase === 'prompt';
  const correctionStatus = correctionRunning ? job.remixPhase === 'correction' ? '校正中' : '准备关键帧' : correctionFailed ? '校正失败' : correctionReady ? '已完成' : project.remix?.correction ? '需要更新' : '待执行';
  const promptStatus = promptRunning ? '编写中' : correctionRunning ? '等待校正' : promptFailed ? '编写失败' : correctionFailed ? '上游失败' : state('plan', planReady, !!project.remix?.plan && !planReady);
  const definitions: CanvasData[] = [
    { id: 'source', position: positions.source, kind: 'source', title: '原参考视频', status: project.analysis ? `${shots.length} 个镜头` : '待拆解', ready: !!reference, content: sourceContent },
    { id: 'analysisAction', position: positions.analysisAction, kind: 'action', title: '提取原片镜头信息', status: analysisRunning ? '分析中' : analysisFailed ? '分析失败' : project.analysis ? '已完成' : '待分析', ready: !!project.analysis && !analysisRunning && !analysisFailed,
      content: <div className="remix-node-form"><p className="remix-action-method">{analysisModeLabel(project)}</p><p className="remix-observation-intro">从原参考视频提取每个镜头的主体、服装、场景、道具、动作、机位、画面文字和转场方式。</p><div className="remix-action-io"><span>输入</span><p>原参考视频</p><span>输出</span><p>视频分析结果</p></div><p className="remix-hint">在「视频拆解」阶段执行，当前画布展示该阶段实际保存的结果。</p>{(analysisRunning || analysisFailed) && <p className={analysisFailed ? 'remix-warning' : 'remix-hint'} role={analysisFailed ? 'alert' : 'status'}>{project.job?.message}</p>}</div> },
    { id: 'analysis', position: positions.analysis, kind: 'analysis', title: '视频分析结果', status: project.analysis ? analysisRunning ? '上次结果' : '已保存' : '尚无结果', ready: !!project.analysis && !analysisRunning, content: <RemixAnalysisResult project={project} onCopy={onCopy} /> },
    { id: 'mediaAction', position: positions.mediaAction, kind: 'action', title: '提取镜头片段与关键帧', status: reference && shots.length ? '按需提取' : '待拆解', ready: false,
      content: <div className="remix-node-form"><p className="remix-observation-intro">按照视频拆解记录的镜头时间，截取各个镜头片段与首帧、中间关键帧、尾帧。</p><div className="remix-action-io"><span>输入</span><p>原参考视频 + 视频拆解时间点</p><span>输出</span><p>镜头片段 / 关键帧证据</p></div><button className="remix-button" disabled={!shots.length} onClick={() => focusMedia('')}><Film size={13} />查看全部镜头素材</button><p className="remix-hint">素材区按需加载；校正运行时准备本次使用的证据帧。</p></div> },
    { id: 'frameInfo', position: positions.frameInfo, kind: 'frameInfo', title: '关键帧图中的信息', status: shots.length && reference ? '已关联原片' : '待准备', ready: !!shots.length && !!reference,
      content: <div className="remix-node-form"><p className="remix-observation-intro">汇总各镜头的关键帧视觉证据，用于确认服装颜色、人物姿势、商品外观和背景布局。</p><p className="remix-hint">这里提供原片关键帧，并非已生成的独立文字提取报告。具体补充、校正结论保存在下游结果节点。</p><div className="remix-frame-index">{shots.map((shot, index) => <button className="remix-frame-index-row" key={shot.id} onClick={() => focusMedia(shot.id)}><strong>镜头 {String(index + 1).padStart(2, '0')}</strong><span>{shotEvidenceFrames(shot).map(frame => <small key={frame.position}>{frame.position === 'first' ? '首' : frame.position === 'middle' ? '中' : '尾'} · {frame.at.toFixed(2)}s</small>)}</span><span>查看关键帧 →</span></button>)}</div>{!shots.length && <p className="remix-hint">完成视频拆解后关联每个镜头的关键帧。</p>}</div> },
    { id: 'correctionAction', position: positions.correctionAction, kind: 'action', title: '结合关键帧补充、校正细节', status: correctionStatus, ready: correctionReady && !correctionRunning && !correctionFailed,
      content: <div className="remix-node-form"><p className="remix-action-method">以视频分析结果为基础</p><p className="remix-observation-intro">结合关键帧图中的信息，补充遗漏、校正细节，整理出具体、可生成的镜头画面描述。未修改的原文细节完整保留，确认项不替换原文。</p><div className="remix-action-io"><span>输入 1</span><p>视频分析结果 · 原始镜头描述</p><span>输入 2</span><p>关键帧图中的信息 · 视觉证据</p><span>输出</span><p>校正后提示词</p></div><button className="remix-button remix-run" disabled={disabled || !valid || !characterReady} onClick={() => onAction('plan', settings)}>{planRunning ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}运行校正 → 编写提示词</button><p className="remix-hint">本步骤先保存逐镜头核对记录，再继续编写提示词。请先准备人物参考图与二创要求。</p>{(correctionRunning || correctionFailed) && <p className={correctionFailed ? 'remix-warning' : 'remix-hint'} role={correctionFailed ? 'alert' : 'status'}>{job?.message}</p>}</div> },
    { id: 'correction', position: positions.correction, kind: 'correction', title: '校正后提示词', status: correctionReady ? correctionRunning ? '上次结果' : '已保存' : project.remix?.correction ? '历史结果' : '尚无结果', ready: correctionReady && !correctionRunning, content: <RemixCorrectionResult project={project} onCopy={onCopy} showProcess={false} /> },
    { id: 'character', position: positions.character, kind: 'character', title: '人物参考图', status: state('character', characterReady, !!project.remix?.character && !characterReady), ready: characterReady, content: characterContent },
    { id: 'promptAction', position: positions.promptAction, kind: 'action', title: '编写视频提示词', status: promptStatus, ready: planReady && !planRunning, content: promptActionContent },
    { id: 'prompt', position: positions.prompt, kind: 'prompt', title: '二创视频提示词', status: planReady ? planRunning ? '上次结果' : '已保存' : project.remix?.plan ? '需要更新' : '尚无结果', ready: planReady && !planRunning, content: promptContent },
    { id: 'videoAction', position: positions.videoAction, kind: 'action', title: '生成二创视频', status: job?.kind === 'remix-video' && job.status === 'running' ? '生成中' : job?.kind === 'remix-video' && job.status === 'failed' ? '生成失败' : 'Omni Flash', ready: false, content: videoActionContent },
    { id: 'video', position: positions.video, kind: 'video', title: '二创视频', status: video?.status === 'completed' ? '已完成' : video?.status === 'running' ? '待返回结果' : video?.status === 'failed' ? '未完成' : '尚无结果', ready: video?.status === 'completed', content: videoContent },
  ];
  const mediaDefinitions: CanvasData[] = shots.flatMap((shot, index) => [
    { id: `shot:${shot.id}`, position: { x: 430, y: 1580 + index * 420 }, kind: 'shot', title: `镜头片段 ${String(index + 1).padStart(2, '0')}`, status: `${(shot.end - shot.start).toFixed(2)}s`, ready: false, content: <RemixShotClip key={shot.id} project={project} shot={shot} index={index} /> },
    { id: `frames:${shot.id}`, position: { x: 850, y: 1580 + index * 420 }, kind: 'frames', title: `镜头 ${String(index + 1).padStart(2, '0')} · 证据关键帧`, status: '3 张 · 原片截取', ready: false, content: <RemixShotFrames key={shot.id} project={project} shot={shot} /> },
  ]);
  const plans = useMemo(() => shots.map(shot => tierPlan(project, shot)), [project, shots]);
  const aspect = aspectOf(tierFrames?.ratioLabel || '9:16');
  const tierDefinitions: CanvasData[] = tierFrames ? shots.map((shot, index) => {
    const plan = plans[index], done = plan.frames.filter(frame => frame.result).length;
    const running = plan.frames.some(frame => tierFrames.frameBusy.includes(`${shot.id}:${frame.position}`));
    const open = (position: FramePosition, generate: boolean) => { tierFrames.onOpen({ shotId: shot.id, position }); if (generate) tierFrames.onFrame(shot.id, position); };
    return { id: `newFrames:${shot.id}`, position: { x: NEW_FRAMES_X, y: 1580 + index * 420 }, kind: 'newFrames', title: `镜头 ${shotNo(index)} · 新关键帧`,
      label: <>镜头 {shotNo(index)}<code className="remix-timecode">{shot.start.toFixed(1)}–{shot.end.toFixed(1)}s</code></>,
      status: `${levelInfo(plan.level).label} · ${done}/${plan.frames.length}`, ready: done === plan.frames.length, open: tierFrames.open?.shotId === shot.id,
      content: <div className="remix-newframes" style={{ '--tier-aspect': aspect } as CSSProperties}>
        <div className="remix-newframes-grid">{plan.frames.map(frame => <NewFrameTile key={frame.position} plan={plan} frame={frame} tier={tierFrames} onOpen={generate => open(frame.position, generate)} />)}</div>
        <div className="remix-node-actions remix-newframes-foot"><button className="remix-button remix-run" disabled={tierFrames.disabled || running} onClick={() => tierFrames.onGenerateShots([shot.id])}>{running ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}{done ? '重新生成本镜' : '生成本镜'}</button></div>
      </div> };
  }) : [];
  const clipDefinitions: CanvasData[] = tierFrames ? shots.map((shot, index) => {
    const state = tierVideoState(project, shot), shown = state.completed.at(-1), plan = plans[index];
    const expired = state.expired(shown), open = () => tierFrames.onOpenVideo(shot.id);
    const label = state.running ? '生成中' : state.failed ? '失败' : expired ? '已过期' : shown ? '已生成' : '未生成';
    return { id: `clip:${shot.id}`, position: { x: CLIP_X, y: 1580 + index * 420 }, kind: 'clip', title: `镜头 ${shotNo(index)} · 视频片段`,
      label: <>镜头 {shotNo(index)}<code className="remix-timecode">{shot.start.toFixed(1)}–{shot.end.toFixed(1)}s</code></>,
      status: `${levelInfo(plan.level).label} · ${label}`, ready: !!shown && !expired && !state.running, open: tierFrames.openVideo === shot.id,
      content: <div className="remix-clip" style={{ '--tier-aspect': aspect } as CSSProperties}>
        <div role="button" tabIndex={0} aria-label={`编辑镜头 ${shotNo(index)} 视频片段`} className={`remix-clip-player tier-tile${shown ? '' : ' is-empty'}${state.running ? ' is-loading' : ''}${expired ? ' is-outdated' : ''}${tierFrames.openVideo === shot.id ? ' is-selected' : ''}`}
          onClick={open} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); open(); } }}>
          {shown ? <video key={shown.id} src={shown.url} poster={shown.thumbnail} muted loop playsInline preload="metadata" onMouseEnter={event => void event.currentTarget.play().catch(() => {})} onMouseLeave={event => event.currentTarget.pause()} /> : null}
          {state.running ? <span className="tier-tile-state"><LoaderCircle size={16} className="spin" />生成中{state.progress ? ` ${state.progress}%` : ''}</span>
            : state.failed ? <span className="tier-tile-state is-failed"><AlertTriangle size={14} />失败<button type="button" className="remix-button" disabled={tierFrames.disabled || !state.ready} onClick={event => { event.stopPropagation(); tierFrames.onVideo(shot.id); }}>重试</button></span>
            : !shown ? <span className="tier-tile-state">{state.ready ? '未生成 · 点击编辑' : `等${state.missing.join('、')}`}</span> : null}
          {expired && <span className="tier-video-tag">已过期</span>}
        </div>
        <div className="remix-node-actions remix-clip-foot"><span>{shown?.duration ? `${shown.duration.toFixed(1)}s` : ''}</span><button className="remix-button remix-run" disabled={tierFrames.disabled || state.running || !state.ready} title={state.ready ? undefined : `还缺${state.missing.join('和')}`} onClick={() => tierFrames.onVideo(shot.id)}>
          {state.running ? <LoaderCircle size={14} className="spin" /> : shown ? <RefreshCw size={14} /> : <Clapperboard size={14} />}{shown ? '重新生成' : '生成视频'}</button></div>
      </div> };
  }) : [];
  // Only content changes with job polling; preserve node positions, selection and input DOM.
  useEffect(() => {
    setNodes(previous => {
      const byId = new Map(previous.map(node => [node.id, node]));
      return [...definitions, ...mediaDefinitions, ...tierDefinitions, ...clipDefinitions].map(data => ({ ...byId.get(data.id), id: data.id, type: 'remix', dragHandle: '.remix-node-drag', position: byId.get(data.id)?.position || layout.positions?.[data.id] || data.position, data }));
    });
  }, [project, settings, prompt, disabled, videoId, briefOpen, tierFrames?.open, tierFrames?.openVideo, tierFrames?.frameBusy, tierFrames?.frameFailed, tierFrames?.disabled, tierFrames?.ratioLabel]);
  const edges = useMemo<Edge[]>(() => {
    const link = (source: string, target: string, targetHandle = 'input', sourceHandle = 'output'): Edge => ({
      id: `${source}-${target}`, source, sourceHandle, target, targetHandle,
      type: 'default', markerEnd: { type: MarkerType.ArrowClosed, color: '#a9b6c6', width: 15, height: 15 }, style: { stroke: '#a9b6c6', strokeWidth: 1.5 },
    });
    return [
      link('source', 'analysisAction'), link('analysisAction', 'analysis'),
      { ...link('source', 'mediaAction', 'input', 'media'), type: 'smoothstep' }, link('mediaAction', 'frameInfo'),
      { ...link('analysis', 'correctionAction', 'analysis'), animated: correctionRunning },
      { ...link('frameInfo', 'correctionAction', 'frames'), animated: correctionRunning, style: { stroke: '#8fb3df', strokeWidth: 1.5 } },
      link('correctionAction', 'correction'),
      { ...link('correction', 'promptAction'), animated: promptRunning },
      { ...link('character', 'promptAction', 'character', 'authoring'), type: 'smoothstep', style: { stroke: '#8fb3df', strokeWidth: 1.5 } },
      link('promptAction', 'prompt'),
      { ...link('prompt', 'videoAction', 'prompt'), type: 'generationInput', label: '文字提示词', labelStyle: { fill: '#63816a', fontSize: 11, fontWeight: 500 }, labelBgStyle: { fill: '#f3f7f3' }, animated: job?.status === 'running' && job.kind === 'remix-video', style: { stroke: '#a8b6a4', strokeWidth: 1.7 } },
      { ...link('character', 'videoAction', 'character'), type: 'generationInput', label: '人物参考图 · 1 张', labelStyle: { fill: '#638fca', fontSize: 11, fontWeight: 500 }, labelBgStyle: { fill: '#eef5fd' }, style: { stroke: '#91bdf2', strokeWidth: 1.5 } },
      link('videoAction', 'video'),
      // Gallery rows belong to the single frameInfo collection; no long per-shot edges enter the workflow.
      ...shots.map(shot => link(`shot:${shot.id}`, `frames:${shot.id}`)),
      ...(tierFrames ? shots.map(shot => ({ ...link(`frames:${shot.id}`, `newFrames:${shot.id}`), style: { stroke: '#c2cbd6', strokeWidth: 1.2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#c2cbd6', width: 13, height: 13 } })) : []),
      ...(tierFrames ? shots.map(shot => ({ ...link(`newFrames:${shot.id}`, `clip:${shot.id}`), style: { stroke: '#c2cbd6', strokeWidth: 1.2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#c2cbd6', width: 13, height: 13 } })) : []),
    ];
  }, [shots, correctionRunning, promptRunning, job?.status, job?.kind, !!tierFrames]);
  // Opening a frame pans that shot's evidence frames + new frames to the canvas area left of the drawer.
  const viewportBox = useRef<HTMLDivElement>(null);
  const openShot = tierFrames?.open?.shotId, openClip = tierFrames?.openVideo;
  useEffect(() => {
    const instance = flow.current, box = viewportBox.current?.getBoundingClientRect();
    const target = openShot || openClip;
    if (!target || !instance || !box) return;
    const ids = (openShot ? [`frames:${target}`, `newFrames:${target}`] : [`newFrames:${target}`, `clip:${target}`]).map(id => instance.getNode(id)).filter(node => !!node);
    if (ids.length < 2) return;
    const left = Math.min(...ids.map(n => n.position.x)), top = Math.min(...ids.map(n => n.position.y));
    const right = Math.max(...ids.map(n => n.position.x + (n.measured?.width || 0))), bottom = Math.max(...ids.map(n => n.position.y + (n.measured?.height || 0)));
    const drawer = parseFloat(getComputedStyle(document.querySelector('.tier-drawer') || document.body).width) || 460;
    const visible = Math.max(240, Math.min(box.right, window.innerWidth - drawer) - box.left);
    const zoom = Math.min(.9, (visible - 64) / (right - left), (box.height - 120) / (bottom - top));
    void instance.setViewport({ x: (visible - (right - left) * zoom) / 2 - left * zoom, y: (box.height - (bottom - top) * zoom) / 2 - top * zoom + 20, zoom }, { duration: 300 });
  }, [openShot, openClip]);
  const tierDone = plans.reduce((sum, plan) => sum + plan.frames.filter(frame => frame.result).length, 0), tierTotal = plans.reduce((sum, plan) => sum + plan.frames.length, 0);
  return <section className={`remix-stage${expanded ? ' is-expanded' : ''}`} aria-label="人物与视频二创画布">
    <header className="remix-canvas-header"><div><span className="remix-canvas-mark"><WandSparkles size={17} /></span><div><h2>人物与视频二创</h2><p>素材 / 结果 → 动作 → 结果 · 连线表示数据流</p></div></div><div className="remix-canvas-navigation"><button className="remix-button" onClick={() => focusMedia('')}><Film size={13} />镜头素材</button>{!!shots.length && <select aria-label="定位镜头及关键帧" value={shots.some(shot => shot.id === focusedShot) ? focusedShot : ''} onChange={event => focusMedia(event.target.value)}><option value="">全部镜头</option>{shots.map((shot, index) => <option key={shot.id} value={shot.id}>镜头 {String(index + 1).padStart(2, '0')} · {shot.start.toFixed(1)}–{shot.end.toFixed(1)}s</option>)}</select>}<button className="remix-button" onClick={focusCorrection}><FileText size={13} />校正流程</button><button className="remix-button" onClick={focusRemix}><WandSparkles size={13} />二创流程</button><span className="remix-model-label">Omni Flash · 10s</span><button className="remix-icon-button" title="模型连接" aria-label="模型连接" onClick={onSettings}><Settings2 size={16} /></button><button className="remix-icon-button" title={expanded ? '退出全屏画布' : '全屏画布'} aria-label={expanded ? '退出全屏画布' : '全屏画布'} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button></div></header>
    <div className="remix-canvas-viewport" ref={viewportBox}>{tierFrames && !!shots.length && <div className="remix-tier-bar" role="toolbar" aria-label="新关键帧"><span>档位 <b>{levelInfo(project.replication?.level).label}</b></span><span className="remix-tier-progress" aria-label="已生成关键帧"><i><b style={{ width: `${tierTotal ? tierDone / tierTotal * 100 : 0}%` }} /></i>{tierDone} / {tierTotal}</span><button className="remix-button remix-run" disabled={tierFrames.disabled || tierFrames.frameBusy.length > 0} onClick={() => tierFrames.onGenerateShots(shots.map(shot => shot.id))}>{tierFrames.frameBusy.length ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}生成全部关键帧</button></div>}<ReactFlow<CanvasNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onNodeDragStop={() => persist()} onInit={instance => { flow.current = instance; }} onMoveEnd={(_event, viewport) => { setZoom(Math.round(viewport.zoom * 100)); persist(viewport); }} defaultViewport={layout.viewport} fitView={!layout.viewport} fitViewOptions={{ nodes: correctionFlowIds.map(id => ({ id })), padding: .12, minZoom: .08, maxZoom: .9 }} minZoom={.08} maxZoom={1.8} nodesConnectable={false} edgesReconnectable={false} edgesFocusable={false} deleteKeyCode={null} nodesDraggable={tool === 'select'} panOnDrag={tool === 'hand' ? true : [1, 2]} selectionOnDrag={tool === 'select'} panOnScroll zoomOnScroll={false} zoomOnPinch preventScrolling ariaLabelConfig={{ 'node.a11yDescription.default': '使用方向键移动节点，按 Enter 选中。' }}><Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#d4d9df" /></ReactFlow>
      <div className="remix-canvas-tools" role="toolbar" aria-label="画布工具"><button className={`remix-icon-button ${tool === 'select' ? 'active' : ''}`} title="选择和拖动节点" aria-label="选择工具" aria-pressed={tool === 'select'} onClick={() => setTool('select')}><MousePointer2 size={17} /></button><button className={`remix-icon-button ${tool === 'hand' ? 'active' : ''}`} title="拖动画布" aria-label="平移工具" aria-pressed={tool === 'hand'} onClick={() => setTool('hand')}><Hand size={17} /></button><i /><button className="remix-icon-button" title="缩小画布" aria-label="缩小画布" onClick={() => void flow.current?.zoomOut({ duration: 150 })}><ZoomOut size={16} /></button><button className="remix-zoom" title="重置到 100%" aria-label="重置到百分之百缩放" onClick={() => void flow.current?.zoomTo(1, { duration: 150 })}>{zoom}%</button><button className="remix-icon-button" title="放大画布" aria-label="放大画布" onClick={() => void flow.current?.zoomIn({ duration: 150 })}><ZoomIn size={16} /></button><i /><button className="remix-icon-button" title="适应全部节点" aria-label="适应全部节点" onClick={fit}><LocateFixed size={17} /></button><button className="remix-icon-button" title="整理节点布局" aria-label="整理节点布局" onClick={reset}><RotateCcw size={15} /></button></div>
      <div className="remix-canvas-help">拖动节点标题移动 · 滚动平移 · 双指缩放</div>
    </div>
    <footer className="remix-canvas-footer"><span><Check size={12} />画布布局保存在此设备</span><span>修改要求后点击保存，或直接运行节点</span></footer>
  </section>;
}
