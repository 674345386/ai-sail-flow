import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Background, BackgroundVariant, Handle, MarkerType, MiniMap, Position, ReactFlow, SelectionMode, useNodesState,
  type Edge, type MiniMapNodeProps, type Node, type NodeProps, type OnSelectionChangeParams, type ReactFlowInstance, type Viewport,
} from '@xyflow/react';
import {
  Clapperboard, Hand, LoaderCircle, LocateFixed,
  MousePointer2, RotateCcw, Settings2, Sparkles, Upload, WandSparkles, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import type { Project, Shot, StoryboardGrid } from '../shared/domain';
import { StoryboardGridCardBody, gridVideoState } from './StoryboardGridWorkbench';
import '@xyflow/react/dist/style.css';
import './product-pipeline.css';

const LAYOUT_KEY = (id: string) => `sop-pipeline-canvas-v1:${id}`;
const WIRE = '#9bb0c8';
const COL = { assets: 40, breakdown: 420, remix: 820 } as const;
const CARD_GAP_Y = 28;
const GRID_ROW_STEP = 280 + CARD_GAP_Y;
const emptyGrids: StoryboardGrid[] = [];
const emptyShots: Shot[] = [];

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

type PipeKind = 'assetVideo' | 'breakdown' | 'gridCard' | 'shotCard' | 'videoResult' | 'label';

type PipeData = {
  kind: PipeKind;
  title: string;
  status: string;
  ready: boolean;
  content: ReactNode;
  drag?: boolean;
};

type PipeNode = Node<PipeData, 'pipeline'>;

const PipelineNode = memo(function PipelineNode({ id, data, selected }: NodeProps<PipeNode>) {
  const isLabel = data.kind === 'label';
  const isGrid = data.kind === 'gridCard';
  const showOut = data.kind === 'assetVideo' || data.kind === 'breakdown';
  const showIn = data.kind === 'breakdown' || data.kind === 'gridCard' || data.kind === 'shotCard' || data.kind === 'videoResult';
  const showVideoOut = data.kind === 'gridCard';
  if (isLabel) {
    return <div className="pp-stage-label" aria-hidden="true"><span className="pp-stage-n">{id.replace('label-', '')}</span>{data.title}<span className="pp-stage-hint">{data.status}</span></div>;
  }
  return <article className={`pp-node pp-node--${data.kind}${selected ? ' is-selected' : ''}${data.ready ? ' is-ready' : ''}`}>
    {showIn && <Handle type="target" id="in" position={Position.Left} className="pp-port" />}
    {!isGrid && <header className="pp-node-drag">
      <span>{data.title}</span>
      <span className={`pp-chip${data.ready ? ' ok' : ''}`}>{data.status}</span>
    </header>}
    <div className={`pp-node-body${!isGrid ? ' nodrag nowheel nopan' : ''}`}>{data.content}</div>
    {showVideoOut && <Handle type="source" id="video-out" position={Position.Right} className="pp-port pp-port--video" />}
    {showOut && <Handle type="source" id="out" position={Position.Right} className="pp-port" />}
  </article>;
});

const nodeTypes = { pipeline: PipelineNode };

function MiniMapOverviewNode({ id, x, y, width, height, color, strokeColor, strokeWidth, selected, onClick }: MiniMapNodeProps) {
  // Give tiny off-screen nodes a readable footprint while retaining their map positions.
  const mapWidth = Math.max(width, 5);
  const mapHeight = Math.max(height, 4);
  return <rect
    className={`react-flow__minimap-node${selected ? ' selected' : ''}`}
    x={x - (mapWidth - width) / 2}
    y={y - (mapHeight - height) / 2}
    width={mapWidth}
    height={mapHeight}
    rx={1.5}
    fill={color || '#d5d5d5'}
    stroke={selected ? '#555' : strokeColor || '#a9a9a9'}
    strokeWidth={strokeWidth || .6}
    onClick={onClick ? event => onClick(event, id) : undefined}
  />;
}


function formatDur(seconds?: number) {
  const total = Math.max(0, Math.round(seconds || 0));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export default function ProductPipelineCanvas({
  project, disabled, onPrompt, onGenerate, onIncluded, onUploadVideo,
  onAnalyze, onOpenMaterials, onOpenAnalysis, onOpenRemixDetail, onSettings, focusStep, focusVersion,
}: {
  project: Project; disabled: boolean;
  onPrompt: (id: string, prompt: string) => void;
  onGenerate: (gridId: string) => void;
  onIncluded: (id: string, included: boolean) => void;
  onUploadVideo: () => void;
  onAnalyze: () => void; onOpenMaterials: () => void; onOpenAnalysis: () => void;
  onOpenRemixDetail?: () => void; onSettings: () => void;
  focusStep: number; focusVersion: number;
}) {
  const isGrid = project.breakdownType === 'storyboard-grid';
  const video = useMemo(() => project.assets.find(asset => asset.kind === 'video'), [project.assets]);
  const allGrids = project.storyboardGrids || emptyGrids;
  const includedGrids = useMemo(() => allGrids.filter(grid => grid.included !== false), [allGrids]);
  const shots = project.analysis?.shots || emptyShots;
  const excludedShots = project.analysis?.excludedShots || emptyShots;
  const includedShots = shots; // active analysis.shots are the included set

  const [layout] = useState(() => readLayout(project.id));
  const defaults = useRef(layout);
  const [nodes, setNodes, onNodesChange] = useNodesState<PipeNode>([]);
  const [zoom, setZoom] = useState(Math.round((layout.viewport?.zoom || 1) * 100));
  const [tool, setTool] = useState<'select' | 'hand'>('select');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [whisper, setWhisper] = useState(true);
  const [viewMode, setViewMode] = useState<'pipeline' | 'grids'>('pipeline');
  const flow = useRef<ReactFlowInstance<PipeNode>>(null);
  const handlers = useRef({ onPrompt, onGenerate, onIncluded });
  handlers.current = { onPrompt, onGenerate, onIncluded };
  const actions = useRef({ onUploadVideo, onAnalyze, onOpenAnalysis, onOpenRemixDetail });
  actions.current = { onUploadVideo, onAnalyze, onOpenAnalysis, onOpenRemixDetail };

  useEffect(() => { defaults.current = readLayout(project.id); }, [project.id]);

  const persist = useCallback((viewport?: Viewport) => {
    try {
      const current = flow.current?.getNodes() || [];
      localStorage.setItem(LAYOUT_KEY(project.id), JSON.stringify({
        positions: Object.fromEntries(current.filter(n => n.data.kind !== 'label').map(n => [n.id, n.position])),
        viewport: viewport || flow.current?.getViewport(),
      }));
    } catch { /* */ }
  }, [project.id]);

  const analysisRunning = !!project.job?.kind.startsWith('analysis') && project.job.status === 'running';
  const analysisFailed = !!project.job?.kind.startsWith('analysis') && project.job.status === 'failed';
  const analysisReady = !!project.analysis && !analysisRunning;

  useEffect(() => {
    const callPrompt = (id: string, prompt: string) => handlers.current.onPrompt(id, prompt);
    const callGenerate = (id: string) => handlers.current.onGenerate(id);
    const callIncluded = (id: string, included: boolean) => handlers.current.onIncluded(id, included);
    const saved = defaults.current.positions || {};

    const assetNodes: Array<PipeData & { id: string; position: { x: number; y: number } }> = [];
    assetNodes.push({
      id: 'asset-video', kind: 'assetVideo', title: '参考视频',
      status: video ? '已上传' : '待上传', ready: !!video,
      position: saved['asset-video'] || { x: COL.assets, y: 72 },
      content: video
        ? <div className="pp-media"><video src={video.url} poster={video.thumbnail} muted playsInline preload="metadata" /><div className="pp-media-meta"><strong title={video.name}>{video.name}</strong><span>{formatDur(video.duration)} · {video.width && video.height ? `${video.width}×${video.height}` : '视频'}</span></div><button type="button" className="pp-btn" disabled={disabled} onClick={() => actions.current.onUploadVideo()}>更换视频</button></div>
        : <button type="button" className="pp-empty" disabled={disabled} onClick={() => actions.current.onUploadVideo()}><Upload size={22} /><strong>上传参考视频</strong><span>MP4 / MOV · 作为流水线输入</span></button>,
    });


    const breakdownRows = isGrid
      ? allGrids.map((grid, index) => {
        const included = grid.included !== false;
        return <button type="button" key={grid.id} className={`pp-shot-row${included ? '' : ' is-off'}`} disabled={focusStep < 1} onClick={() => actions.current.onOpenAnalysis()}>
          <img src={grid.url} alt="" /><span><b>网格 {String(index + 1).padStart(2, '0')}</b><small>{grid.start.toFixed(1)}–{grid.end.toFixed(1)}s · {grid.gridSize}×{grid.gridSize}</small></span><em>{included ? '纳入' : '隐藏'}</em>
        </button>;
      })
      : [...shots.map(shot => ({ shot, included: true })), ...excludedShots.map(shot => ({ shot, included: false }))]
        .sort((a, b) => a.shot.start - b.shot.start)
        .map(({ shot, included }, index) => (
          <button type="button" key={shot.id} className={`pp-shot-row${included ? '' : ' is-off'}`} disabled={focusStep < 1} onClick={() => actions.current.onOpenAnalysis()}>
            <span className="pp-shot-idx">{String(index + 1).padStart(2, '0')}</span>
            <span><b>镜头 {String(index + 1).padStart(2, '0')}</b><small>{shot.start.toFixed(1)}–{shot.end.toFixed(1)}s</small></span>
            <em>{included ? '纳入' : '隐藏'}</em>
          </button>
        ));

    const breakdownNode = {
      id: 'breakdown', kind: 'breakdown' as const, title: '拆解摘要',
      status: analysisRunning ? '拆解中' : analysisFailed ? '拆解失败' : analysisReady ? '已完成' : '待拆解', ready: analysisReady && !analysisFailed,
      position: saved.breakdown || { x: COL.breakdown, y: 100 },
      content: <div className="pp-breakdown">
        <p className="pp-breakdown-sum">{analysisReady
          ? (isGrid ? `${allGrids.length} 张分镜网格 · ${includedGrids.length} 张纳入二创` : `${shots.length} 个镜头 · ${includedShots.length} 个纳入`)
          : '完成拆解后，摘要会汇总到这里，并连线到右侧每张已勾选卡。'}</p>
        <div className="pp-shot-list">{breakdownRows.length ? breakdownRows : <span className="pp-muted">还没有拆解结果</span>}</div>
        {(analysisRunning || analysisFailed) && <p className={analysisFailed ? 'pp-job-error' : 'pp-muted'} role={analysisFailed ? 'alert' : 'status'}>{project.job?.message}</p>}
        <div className="pp-node-actions">
          <button type="button" className="pp-btn pp-run" disabled={disabled || !video || focusStep < 1} onClick={() => actions.current.onAnalyze()}>
            {analysisRunning ? <LoaderCircle size={13} className="spin" /> : <Sparkles size={13} />}
            {project.analysis ? '重新拆解' : '开始拆解'}
          </button>
          <button type="button" className="pp-btn" disabled={focusStep < 1} onClick={() => actions.current.onOpenAnalysis()}>查看与编辑</button>
        </div>
      </div>,
    };

    const remixUnits: { id: string; position: { x: number; y: number }; data: PipeData }[] = [];
    if (isGrid) {
      includedGrids.forEach((grid, order) => {
        const index = allGrids.findIndex(item => item.id === grid.id);
        const id = `grid:${grid.id}`;
        remixUnits.push({
          id,
          position: saved[id] || { x: COL.remix, y: 56 + order * GRID_ROW_STEP },
          data: {
            kind: 'gridCard', title: `分镜网格 ${String((index < 0 ? order : index) + 1).padStart(2, '0')}`,
            status: 'card', ready: true,
            content: <StoryboardGridCardBody
              grid={grid} index={index < 0 ? order : index} project={project} disabled={disabled || focusStep < 2}
              onPrompt={callPrompt} onGenerate={callGenerate} onIncluded={callIncluded}
              className="is-pipeline" externalVideoResult
            />,
          },
        });
      });
    } else {
      includedShots.forEach((shot, order) => {
        const index = shots.findIndex(item => item.id === shot.id);
        const id = `shot:${shot.id}`;
        remixUnits.push({
          id,
          position: saved[id] || { x: COL.remix, y: 56 + order * 160 },
          data: {
            kind: 'shotCard', title: `镜头 ${String(index + 1).padStart(2, '0')}`,
            status: `${(shot.end - shot.start).toFixed(1)}s`, ready: true,
            content: <div className="pp-shot-card">
              <p>{shot.action || shot.visual || '镜头描述'}</p>
              <small>{shot.start.toFixed(2)}–{shot.end.toFixed(2)}s</small>
              {onOpenRemixDetail && <button type="button" className="pp-btn" disabled={focusStep < 2} onClick={() => actions.current.onOpenRemixDetail?.()}>打开二创流程</button>}
            </div>,
          },
        });
      });
    }

    const labels: PipeNode[] = [
      { id: 'label-1', type: 'pipeline', position: { x: COL.assets, y: 18 }, data: { kind: 'label', title: '上传素材', status: '参考视频', ready: true, content: null }, selectable: false, draggable: false },
      { id: 'label-2', type: 'pipeline', position: { x: COL.breakdown, y: 18 }, data: { kind: 'label', title: '视频拆解', status: isGrid ? '网格摘要' : '镜头摘要', ready: true, content: null }, selectable: false, draggable: false },
      { id: 'label-3', type: 'pipeline', position: { x: COL.remix, y: 18 }, data: { kind: 'label', title: '二创 / 出片', status: isGrid ? '每张已勾选宫格' : '已勾选镜头', ready: true, content: null }, selectable: false, draggable: false },
    ];

    const activeGridResults = isGrid ? includedGrids.flatMap((grid, order) => {
      const state = gridVideoState(project, grid);
      if (!state.versions.length) return [];
      const gridId = `grid:${grid.id}`;
      const gridPosition = saved[gridId] || remixUnits.find(unit => unit.id === gridId)?.position || { x: COL.remix, y: 56 + order * GRID_ROW_STEP };
      const latest = state.completed.at(-1);
      const title = state.running ? '待生成的视频' : latest ? '生成的视频' : '视频生成结果';
      const status = state.running ? (state.progress != null ? `生成中 ${state.progress}%` : '生成中') : state.failed ? '生成失败' : '已完成';
      const content = state.running
        ? <div className="pp-video-output is-loading" role="status"><div className="pp-video-loading"><LoaderCircle size={20} className="spin" /><strong>{state.progress != null ? `正在生成视频 · ${state.progress}%` : '正在生成视频…'}</strong><div className="pp-video-progress"><i style={{ width: `${Math.max(8, state.progress || 24)}%` }} /></div></div></div>
        : latest
          ? <div className="pp-video-output"><video key={latest.id} src={latest.url} poster={latest.thumbnail} controls playsInline preload="metadata" /><div className="pp-video-meta"><strong>{latest.filename || '生成视频'}</strong><span>{(latest.duration || 0).toFixed(1)} 秒 · {latest.mode || 'r2v'}</span></div></div>
          : <div className="pp-video-output is-failed"><span>{state.error || '视频生成失败'}</span></div>;
      return [{
        id: `video-result:${grid.id}`, type: 'pipeline' as const, dragHandle: '.pp-node-drag',
        position: saved[`video-result:${grid.id}`] || { x: gridPosition.x + 470, y: gridPosition.y },
        data: { kind: 'videoResult' as const, title, status, ready: !!latest && !state.running, content },
      }];
    }) : [];

    setNodes(previous => {
      const byId = new Map(previous.map(node => [node.id, node]));
      const built: PipeNode[] = [
        ...labels,
        ...assetNodes.map(item => ({
          id: item.id, type: 'pipeline' as const, dragHandle: '.pp-node-drag',
          position: byId.get(item.id)?.position || item.position,
          data: { kind: item.kind, title: item.title, status: item.status, ready: item.ready, content: item.content },
          selected: byId.get(item.id)?.selected,
        })),
        {
          id: breakdownNode.id, type: 'pipeline', dragHandle: '.pp-node-drag',
          position: byId.get('breakdown')?.position || breakdownNode.position,
          data: { kind: breakdownNode.kind, title: breakdownNode.title, status: breakdownNode.status, ready: breakdownNode.ready, content: breakdownNode.content },
          selected: byId.get('breakdown')?.selected,
        },
        ...remixUnits.map(unit => ({
          id: unit.id, type: 'pipeline' as const,
          dragHandle: unit.data.kind === 'gridCard' ? '.sg-card-drag' : '.pp-node-drag',
          position: byId.get(unit.id)?.position || unit.position,
          data: unit.data,
          selected: byId.get(unit.id)?.selected,
        })),
        ...activeGridResults.map(unit => ({
          ...unit,
          position: byId.get(unit.id)?.position || unit.position,
          selected: byId.get(unit.id)?.selected,
        })),
      ];
      return built;
    });
  }, [project, disabled, isGrid, video, allGrids, includedGrids, shots, excludedShots, includedShots, analysisRunning, analysisReady, setNodes, focusStep]);

  const edges = useMemo<Edge[]>(() => {
    const soft = (source: string, target: string, sourceHandle = 'out', targetHandle = 'in'): Edge => ({
      id: `${source}->${target}`, source, target, sourceHandle, targetHandle,
      type: 'default',
      markerEnd: { type: MarkerType.ArrowClosed, color: WIRE, width: 14, height: 14 },
      style: { stroke: WIRE, strokeWidth: 2, opacity: .72 },
      focusable: false, interactionWidth: 0,
    });
    const list: Edge[] = [];
    if (video) list.push(soft('asset-video', 'breakdown'));
    if (isGrid) includedGrids.forEach(grid => {
      list.push(soft('breakdown', `grid:${grid.id}`));
      if (gridVideoState(project, grid).versions.length) list.push(soft(`grid:${grid.id}`, `video-result:${grid.id}`, 'video-out', 'in'));
    });
    else includedShots.forEach(shot => list.push(soft('breakdown', `shot:${shot.id}`)));
    return list;
  }, [video, isGrid, includedGrids, includedShots, project]);

  const fit = () => { void flow.current?.fitView({ padding: .14, maxZoom: 1, duration: 180 }); };
  const resetLayout = () => {
    try { localStorage.removeItem(LAYOUT_KEY(project.id)); } catch { /* */ }
    defaults.current = {};
    setNodes(previous => previous.map(node => {
      if (node.data.kind === 'label') return node;
      if (node.id === 'asset-video') return { ...node, position: { x: COL.assets, y: 72 } };
      if (node.id.startsWith('video-result:')) {
        const order = includedGrids.findIndex(grid => `video-result:${grid.id}` === node.id);
        const gridOrder = Math.max(0, order);
        return { ...node, position: { x: COL.remix + 470, y: 56 + gridOrder * GRID_ROW_STEP } };
      }
      if (node.id === 'breakdown') return { ...node, position: { x: COL.breakdown, y: 100 } };
      if (node.id.startsWith('grid:')) {
        const order = includedGrids.findIndex(g => `grid:${g.id}` === node.id);
        return { ...node, position: { x: COL.remix, y: 56 + Math.max(0, order) * GRID_ROW_STEP } };
      }
      if (node.id.startsWith('shot:')) {
        const order = includedShots.findIndex(s => `shot:${s.id}` === node.id);
        return { ...node, position: { x: COL.remix, y: 56 + Math.max(0, order) * 160 } };
      }
      return node;
    }));
    window.requestAnimationFrame(fit);
  };

  const focusCurrentStep = () => {
    const ids = focusStep === 0 ? ['asset-video']
      : focusStep === 1 ? ['breakdown']
        : isGrid ? includedGrids.slice(0, 3).map(g => `grid:${g.id}`) : includedShots.slice(0, 3).map(s => `shot:${s.id}`);
    if (!ids.length) return;
    window.requestAnimationFrame(() => {
      void flow.current?.fitView({ nodes: ids.map(id => ({ id })), padding: .18, minZoom: .08, maxZoom: .9, duration: 250 });
    });
  };
  useEffect(() => {
    focusCurrentStep();
  }, [focusStep, focusVersion, isGrid]);

  const onSelectionChange = useCallback(({ nodes: selected }: OnSelectionChangeParams<PipeNode>) => {
    setSelectedIds(selected.filter(n => n.data.kind === 'gridCard' || n.data.kind === 'shotCard').map(n => n.id));
  }, []);

  const selectedGridIds = selectedIds.filter(id => id.startsWith('grid:')).map(id => id.slice(5));
  const selectedEligible = selectedGridIds.filter(id => {
    const grid = includedGrids.find(g => g.id === id);
    if (!grid?.prompt.trim()) return false;
    return !gridVideoState(project, grid).running;
  });

  const generateSelected = () => selectedEligible.forEach(id => onGenerate(id));
  const generateAll = () => includedGrids.forEach(grid => {
    if (grid.prompt.trim() && !gridVideoState(project, grid).running) onGenerate(grid.id);
  });

  return <section className="pp-stage" aria-label="流水线画布">
    <header className="pp-header">
      <div className="pp-header-lead">
        <span className="pp-mark" aria-hidden="true"><WandSparkles size={17} /></span>
        <div>
          <h2>人物与视频二创</h2>
          <p>上传素材 · 视频拆解 · 二创出片 · 同画布固定流向</p>
        </div>
      </div>
      <div className="pp-header-actions">
        <div className="pp-view-toggle" role="group" aria-label="画布侧重">
          <button type="button" className={viewMode === 'pipeline' ? 'on' : ''} onClick={() => setViewMode('pipeline')}>流水线</button>
          <button type="button" className={viewMode === 'grids' ? 'on' : ''} onClick={() => {
            setViewMode('grids');
            const ids = (isGrid ? includedGrids : includedShots).map(u => ({ id: isGrid ? `grid:${(u as StoryboardGrid).id}` : `shot:${u.id}` }));
            if (ids.length) void flow.current?.fitView({ nodes: ids, padding: .16, duration: 220 });
          }}>分镜网格</button>
        </div>
        <button type="button" className="pp-btn" onClick={onOpenMaterials}>素材</button>
        {isGrid && <button type="button" className="pp-btn pp-run" disabled={disabled || focusStep < 2 || !includedGrids.length} onClick={generateAll}><Clapperboard size={13} />生成全部（已勾选）</button>}
        <span className="pp-model">{isGrid ? 'r2v · ≤8s' : 'Omni Flash'}</span>
        <button type="button" className="pp-icon" title="模型连接" aria-label="模型连接" onClick={onSettings}><Settings2 size={16} /></button>
      </div>
    </header>

    <div className="pp-viewport">
      <ReactFlow<PipeNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={() => persist()}
        onSelectionChange={onSelectionChange}
        onInit={instance => { flow.current = instance; window.setTimeout(focusCurrentStep, 80); }}
        onMoveEnd={(_e, viewport) => { setZoom(Math.round(viewport.zoom * 100)); persist(viewport); }}
        onMoveStart={() => setWhisper(false)}
        onNodeDragStart={() => setWhisper(false)}
        defaultViewport={layout.viewport}
        fitView={!layout.viewport}
        fitViewOptions={{ padding: .14, maxZoom: .95 }}
        minZoom={.08}
        maxZoom={1.8}
        nodesConnectable={false}
        edgesFocusable={false}
        edgesReconnectable={false}
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
        ariaLabelConfig={{ 'node.a11yDescription.default': '使用方向键移动节点。' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#dedede" />
        <MiniMap className="pp-minimap" ariaLabel="全流程小地图，可拖动查看当前视口之外的节点" pannable zoomable nodeComponent={MiniMapOverviewNode} nodeColor={node => node.id.startsWith('asset-') ? '#cfcfcf' : node.id === 'breakdown' ? '#aebdce' : '#bdbdbd'} nodeStrokeColor="#999999" nodeStrokeWidth={0.7} maskColor="rgba(20, 20, 20, 0.18)" maskStrokeColor="#777777" maskStrokeWidth={1.2} bgColor="#ffffff" />
      </ReactFlow>

      {whisper && <div className="pp-whisper">拖动卡片 · 滚动平移 · 双指缩放</div>}

      {selectedEligible.length >= 2 && <div className="pp-batch" role="toolbar">
        <span>{selectedIds.length} 个分镜已选</span>
        <button type="button" className="pp-btn pp-run" disabled={disabled || focusStep < 2} onClick={generateSelected}>
          <Clapperboard size={13} />生成所选 {selectedEligible.length}
        </button>
        <button type="button" className="pp-icon" aria-label="清除选择" onClick={() => {
          setSelectedIds([]);
          setNodes(prev => prev.map(n => ({ ...n, selected: false })));
        }}><X size={14} /></button>
      </div>}

      <div className="pp-tools" role="toolbar" aria-label="画布工具">
        <button type="button" className={`pp-icon${tool === 'select' ? ' on' : ''}`} aria-label="选择工具" aria-pressed={tool === 'select'} onClick={() => setTool('select')}><MousePointer2 size={17} /></button>
        <button type="button" className={`pp-icon${tool === 'hand' ? ' on' : ''}`} aria-label="平移工具" aria-pressed={tool === 'hand'} onClick={() => setTool('hand')}><Hand size={17} /></button>
        <i />
        <button type="button" className="pp-icon" aria-label="缩小" onClick={() => void flow.current?.zoomOut({ duration: 150 })}><ZoomOut size={16} /></button>
        <button type="button" className="pp-pct" aria-label="重置到百分之百" onClick={() => void flow.current?.zoomTo(1, { duration: 150 })}>{zoom}%</button>
        <button type="button" className="pp-icon" aria-label="放大" onClick={() => void flow.current?.zoomIn({ duration: 150 })}><ZoomIn size={16} /></button>
        <i />
        <button type="button" className="pp-icon" aria-label="适应全部" onClick={fit}><LocateFixed size={17} /></button>
        <button type="button" className="pp-icon" aria-label="整理布局" onClick={resetLayout}><RotateCcw size={15} /></button>
      </div>
    </div>
  </section>;
}

