import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, ReactFlow, SelectionMode, useNodesState,
  type Node, type NodeProps, type OnSelectionChangeParams, type ReactFlowInstance, type Viewport,
} from '@xyflow/react';
import {
  AlertTriangle, Clapperboard, Download, Grid2X2, Hand, Info,
  LoaderCircle, LocateFixed, MousePointer2, Play, RefreshCw, RotateCcw, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import type { GeneratedVideo, Project, StoryboardGrid } from '../shared/domain';
import '@xyflow/react/dist/style.css';

const CARD_W = 400;
const CARD_GAP_X = 48;
const CARD_GAP_Y = 36;
const COLS = 2;
const LAYOUT_KEY = (id: string) => `sop-storyboard-grid-canvas-v1:${id}`;

type Layout = { positions?: Record<string, { x: number; y: number }>; viewport?: Viewport };

function readLayout(id: string): Layout {
  try {
    const raw = JSON.parse(localStorage.getItem(LAYOUT_KEY(id)) || '{}');
    const positions: Record<string, { x: number; y: number }> = {};
    for (const [key, point] of Object.entries(raw.positions || {}) as [string, { x?: number; y?: number }][]) {
      if (Number.isFinite(point?.x) && Number.isFinite(point?.y) && Math.abs(point.x!) < 100000 && Math.abs(point.y!) < 100000) {
        positions[key] = { x: point.x!, y: point.y! };
      }
    }
    const view = raw.viewport;
    const viewport = Number.isFinite(view?.x) && Number.isFinite(view?.y) && view.zoom >= .08 && view.zoom <= 1.8
      ? view as Viewport : undefined;
    return { positions, viewport };
  } catch { return {}; }
}

function defaultPosition(index: number) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return { x: 48 + col * (CARD_W + CARD_GAP_X), y: 72 + row * (420 + CARD_GAP_Y) };
}

export function gridVideoState(project: Project, grid: StoryboardGrid) {
  const versions = project.generatedVideos.filter(video => (video.storyboardGridId || video.gridId) === grid.id);
  const latest = versions.at(-1);
  const completed = versions.filter(video => video.status === 'completed' && video.url);
  const running = latest?.status === 'running' && project.job?.kind === 'generation' && project.job.status === 'running'
    && (project.job.unitId === `storyboard-grid-${grid.id}` || project.job.videoId === latest.id);
  const failed = latest?.status === 'failed' || (latest?.status === 'running' && !running);
  return {
    versions, latest, completed, running, failed,
    error: failed ? latest?.error || '上次生成没有完成' : '',
    progress: running ? project.job?.progress : undefined,
    prompt: grid.prompt,
    duration: Math.min(8, Math.max(0, grid.end - grid.start)),
  };
}

type StatusKind = 'idle' | 'run' | 'ok' | 'fail';

function statusOf(state: ReturnType<typeof gridVideoState>): { kind: StatusKind; label: string } {
  if (state.running) return { kind: 'run', label: state.progress != null ? `生成中 ${state.progress}%` : '生成中' };
  if (state.completed.length) return { kind: 'ok', label: '已生成' };
  if (state.failed) return { kind: 'fail', label: '失败' };
  return { kind: 'idle', label: '待生成' };
}

type CardData = {
  grid: StoryboardGrid;
  index: number;
  project: Project;
  disabled: boolean;
  onPrompt: (id: string, prompt: string) => void;
  onGenerate: (gridId: string) => void;
  onIncluded: (id: string, included: boolean) => void;
};

type CardNode = Node<CardData, 'storyboardGridCard'>;

function InternalGuide() {
  return <div className="sg-iguide" aria-hidden="true">
    <svg viewBox="0 0 80 28" width="80" height="28">
      <path d="M40 1 v17.5" />
      <path className="arr" d="M31.5 13.5 L40 23 L48.5 13.5" />
    </svg>
  </div>;
}

const StoryboardGridCardNode = memo(function StoryboardGridCardNode({ data, selected }: NodeProps<CardNode>) {
  const { grid, index, project, disabled, onPrompt, onGenerate, onIncluded } = data;
  const state = useMemo(() => gridVideoState(project, grid), [project, grid]);
  const status = statusOf(state);
  const [picked, setPicked] = useState<string | null>(null);
  const shown = state.completed.find(video => video.id === picked) || state.completed.at(-1);
  const label = `分镜网格 ${String(index + 1).padStart(2, '0')}`;
  const meta = `${grid.gridSize}×${grid.gridSize} · ${grid.start.toFixed(2)}–${grid.end.toFixed(2)}s · 目标 ${state.duration.toFixed(0)}s`;
  const included = grid.included !== false;
  const canGenerate = !disabled && !state.running && !!state.prompt.trim();

  return <article className={`sg-card${selected ? ' is-selected' : ''}${state.running ? ' is-running' : ''}${status.kind === 'fail' ? ' is-failed' : ''}`}>
    <header className="sg-card-hd sg-card-drag">
      <label className="sg-cb nodrag" title="纳入生成">
        <input type="checkbox" checked={included} disabled={disabled || state.running}
          onChange={event => onIncluded(grid.id, event.target.checked)}
          aria-label={`纳入${label}`} />
      </label>
      <span className="sg-card-ttl">{label}</span>
      <span className="sg-card-meta mono">{meta}</span>
      <span className={`sg-chip sg-chip--${status.kind}`}>{status.label}</span>
      <button type="button" className={`sg-btn-gen nodrag${state.completed.length || state.running ? ' is-ghost' : ''}${state.running ? ' is-dim' : ''}`}
        disabled={!canGenerate} onClick={() => onGenerate(grid.id)}>
        {state.running ? <LoaderCircle size={13} className="spin" /> : state.completed.length ? <RefreshCw size={13} /> : <Clapperboard size={13} />}
        {state.running ? '生成中…' : state.completed.length ? '重新生成' : '生成视频'}
      </button>
    </header>

    <div className="sg-card-mid">
      <a className="sg-thumb nodrag" href={grid.url} target="_blank" rel="noreferrer" title="打开网格图">
        <img src={grid.url} alt={label} draggable={false} />
        <span className="sg-thumb-badge mono">{grid.gridSize}×{grid.gridSize}</span>
      </a>
      <label className="sg-prompt nodrag nowheel">
        <span>视频 Prompt</span>
        <textarea rows={5} value={grid.prompt} disabled={disabled || state.running}
          onChange={event => onPrompt(grid.id, event.target.value)}
          onPointerDown={event => event.stopPropagation()} />
      </label>
    </div>

    <InternalGuide />

    {state.running && !shown ? <div className="sg-result is-loading">
      <div className="sg-shimmer" />
      <span className="sg-result-lab">视频结果</span>
      <p className="sg-result-msg">正在生成视频{state.progress != null ? ` · ${state.progress}%` : '…'}</p>
      <div className="sg-result-bar"><i style={{ width: `${Math.max(8, state.progress || 28)}%` }} /></div>
    </div>
      : shown ? <div className={`sg-result${state.running ? ' is-loading' : ''}`}>
        <span className="sg-result-lab">视频结果</span>
        <div className="sg-vres nodrag nowheel">
          <div className="sg-vthumb">
            <video key={shown.id} src={shown.url} poster={shown.thumbnail} controls playsInline preload="metadata" />
            <span className="sg-vdu mono">{formatDuration(shown.duration)}</span>
          </div>
          <div className="sg-vmeta">
            <div className="sg-vn">{state.running ? '新版本生成中…' : `已就绪 · v${state.completed.indexOf(shown) + 1}`}</div>
            <div className="sg-vs">时长 {(shown.duration || 0).toFixed(1)}s · {shown.mode || 'r2v'}</div>
            <div className="sg-vers">
              {state.completed.map((video, i) => <button type="button" key={video.id}
                className={video.id === shown.id ? 'on' : ''}
                onClick={() => setPicked(video.id)}>v{i + 1}</button>)}
              <a className="sg-dl" href={shown.url} download title="下载"><Download size={12} /></a>
            </div>
          </div>
        </div>
        {state.failed && <p className="sg-err"><AlertTriangle size={12} />{state.error}</p>}
      </div>
        : <div className={`sg-result is-empty${state.failed ? ' is-failed' : ''}`}>
          {state.failed
            ? <><AlertTriangle size={15} /><span>{state.error || '生成失败'}</span></>
            : <><Play size={15} strokeWidth={1.6} /><span>还没有视频结果</span></>}
        </div>}
  </article>;
});

function formatDuration(seconds?: number) {
  const total = Math.max(0, Math.round(seconds || 0));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const nodeTypes = { storyboardGridCard: StoryboardGridCardNode };

function StoryboardGridCanvas({ project, disabled, onPrompt, onGenerate, onIncluded }: {
  project: Project; disabled: boolean;
  onPrompt: (id: string, prompt: string) => void;
  onGenerate: (gridId: string) => void;
  onIncluded: (id: string, included: boolean) => void;
}) {
  const allGrids = project.storyboardGrids || [];
  const grids = useMemo(() => allGrids.filter(grid => grid.included !== false), [allGrids]);
  const gridIdsKey = grids.map(grid => grid.id).join('|');
  const hiddenCount = allGrids.length - grids.length;
  const [layout] = useState(() => readLayout(project.id));
  const [nodes, setNodes, onNodesChange] = useNodesState<CardNode>([]);
  const [zoom, setZoom] = useState(Math.round((layout.viewport?.zoom || 1) * 100));
  const [tool, setTool] = useState<'select' | 'hand'>('select');
  const [whisper, setWhisper] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const flow = useRef<ReactFlowInstance<CardNode>>(null);
  const defaults = useRef(layout);
  const handlers = useRef({ onPrompt, onGenerate, onIncluded });
  handlers.current = { onPrompt, onGenerate, onIncluded };

  useEffect(() => { defaults.current = readLayout(project.id); }, [project.id]);

  const persist = useCallback((viewport?: Viewport) => {
    try {
      const current = flow.current?.getNodes() || [];
      localStorage.setItem(LAYOUT_KEY(project.id), JSON.stringify({
        positions: Object.fromEntries(current.map(node => [node.id, node.position])),
        viewport: viewport || flow.current?.getViewport(),
      }));
    } catch { /* ignore quota */ }
  }, [project.id]);

  useEffect(() => {
    const callPrompt = (id: string, prompt: string) => handlers.current.onPrompt(id, prompt);
    const callGenerate = (gridId: string) => handlers.current.onGenerate(gridId);
    const callIncluded = (id: string, included: boolean) => handlers.current.onIncluded(id, included);
    setNodes(previous => {
      const byId = new Map(previous.map(node => [node.id, node]));
      const saved = defaults.current.positions || {};
      return grids.map((grid, order) => {
        const index = allGrids.findIndex(item => item.id === grid.id);
        const id = grid.id;
        const position = byId.get(id)?.position || saved[id] || defaultPosition(order);
        const data: CardData = {
          grid, index: index < 0 ? order : index, project, disabled,
          onPrompt: callPrompt, onGenerate: callGenerate, onIncluded: callIncluded,
        };
        const prior = byId.get(id);
        return {
          id, type: 'storyboardGridCard' as const, dragHandle: '.sg-card-drag',
          position, data, selected: prior?.selected,
        };
      });
    });
  }, [project, gridIdsKey, disabled, setNodes, grids, allGrids]);

  const fit = () => { void flow.current?.fitView({ padding: .14, maxZoom: 1, duration: 180 }); };

  const resetLayout = () => {
    setNodes(previous => previous.map((node, order) => ({
      ...node,
      position: defaultPosition(grids.findIndex(grid => grid.id === node.id) >= 0
        ? grids.findIndex(grid => grid.id === node.id) : order),
    })));
    try { localStorage.removeItem(LAYOUT_KEY(project.id)); } catch { /* */ }
    defaults.current = {};
    window.requestAnimationFrame(fit);
  };

  const onSelectionChange = useCallback(({ nodes: selected }: OnSelectionChangeParams<CardNode>) => {
    setSelectedIds(selected.map(node => node.id));
  }, []);

  const selectedEligible = useMemo(() => selectedIds.filter(id => {
    const grid = grids.find(item => item.id === id);
    if (!grid || !grid.prompt.trim()) return false;
    const state = gridVideoState(project, grid);
    return !state.running;
  }), [selectedIds, grids, project]);

  const allEligible = useMemo(() => grids.filter(grid => {
    if (!grid.prompt.trim()) return false;
    return !gridVideoState(project, grid).running;
  }), [grids, project]);

  const generateSelected = () => { selectedEligible.forEach(id => onGenerate(id)); };
  const generateAll = () => { allEligible.forEach(grid => onGenerate(grid.id)); };

  if (!allGrids.length) {
    return <section className="sg-stage" aria-label="分镜网格视频">
      <div className="sg-empty"><Grid2X2 size={38} strokeWidth={1.2} /><h3>还没有分镜网格</h3><p>请先回到上一步生成分镜网格，再进入视频生成。</p></div>
    </section>;
  }

  return <section className="sg-stage" aria-label="分镜网格视频画布">
    <header className="sg-cv-bar">
      <div className="sg-cv-bar-lead">
        <span className="sg-cv-mark" aria-hidden="true"><Grid2X2 size={17} /></span>
        <div>
          <h2>分镜网格视频生成</h2>
          <p className="sg-cv-sub">已放入 <em>{grids.length}</em> 个分镜{hiddenCount > 0 ? <> · 已隐藏 {hiddenCount} 个未勾选</> : null} · 每格 ≤8 秒 · r2v</p>
        </div>
      </div>
      <div className="sg-cv-actions">
        <button type="button" className="sg-bar-btn is-run" disabled={disabled || !allEligible.length} onClick={generateAll}>
          <Clapperboard size={13} /><span>生成全部（已勾选可见）</span>
        </button>
      </div>
    </header>

    <div className="sg-viewport">
      <ReactFlow<CardNode>
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={() => persist()}
        onSelectionChange={onSelectionChange}
        onInit={instance => { flow.current = instance; }}
        onMoveEnd={(_event, viewport) => { setZoom(Math.round(viewport.zoom * 100)); persist(viewport); }}
        onMoveStart={() => setWhisper(false)}
        onNodeDragStart={() => setWhisper(false)}
        defaultViewport={layout.viewport}
        fitView={!layout.viewport}
        fitViewOptions={{ padding: .14, maxZoom: 1 }}
        minZoom={.08}
        maxZoom={1.8}
        nodesConnectable={false}
        edgesFocusable={false}
        elementsSelectable
        deleteKeyCode={null}
        selectionMode={SelectionMode.Partial}
        nodesDraggable={tool === 'select'}
        panOnDrag={tool === 'hand' ? true : [1, 2]}
        selectionOnDrag={tool === 'select'}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        preventScrolling
        colorMode="light"
        proOptions={{ hideAttribution: true }}
        ariaLabelConfig={{ 'node.a11yDescription.default': '使用方向键移动卡片，按 Enter 选中。' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#d4d9df" />
      </ReactFlow>


      {selectedIds.length >= 2 && <div className="sg-batch" role="toolbar" aria-label="批量生成">
        <span>{selectedIds.length} 个分镜已选</span>
        <button type="button" className="sg-btn-gen" disabled={disabled || !selectedEligible.length}
          onClick={generateSelected}>
          <Clapperboard size={13} />生成所选 {selectedEligible.length || selectedIds.length}
        </button>
        <button type="button" className="sg-batch-x" aria-label="清除选择"
          onClick={() => {
            setSelectedIds([]);
            setNodes(previous => previous.map(node => ({ ...node, selected: false })));
          }}>
          <X size={14} />
        </button>
      </div>}

      {whisper && <div className="sg-whisper">拖动卡片 · 滚动平移 · 双指缩放</div>}

      <div className="sg-tools" role="toolbar" aria-label="画布工具">
        <button type="button" className={`sg-tool${tool === 'select' ? ' on' : ''}`} title="选择和框选"
          aria-label="选择工具" aria-pressed={tool === 'select'} onClick={() => setTool('select')}>
          <MousePointer2 size={17} />
        </button>
        <button type="button" className={`sg-tool${tool === 'hand' ? ' on' : ''}`} title="拖动画布"
          aria-label="平移工具" aria-pressed={tool === 'hand'} onClick={() => setTool('hand')}>
          <Hand size={17} />
        </button>
        <i />
        <button type="button" className="sg-tool" title="缩小画布" aria-label="缩小画布"
          onClick={() => void flow.current?.zoomOut({ duration: 150 })}><ZoomOut size={16} /></button>
        <button type="button" className="sg-pct" title="重置到 100%" aria-label="重置到百分之百缩放"
          onClick={() => void flow.current?.zoomTo(1, { duration: 150 })}>{zoom}%</button>
        <button type="button" className="sg-tool" title="放大画布" aria-label="放大画布"
          onClick={() => void flow.current?.zoomIn({ duration: 150 })}><ZoomIn size={16} /></button>
        <i />
        <button type="button" className="sg-tool" title="适应全部节点" aria-label="适应全部节点" onClick={fit}>
          <LocateFixed size={17} />
        </button>
        <button type="button" className="sg-tool" title="整理布局" aria-label="整理布局" onClick={resetLayout}>
          <RotateCcw size={15} />
        </button>
      </div>
    </div>

  </section>;
}

function GridVideoCard({ project, grid, index, disabled, onPrompt, onGenerate, onIncluded }: {
  project: Project; grid: StoryboardGrid; index: number; disabled: boolean;
  onPrompt: (id: string, prompt: string) => void; onGenerate: (gridId: string) => void;
  onIncluded: (id: string, included: boolean) => void;
}) {
  const state = useMemo(() => gridVideoState(project, grid), [project, grid]);
  const [picked, setPicked] = useState<string | null>(null);
  const shown = state.completed.find(video => video.id === picked) || state.completed.at(-1);
  const label = `分镜网格 ${String(index + 1).padStart(2, '0')}`;
  const spanLabel = `${grid.start.toFixed(2)}–${grid.end.toFixed(2)} 秒 · 目标 ${state.duration.toFixed(2)}s`;
  const included = grid.included !== false;

  return <article className="storyboard-grid-card storyboard-grid-video-card">
    <header>
      <div className="storyboard-grid-card-title">
        <label className="storyboard-grid-include">
          <input type="checkbox" checked={included} disabled={disabled || state.running}
            onChange={event => onIncluded(grid.id, event.target.checked)}
            aria-label={`纳入${label}`} />
        </label>
        <div><span><Grid2X2 size={15} />{label}</span><strong>{grid.gridSize}×{grid.gridSize} · {spanLabel}</strong></div>
      </div>
      <div className="storyboard-grid-actions">
        <button type="button" className="btn small primary" disabled={disabled || state.running || !state.prompt.trim()}
          onClick={() => onGenerate(grid.id)}>
          {state.running ? <LoaderCircle size={14} className="spin" /> : state.completed.length ? <RefreshCw size={14} /> : <Clapperboard size={14} />}
          {state.running ? `生成中${state.progress ? ` ${state.progress}%` : ''}` : state.completed.length ? '重新生成' : '生成视频'}
        </button>
      </div>
    </header>
    <div className="storyboard-grid-body storyboard-grid-video-body">
      <a className="storyboard-grid-image" href={grid.url} target="_blank" rel="noreferrer"><img src={grid.url} alt={label} /></a>
      <div className="storyboard-grid-video-side">
        <label><span>视频生成 Prompt</span>
          <textarea className="input" rows={14} value={grid.prompt} disabled={disabled || state.running}
            onChange={event => onPrompt(grid.id, event.target.value)} />
        </label>
        <div className={`storyboard-grid-video-preview${state.running ? ' is-loading' : ''}`}>
          {shown ? <video key={shown.id} src={shown.url} poster={shown.thumbnail} controls playsInline preload="metadata" />
            : <span className="storyboard-grid-video-empty">
              {state.running ? <><LoaderCircle size={18} className="spin" />生成中{state.progress ? ` ${state.progress}%` : ''}</>
                : state.failed ? <><AlertTriangle size={16} />{state.error}</>
                  : '还没有视频结果'}
            </span>}
        </div>
        {shown && <div className="storyboard-grid-video-meta">
          {state.completed.length > 1 ? <select className="input" value={shown.id} aria-label="视频版本" onChange={event => setPicked(event.target.value)}>
            {state.completed.map((video, i) => <option key={video.id} value={video.id}>版本 {i + 1}</option>)}
          </select> : <span>版本 {state.completed.indexOf(shown) + 1}</span>}
          <span>{(shown.duration || 0).toFixed(1)}s · {shown.mode || 'r2v'}</span>
          <a className="btn small" href={shown.url} download><Download size={13} />下载</a>
        </div>}
        {state.failed && shown && <p className="storyboard-grid-video-error">{state.error}</p>}
        {state.running && shown && <p className="storyboard-grid-video-note"><LoaderCircle size={13} className="spin" />新版本生成中…</p>}
      </div>
    </div>
  </article>;
}

export default function StoryboardGridWorkbench({ project, disabled, onPrompt, onGenerate, onIncluded, canvas = false }: {
  project: Project;
  disabled: boolean;
  onPrompt: (id: string, prompt: string) => void;
  onGenerate: (gridId: string) => void;
  onIncluded: (id: string, included: boolean) => void;
  canvas?: boolean;
}) {
  if (canvas) {
    return <StoryboardGridCanvas project={project} disabled={disabled}
      onPrompt={onPrompt} onGenerate={onGenerate} onIncluded={onIncluded} />;
  }

  const allGrids = project.storyboardGrids || [];
  const grids = allGrids.filter(grid => grid.included !== false);
  if (!allGrids.length) {
    return <section className="panel storyboard-grid-workbench" aria-label="分镜网格视频">
      <div className="empty-state"><Grid2X2 size={38} strokeWidth={1.2} /><h3>还没有分镜网格</h3><p>请先回到上一步生成分镜网格，再进入视频生成。</p></div>
    </section>;
  }

  return <section className="panel storyboard-grid-workbench" aria-label="分镜网格视频">
    <div className="panel-heading">
      <div><Grid2X2 size={18} /><h2>分镜网格视频生成</h2><span className="badge-inline">{grids.length} 张网格 · 每格 ≤8 秒 · r2v</span></div>
    </div>
    <div className="storyboard-grid-intro"><Info size={15} /><p>每张分镜网格作为一张参考图，配合可编辑 Prompt 直接生成一段视频。不经过逐镜头关键帧与主体设定卡。</p></div>
    <div className="storyboard-grid-results">
      {grids.map(grid => {
        const index = allGrids.findIndex(item => item.id === grid.id);
        return <GridVideoCard key={grid.id} project={project} grid={grid} index={index} disabled={disabled}
          onPrompt={onPrompt} onGenerate={onGenerate} onIncluded={onIncluded} />;
      })}
    </div>
  </section>;
}

export function latestGridVideo(project: Project, gridId: string): GeneratedVideo | undefined {
  return [...project.generatedVideos].reverse().find(video => (video.storyboardGridId || video.gridId) === gridId);
}
