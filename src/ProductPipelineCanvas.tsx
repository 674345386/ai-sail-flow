import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Handle, MarkerType, MiniMap, PanOnScrollMode, Position, ReactFlow, SelectionMode, useNodesState, useUpdateNodeInternals,
  type Edge, type MiniMapNodeProps, type Node, type NodeProps, type OnSelectionChangeParams, type ReactFlowInstance, type Viewport,
} from '@xyflow/react';
import {
  Clapperboard, Hand, Image as ImageIcon, LoaderCircle, LocateFixed,
  MousePointer2, LayoutGrid, Settings2, Sparkles, Upload, WandSparkles, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import type { GeneratedVideo, Project, Shot, StoryboardGrid } from '../shared/domain';
import type { CanvasComponent, CanvasComponentInput } from '../shared/agent-canvas-ui';
import type { ImageGenerationOptions, ImageQuality } from '../shared/image-generation-options';
import { api } from './api';
import { StoryboardGridCardBody, gridVideoState } from './StoryboardGridWorkbench';
import CanvasTimeline from './CanvasTimeline';
import { layoutCanvasTree } from './canvasTreeLayout';
import '@xyflow/react/dist/style.css';
import './product-pipeline.css';

const AgentCanvasUI = lazy(() => import('./AgentCanvasUI'));

const LAYOUT_KEY = (id: string) => `sop-pipeline-canvas-vertical-v1:${id}`;
const WIRE = '#9bb0c8';
const COL = { assets: 100, breakdown: 100, remix: 100 } as const;
const STAGE_Y = [40, 700, 1500] as const;
const CARD_GAP_Y = 28;
const GRID_ROW_STEP = 280 + CARD_GAP_Y;
const emptyGrids: StoryboardGrid[] = [];
const emptyShots: Shot[] = [];

type Layout = { positions?: Record<string, { x: number; y: number }>; viewport?: Viewport };
type ResultEditor = { kind: 'image' | 'video'; id?: string; prompt: string; originalPrompt?: string; ratio: string; size?: string; quality?: ImageQuality; gridId?: string; referenceIds: string[]; position?: { x: number; y: number } };

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

type PipeKind = 'assetVideo' | 'agentImage' | 'breakdown' | 'gridCard' | 'shotCard' | 'videoResult' | 'timeline';

type PipeData = {
  kind: PipeKind;
  title: string;
  status: string;
  ready: boolean;
  content: ReactNode;
  drag?: boolean;
  videoVertical?: boolean;
  timelineOutput?: boolean;
  timelineInputs?: string[];
  resultId?: string;
  gridId?: string;
};

type PipeNode = Node<PipeData, 'pipeline'>;

const PipelineNode = memo(function PipelineNode({ id, data, selected }: NodeProps<PipeNode>) {
  const updateNodeInternals = useUpdateNodeInternals();
  const timelineInputKey = data.timelineInputs?.join('|');
  useEffect(() => { if (data.kind === 'gridCard' || data.kind === 'videoResult' || data.kind === 'timeline') updateNodeInternals(id); }, [id, data.kind, data.videoVertical, data.timelineOutput, timelineInputKey, updateNodeInternals]);
  const isGrid = data.kind === 'gridCard';
  const showOut = data.kind === 'assetVideo' || data.kind === 'breakdown';
  const showIn = data.kind === 'breakdown' || data.kind === 'gridCard' || data.kind === 'shotCard' || data.kind === 'videoResult' && !!data.gridId;
  const showVideoOut = data.kind === 'gridCard';
  return <article className={`pp-node pp-node--${data.kind}${selected ? ' is-selected' : ''}${data.ready ? ' is-ready' : ''}`}>
    {showIn && <Handle type="target" id="in" position={data.kind === 'videoResult' && !data.videoVertical ? Position.Left : Position.Top} className="pp-port" />}
    {data.kind === 'timeline' && data.timelineInputs?.map((gridId, index, inputs) => <Handle key={gridId} type="target" id={`timeline-${gridId}`} position={Position.Top} className="pp-port" style={{ left: `${(index + 1) * 100 / (inputs.length + 1)}%` }} />)}
    {!isGrid && <header className="pp-node-drag">
      <span>{data.title}</span>
      <span className={`pp-chip${data.ready ? ' ok' : ''}`}>{data.status}</span>
    </header>}
    <div className={`pp-node-body${!isGrid ? ' nodrag nopan' : ''}`}>{data.content}</div>
    {showVideoOut && <Handle type="source" id="video-out" position={data.videoVertical ? Position.Bottom : Position.Right} className="pp-port pp-port--video" />}
    {data.kind === 'videoResult' && data.timelineOutput && <Handle type="source" id="timeline-out" position={Position.Bottom} className="pp-port" />}
    {showOut && <Handle type="source" id="out" position={Position.Bottom} className="pp-port" />}
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
  project, disabled, agentDynamic = false, onCreateImage, onCreateVideo, onPrompt, onGenerate, onRecover, onIncluded, onUploadVideo,
  onAnalyze, onOpenMaterials, onOpenAnalysis, onOpenRemixDetail, onSettings, onBreakdownType, onGridSize, onViewportStage, onShowPage, focusStep, focusVersion, canvasComponents = [], onCanvasDraft,
}: {
  project: Project; disabled: boolean; agentDynamic?: boolean;
  onCreateImage?: (input: ImageGenerationOptions & { prompt: string; referenceIds: string[] }) => Promise<string>;
  onCreateVideo?: (input: { prompt: string; aspectRatio: '16:9' | '9:16'; gridId?: string }) => Promise<string>;
  onPrompt: (id: string, prompt: string) => void;
  onGenerate: (gridId: string | string[]) => void;
  onRecover: (videoId: string) => void;
  onIncluded: (id: string, included: boolean) => void;
  onUploadVideo: () => void;
  onAnalyze: () => void; onOpenMaterials: () => void; onOpenAnalysis: () => void;
  onOpenRemixDetail?: () => void; onSettings: () => void;
  onBreakdownType: (type: 'shot' | 'storyboard-grid') => void; onGridSize: (size: 3 | 4) => void;
  onViewportStage: (stage: number) => void; onShowPage: () => void; focusStep: number; focusVersion: number;
  canvasComponents?: CanvasComponent[]; onCanvasDraft?: (text: string) => void;
}) {
  const isGrid = project.breakdownType === 'storyboard-grid';
  const video = useMemo(() => project.assets.find(asset => asset.kind === 'video'), [project.assets]);
  const allGrids = project.storyboardGrids || emptyGrids;
  const includedGrids = useMemo(() => allGrids.filter(grid => grid.included !== false), [allGrids]);
  const timelineGridIds = useMemo(() => isGrid ? includedGrids.filter(grid => {
    const clip = gridVideoState(project, grid).completed.at(-1);
    return !!clip?.url && clip.duration > 0;
  }).map(grid => grid.id) : [], [isGrid, includedGrids, project]);
  const shots = project.analysis?.shots || emptyShots;
  const excludedShots = project.analysis?.excludedShots || emptyShots;
  const includedShots = shots; // active analysis.shots are the included set
  const timelineY = STAGE_Y[2] + 140 + Math.max(1, isGrid ? includedGrids.length : includedShots.length) * (isGrid ? GRID_ROW_STEP : 160);

  const [layout] = useState(() => readLayout(project.id));
  const defaults = useRef(layout);
  const [nodes, setNodes, onNodesChange] = useNodesState<PipeNode>([]);
  const [zoom, setZoom] = useState(Math.round((layout.viewport?.zoom || 1) * 100));
  const [tool, setTool] = useState<'select' | 'hand'>('select');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [whisper, setWhisper] = useState(true);
  const [viewMode, setViewMode] = useState<'pipeline' | 'grids'>('pipeline');
  const [editor, setEditor] = useState<ResultEditor | null>(null);
  const [canvasUiError, setCanvasUiError] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; position: { x: number; y: number }; node?: PipeNode } | null>(null);
  const [editorError, setEditorError] = useState('');
  const [creating, setCreating] = useState(false);
  const flow = useRef<ReactFlowInstance<PipeNode>>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageCallback = useRef(onViewportStage);
  stageCallback.current = onViewportStage;
  const handlers = useRef({ onPrompt, onGenerate, onRecover, onIncluded });
  handlers.current = { onPrompt, onGenerate, onRecover, onIncluded };
  const actions = useRef({ onUploadVideo, onAnalyze, onOpenMaterials, onOpenAnalysis, onOpenRemixDetail, onBreakdownType, onGridSize });
  actions.current = { onUploadVideo, onAnalyze, onOpenMaterials, onOpenAnalysis, onOpenRemixDetail, onBreakdownType, onGridSize };

  useEffect(() => { defaults.current = readLayout(project.id); }, [project.id]);

  const persist = useCallback((viewport?: Viewport) => {
    try {
      const current = flow.current?.getNodes() || [];
      localStorage.setItem(LAYOUT_KEY(project.id), JSON.stringify({
        positions: Object.fromEntries(current.map(n => [n.id, n.position])),
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
    const callRecover = (id: string) => handlers.current.onRecover(id);
    const callIncluded = (id: string, included: boolean) => handlers.current.onIncluded(id, included);
    const saved = defaults.current.positions || {};

    const assetNodes: Array<PipeData & { id: string; position: { x: number; y: number } }> = [];
    if (!agentDynamic || video) assetNodes.push({
      id: 'asset-video', kind: 'assetVideo', title: '参考视频',
      status: video ? '已上传' : '待上传', ready: !!video,
      position: saved['asset-video'] || { x: COL.assets, y: STAGE_Y[0] + 60 },
      content: video
        ? <div className="pp-media"><video src={video.url} poster={video.thumbnail} muted playsInline preload="metadata" /><div className="pp-media-meta"><strong title={video.name}>{video.name}</strong><span>{formatDur(video.duration)} · {video.width && video.height ? `${video.width}×${video.height}` : '视频'}</span></div><button type="button" className="pp-btn" disabled={disabled} onClick={() => actions.current.onUploadVideo()}>更换视频</button></div>
        : <button type="button" className="pp-empty" disabled={disabled} onClick={() => actions.current.onUploadVideo()}><Upload size={22} /><strong>上传参考视频</strong><span>MP4 / MOV · 作为流水线输入</span></button>,
    });


    if (agentDynamic) (project.agentImages || []).forEach((image, index) => assetNodes.push({
      id: `agent-image:${image.id}`, kind: 'agentImage', title: '生成图片', resultId: image.id,
      status: image.status === 'running' ? '生成中' : image.status === 'completed' ? '已完成' : '需核对',
      ready: image.status === 'completed',
      position: saved[`agent-image:${image.id}`] || { x: video ? 470 : 100, y: STAGE_Y[0] + 60 + index * 540 },
      content: <div className={`pp-agent-image ${image.aspectRatio === '16:9' ? 'is-landscape' : image.aspectRatio === '9:16' || image.aspectRatio === '4:5' ? 'is-portrait' : ''}`}>
        {image.status === 'completed' && image.url ? <img src={image.url} alt={image.prompt} />
          : image.status === 'running' ? <div className="pp-agent-image-placeholder" role="status"><LoaderCircle size={22} className="spin" /><span>正在生成图片…</span></div>
            : <div className="pp-agent-image-placeholder is-failed" role="alert"><ImageIcon size={21} /><span>{image.error || '图片生成失败'}</span></div>}
        <p title={image.prompt}>{image.prompt}</p>
        <div className="pp-agent-image-meta"><span>{image.aspectRatio}{image.model ? ` · ${image.model}` : ''}</span>{image.url && <a href={image.url} download={image.filename || 'image.png'}>下载图片</a>}</div>
      </div>,
    }));

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
      position: saved.breakdown || { x: COL.breakdown, y: STAGE_Y[1] + 60 },
      content: <div className="pp-breakdown">
        <div className="pp-analysis-options" role="group" aria-label="拆解方式">
          <button type="button" className={!isGrid ? 'is-active' : ''} disabled={disabled || !video} onClick={() => actions.current.onBreakdownType('shot')}>逐镜头</button>
          <button type="button" className={isGrid ? 'is-active' : ''} disabled={disabled || !video} onClick={() => actions.current.onBreakdownType('storyboard-grid')}>分镜网格</button>
        </div>
        {isGrid && <div className="pp-grid-density"><span>网格密度</span>{([3, 4] as const).map(size => <button key={size} type="button" className={(project.storyboardGridSize || 3) === size ? 'is-active' : ''} disabled={disabled || !video} onClick={() => actions.current.onGridSize(size)}>{size}×{size}</button>)}</div>}
        <p className="pp-breakdown-sum">{analysisReady
          ? (isGrid ? `${allGrids.length} 张分镜网格 · ${includedGrids.length} 张纳入二创` : `${shots.length} 个镜头 · ${includedShots.length} 个纳入`)
          : '完成拆解后，摘要会汇总到这里，并连线到下方每张已勾选卡。'}</p>
        <div className="pp-shot-list nowheel">{breakdownRows.length ? breakdownRows : <span className="pp-muted">还没有拆解结果</span>}</div>
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
          position: saved[id] || { x: COL.remix, y: STAGE_Y[2] + 60 + order * GRID_ROW_STEP },
          data: {
            kind: 'gridCard', title: `分镜网格 ${String((index < 0 ? order : index) + 1).padStart(2, '0')}`,
            status: 'card', ready: true,
            content: <StoryboardGridCardBody
              grid={grid} index={index < 0 ? order : index} project={project} disabled={disabled || focusStep < 2}
              onPrompt={callPrompt} onGenerate={callGenerate} onRecover={callRecover} onIncluded={callIncluded}
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
          position: saved[id] || { x: COL.remix, y: STAGE_Y[2] + 60 + order * 160 },
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

    const videoCard = (item: GeneratedVideo, grid: StoryboardGrid | undefined, order: number, version: number, isLatest: boolean) => {
      const running = item.status === 'running' && project.job?.status === 'running' && project.job.videoId === item.id;
      const ready = item.status === 'completed' && !!item.url;
      const progress = running ? project.job?.progress : undefined;
      const gridPosition = grid ? saved[`grid:${grid.id}`] || remixUnits.find(unit => unit.id === `grid:${grid.id}`)?.position : undefined;
      const content = running
        ? <div className="pp-video-output is-loading" role="status"><div className="pp-video-loading"><LoaderCircle size={20} className="spin" /><strong>{progress != null ? `正在生成视频 · ${progress}%` : '正在生成视频…'}</strong><div className="pp-video-progress"><i style={{ width: `${Math.max(8, progress || 24)}%` }} /></div></div></div>
        : ready ? <div className="pp-video-output"><video key={item.id} src={item.url} poster={item.thumbnail} controls playsInline preload="metadata" /><div className="pp-video-meta"><strong>{item.filename || '生成视频'}</strong><span>{(item.duration || 0).toFixed(1)} 秒 · {item.model === 'local-test' ? '本地测试视频' : item.provider === 'omni-flash' ? 'Omni Flash' : item.provider === 'minimax-h3' ? `MiniMax · ${item.model}` : item.mode || 'r2v'}</span></div></div>
          : <div className="pp-video-output is-failed"><span>{item.error || '视频生成失败'}</span></div>;
      const id = `video-result:${item.id}`;
      return { id, type: 'pipeline' as const, dragHandle: '.pp-node-drag',
        position: saved[id] || (grid && isLatest ? saved[`video-result:${grid.id}`] : undefined) || (gridPosition ? { x: gridPosition.x + 470 + version * 330, y: gridPosition.y } : { x: 470 + order * 330, y: 100 }),
        data: { kind: 'videoResult' as const, title: running ? '待生成的视频' : ready ? '生成的视频' : '视频生成结果', status: running ? '生成中' : ready ? '已完成' : '生成失败', ready, content,
          resultId: item.id, gridId: grid?.id, timelineOutput: !!grid && timelineGridIds.includes(grid.id) && gridVideoState(project, grid).completed.at(-1)?.id === item.id },
      };
    };
    const activeGridResults = isGrid ? includedGrids.flatMap((grid, order) => {
      const versions = gridVideoState(project, grid).versions;
      return versions.map((item, version) => videoCard(item, grid, order, version, version === versions.length - 1));
    }) : [];
    const standaloneResults = agentDynamic ? project.generatedVideos.filter(item => (item.unitId?.startsWith('canvas-test-') || item.unitId?.startsWith('agent-video-'))).map((item, index) => videoCard(item, undefined, index, 0, true)) : [];

    setNodes(previous => {
      const byId = new Map(previous.map(node => [node.id, node]));
      const built: PipeNode[] = [
        ...assetNodes.map(item => ({
          id: item.id, type: 'pipeline' as const, dragHandle: '.pp-node-drag',
          position: byId.get(item.id)?.position || item.position,
          data: { kind: item.kind, title: item.title, status: item.status, ready: item.ready, content: item.content, resultId: item.resultId },
          selected: byId.get(item.id)?.selected,
        })),
        ...(!agentDynamic || analysisRunning || analysisFailed || analysisReady ? [{
          id: breakdownNode.id, type: 'pipeline', dragHandle: '.pp-node-drag',
          position: byId.get('breakdown')?.position || breakdownNode.position,
          data: { kind: breakdownNode.kind, title: breakdownNode.title, status: breakdownNode.status, ready: breakdownNode.ready, content: breakdownNode.content },
          selected: byId.get('breakdown')?.selected,
        } as PipeNode] : []),
        ...remixUnits.map(unit => ({
          id: unit.id, type: 'pipeline' as const,
          dragHandle: unit.data.kind === 'gridCard' ? '.sg-card-drag' : '.pp-node-drag',
          position: byId.get(unit.id)?.position || unit.position,
          data: unit.data,
          selected: byId.get(unit.id)?.selected,
        })),
        ...[...activeGridResults, ...standaloneResults].map(unit => ({
          ...unit,
          position: byId.get(unit.id)?.position || unit.position,
          selected: byId.get(unit.id)?.selected,
        })),
        ...(!agentDynamic || project.generatedVideos.length > 0 ? [{ id: 'timeline', type: 'pipeline', dragHandle: '.pp-node-drag', position: byId.get('timeline')?.position || saved.timeline || { x: COL.remix, y: timelineY },
          data: { kind: 'timeline', title: '视频时间轴', status: '片段预览', ready: true, content: <CanvasTimeline project={project} />, timelineInputs: timelineGridIds }, selected: byId.get('timeline')?.selected } as PipeNode] : []),
      ];
      return built;
    });
  }, [project, disabled, agentDynamic, isGrid, video, allGrids, includedGrids, shots, excludedShots, includedShots, analysisRunning, analysisFailed, analysisReady, setNodes, focusStep, timelineY, timelineGridIds]);

  const edges = useMemo<Edge[]>(() => {
    const soft = (source: string, target: string, sourceHandle = 'out', targetHandle = 'in'): Edge => ({
      id: `${source}->${target}`, source, target, sourceHandle, targetHandle,
      type: 'default',
      markerEnd: { type: MarkerType.ArrowClosed, color: WIRE, width: 14, height: 14 },
      style: { stroke: WIRE, strokeWidth: 2, opacity: .72 },
      focusable: false, interactionWidth: 0,
    });
    const list: Edge[] = [];
    if (video && (!agentDynamic || analysisRunning || analysisFailed || analysisReady)) list.push(soft('asset-video', 'breakdown'));
    if (isGrid) includedGrids.forEach(grid => {
      if (!agentDynamic || analysisRunning || analysisFailed || analysisReady) list.push(soft('breakdown', `grid:${grid.id}`));
      const state = gridVideoState(project, grid);
      state.versions.forEach(item => list.push(soft(`grid:${grid.id}`, `video-result:${item.id}`, 'video-out', 'in')));
      const latest = state.completed.at(-1);
      if (latest && timelineGridIds.includes(grid.id)) list.push(soft(`video-result:${latest.id}`, 'timeline', 'timeline-out', `timeline-${grid.id}`));
    });
    else includedShots.forEach(shot => { if (!agentDynamic || analysisRunning || analysisFailed || analysisReady) list.push(soft('breakdown', `shot:${shot.id}`)); });
    return list;
  }, [video, agentDynamic, analysisRunning, analysisFailed, analysisReady, isGrid, includedGrids, includedShots, project, timelineGridIds]);

  const displayNodes = useMemo(() => {
    const byId = new Map(nodes.map(node => [node.id, node]));
    return nodes.map(node => {
      if (node.data.kind !== 'gridCard' && node.data.kind !== 'videoResult') return node;
      const gridId = node.data.kind === 'gridCard' ? node.id.slice(5) : node.data.gridId;
      const grid = gridId ? byId.get(`grid:${gridId}`) : undefined;
      const result = node.data.kind === 'videoResult' ? node : nodes.filter(item => item.data.kind === 'videoResult' && item.data.gridId === gridId).at(-1);
      const videoVertical = !!grid && !!result && result.position.y > grid.position.y + 100;
      return { ...node, data: { ...node.data, videoVertical } };
    });
  }, [nodes]);

  const fit = () => { void flow.current?.fitView({ padding: .14, maxZoom: 1, duration: 180 }); };
  const resetLayout = () => {
    const measured = new Map((flow.current?.getNodes() || nodes).map(node => [node.id, node]));
    const sizes: Record<PipeKind, { width: number; height: number }> = {
      assetVideo: { width: 280, height: 260 }, agentImage: { width: 300, height: 500 }, breakdown: { width: 320, height: 360 },
      gridCard: { width: 400, height: 280 }, shotCard: { width: 280, height: 160 }, videoResult: { width: 300, height: 260 }, timeline: { width: 860, height: 500 },
    };
    const positions = layoutCanvasTree(nodes.map(node => ({
      id: node.id, width: measured.get(node.id)?.measured?.width || sizes[node.data.kind].width,
      height: measured.get(node.id)?.measured?.height || sizes[node.data.kind].height,
    })), edges);
    const arranged = nodes.map(node => ({ ...node, position: positions[node.id] || node.position }));
    setNodes(arranged);
    defaults.current = { positions: Object.fromEntries(arranged.map(node => [node.id, node.position])) };
    try { localStorage.setItem(LAYOUT_KEY(project.id), JSON.stringify({ ...defaults.current, viewport: flow.current?.getViewport() })); } catch { /* storage unavailable */ }
    window.requestAnimationFrame(fit);
  };

  const focusCurrentStep = () => {
    const ids = focusStep === 0 ? ['asset-video'] : focusStep === 1 ? ['breakdown'] : isGrid && includedGrids.length ? [`grid:${includedGrids[0].id}`] : includedShots.length ? [`shot:${includedShots[0].id}`] : ['timeline'];
    if (!ids.length) return;
    window.requestAnimationFrame(() => {
      void flow.current?.fitView({ nodes: ids.map(id => ({ id })), padding: .18, minZoom: .08, maxZoom: .9, duration: 250 });
    });
  };
  useEffect(() => {
    focusCurrentStep();
  }, [focusVersion]);

  const onSelectionChange = useCallback(({ nodes: selected }: OnSelectionChangeParams<PipeNode>) => {
    setSelectedIds(selected.filter(n => n.data.kind === 'gridCard' || n.data.kind === 'shotCard').map(n => n.id));
  }, []);

  const selectedGridIds = selectedIds.filter(id => id.startsWith('grid:')).map(id => id.slice(5));
  const selectedEligible = selectedGridIds.filter(id => {
    const grid = includedGrids.find(g => g.id === id);
    if (!grid?.prompt.trim()) return false;
    return !gridVideoState(project, grid).running;
  });

  const generateSelected = () => onGenerate(selectedEligible);
  const generateAll = () => onGenerate(includedGrids.filter(grid => grid.prompt.trim() && !gridVideoState(project, grid).running).map(grid => grid.id));
  const openResult = (node: PipeNode, asReference = false) => {
    setMenu(null); setEditorError('');
    if (node.data.kind === 'agentImage') {
      const image = project.agentImages?.find(item => item.id === node.data.resultId);
      if (!image) return;
      setEditor({ kind: 'image', id: asReference ? undefined : image.id, prompt: image.prompt || '', originalPrompt: image.prompt,
        ratio: image.aspectRatio || '', size: image.size, quality: image.quality, referenceIds: asReference && image.status === 'completed' ? [image.id] : image.referenceIds || [],
        position: asReference ? { x: node.position.x + 360, y: node.position.y } : undefined });
    } else if (node.data.kind === 'videoResult') {
      const result = project.generatedVideos.find(item => item.id === node.data.resultId);
      if (!result) return;
      setEditor({ kind: 'video', id: asReference ? undefined : result.id, prompt: result.prompt || '', originalPrompt: result.prompt,
        ratio: result.aspectRatio === '16:9' ? '16:9' : '9:16', gridId: result.storyboardGridId || result.gridId, referenceIds: [],
        position: asReference ? { x: node.position.x + 360, y: node.position.y } : undefined });
    }
  };
  const submitResult = async () => {
    if (!editor || creating || disabled) return;
    if (!editor.prompt.trim()) { setEditorError('请填写生成提示词。'); return; }
    setCreating(true); setEditorError('');
    try {
      const id = editor.kind === 'image'
        ? await onCreateImage?.({ prompt: editor.prompt, aspectRatio: editor.ratio || undefined, size: editor.size, quality: editor.quality, referenceIds: editor.referenceIds })
        : await onCreateVideo?.({ prompt: editor.prompt, aspectRatio: editor.ratio === '16:9' ? '16:9' : '9:16', gridId: editor.gridId });
      if (!id) throw new Error('生成服务当前不可用。');
      const nodeId = `${editor.kind === 'image' ? 'agent-image' : 'video-result'}:${id}`;
      const source = editor.id && nodes.find(node => node.data.resultId === editor.id);
      const position = editor.position || (source ? { x: source.position.x + 360, y: source.position.y } : undefined);
      if (position) {
        defaults.current = { ...defaults.current, positions: { ...defaults.current.positions, [nodeId]: position } };
        setNodes(previous => previous.map(node => node.id === nodeId ? { ...node, position } : node));
        try {
          const current = flow.current?.getNodes() || [];
          localStorage.setItem(LAYOUT_KEY(project.id), JSON.stringify({ positions: { ...defaults.current.positions, ...Object.fromEntries(current.map(node => [node.id, node.position])), [nodeId]: position }, viewport: flow.current?.getViewport() }));
        } catch { /* storage unavailable */ }
      }
      setEditor(null);
    } catch (error) { setEditorError(error instanceof Error ? error.message : '生成任务未能启动。'); }
    finally { setCreating(false); }
  };
  const openMenu = (event: React.MouseEvent | MouseEvent, node?: PipeNode) => {
    if (!agentDynamic) return;
    event.preventDefault();
    const bounds = viewportRef.current?.getBoundingClientRect();
    if (!bounds || !flow.current) return;
    setMenu({ x: Math.max(0, Math.min(event.clientX - bounds.left, bounds.width - 200)), y: Math.max(0, Math.min(event.clientY - bounds.top, bounds.height - 140)),
      position: flow.current.screenToFlowPosition({ x: event.clientX, y: event.clientY }), node });
  };
  const stageAtViewport = (viewport: Viewport) => {
    const centerY = ((viewportRef.current?.clientHeight || 600) * .4 - viewport.y) / viewport.zoom;
    const current = flow.current?.getNodes() || [];
    const breakdownY = current.find(node => node.id === 'breakdown')?.position.y ?? STAGE_Y[1];
    const unitYs = current.filter(node => node.id.startsWith('grid:') || node.id.startsWith('shot:')).map(node => node.position.y);
    const remixY = unitYs.length ? Math.min(...unitYs) : current.find(node => node.id === 'timeline')?.position.y ?? STAGE_Y[2];
    return centerY >= remixY - 60 ? 2 : centerY >= breakdownY - 60 ? 1 : 0;
  };

  return <section className="pp-stage" aria-label="流水线画布">
    <header className="pp-header">
      <div className="pp-header-lead">
        <span className="pp-mark" aria-hidden="true"><WandSparkles size={17} /></span>
        <div>
          <h2>人物与视频二创</h2>
          <p>上下滚动浏览创作流程</p>
        </div>
      </div>
      <div className="pp-header-actions">
        {agentDynamic && <Suspense fallback={null}><AgentCanvasUI triggerOnly components={[]} grids={allGrids} onUpdate={() => {}} onClose={() => {}} onDraft={() => {}} /></Suspense>}
        <button type="button" className="pp-btn" onClick={onShowPage}>流程页面</button>
        <div className="pp-view-toggle" role="group" aria-label="画布侧重">
          <button type="button" className={viewMode === 'pipeline' ? 'on' : ''} onClick={() => setViewMode('pipeline')}>流水线</button>
          <button type="button" className={viewMode === 'grids' ? 'on' : ''} onClick={() => {
            setViewMode('grids');
            const ids = (isGrid ? includedGrids : includedShots).map(u => ({ id: isGrid ? `grid:${(u as StoryboardGrid).id}` : `shot:${u.id}` }));
            if (ids.length) void flow.current?.fitView({ nodes: ids, padding: .16, duration: 220 });
          }}>分镜网格</button>
        </div>
        <button type="button" className="pp-btn" onClick={onOpenMaterials}>素材</button>
        <button type="button" className="pp-btn" onClick={() => void flow.current?.fitView({ nodes: [{ id: 'timeline' }], padding: .18, maxZoom: 1, duration: 220 })}>时间轴</button>
        <button type="button" className="pp-btn" onClick={resetLayout} title="将画布节点按流程重新排列"><LayoutGrid size={14} />自动排布</button>
        {isGrid && <button type="button" className="pp-btn pp-run" disabled={disabled || focusStep < 2 || !includedGrids.length} onClick={generateAll}><Clapperboard size={13} />生成全部（已勾选）</button>}
        <span className="pp-model">{isGrid ? '本地测试视频 · 前三个网格' : 'Omni Flash'}</span>
        <button type="button" className="pp-icon" title="模型连接" aria-label="模型连接" onClick={onSettings}><Settings2 size={16} /></button>
      </div>
    </header>

    <div className="pp-viewport" ref={viewportRef}>
      {agentDynamic && <Suspense fallback={null}><AgentCanvasUI panelsOnly components={canvasComponents} grids={allGrids} onDraft={text => onCanvasDraft?.(text)} onUpdate={(id: string, input: Partial<CanvasComponentInput>) => {
        setCanvasUiError('');
        void api(`/api/projects/${project.id}/agent/canvas-components/${id}`, { method: 'PATCH', body: JSON.stringify(input) }).catch(error => setCanvasUiError(error instanceof Error ? error.message : '参数保存失败'));
      }} onClose={id => {
        setCanvasUiError('');
        void api(`/api/projects/${project.id}/agent/canvas-components/${id}`, { method: 'DELETE' }).catch(error => setCanvasUiError(error instanceof Error ? error.message : '关闭失败'));
      }} /></Suspense>}
      {canvasUiError && <div className="acu-error" role="alert">{canvasUiError}</div>}
      <ReactFlow<PipeNode>
        nodes={displayNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onPaneClick={() => setMenu(null)}
        onPaneContextMenu={event => openMenu(event)}
        onNodeContextMenu={(event, node) => openMenu(event, node)}
        onNodeClick={(event, node) => {
          if (!agentDynamic || (node.data.kind !== 'agentImage' && node.data.kind !== 'videoResult')) return;
          if ((event.target as HTMLElement).closest('button, a, video, input, textarea, select')) return;
          openResult(node);
        }}
        onNodeDragStop={() => persist()}
        onSelectionChange={onSelectionChange}
        onInit={instance => {
          flow.current = instance;
          if (!layout.viewport) { stageCallback.current(focusStep); window.setTimeout(focusCurrentStep, 80); }
          else stageCallback.current(stageAtViewport(layout.viewport));
        }}
        onMoveEnd={(event, viewport) => {
          setZoom(Math.round(viewport.zoom * 100)); persist(viewport);
          if (event) stageCallback.current(stageAtViewport(viewport));
        }}
        onMoveStart={() => setWhisper(false)}
        onNodeDragStart={() => setWhisper(false)}
        defaultViewport={layout.viewport}
        fitView={false}
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
        panOnScrollMode={PanOnScrollMode.Vertical}
        zoomOnScroll={false}
        zoomOnPinch
        preventScrolling
        colorMode="light"
        proOptions={{ hideAttribution: true }}
        ariaLabelConfig={{ 'node.a11yDescription.default': '使用方向键移动节点。' }}
      >
        <MiniMap className="pp-minimap" ariaLabel="全流程小地图，可拖动查看当前视口之外的节点" pannable zoomable nodeComponent={MiniMapOverviewNode} nodeColor={node => node.id.startsWith('asset-') ? '#cfcfcf' : node.id === 'breakdown' ? '#aebdce' : '#bdbdbd'} nodeStrokeColor="#999999" nodeStrokeWidth={0.7} maskColor="rgba(0, 0, 0, 0.5)" maskStrokeColor="#aebac1" maskStrokeWidth={1.2} bgColor="#15191d" />
      </ReactFlow>

      {menu && <div className="pp-context-menu" style={{ left: menu.x, top: menu.y }} role="menu">
        {menu.node && (menu.node.data.kind === 'agentImage' || menu.node.data.kind === 'videoResult') && <>
          <button type="button" role="menuitem" onClick={() => openResult(menu.node!)}>查看生成提示词</button>
          <button type="button" role="menuitem" onClick={() => openResult(menu.node!, true)}>{menu.node.data.kind === 'agentImage' ? '以此图片为参考新建' : '基于此视频新建'}</button>
          <hr />
        </>}
        <button type="button" role="menuitem" onClick={() => { setEditorError(''); setEditor({ kind: 'image', prompt: '', ratio: '', referenceIds: [], position: menu.position }); setMenu(null); }}><ImageIcon size={15} />新建图片生成</button>
        <button type="button" role="menuitem" onClick={() => { setEditorError(''); setEditor({ kind: 'video', prompt: '', ratio: project.market.aspectRatio === '16:9' ? '16:9' : '9:16', referenceIds: [], position: menu.position }); setMenu(null); }}><Clapperboard size={15} />新建视频生成</button>
      </div>}
      {editor && <aside className="pp-result-editor nodrag nopan nowheel" aria-label={editor.kind === 'image' ? '图片生成提示词' : '视频生成提示词'}>
        <header><div><strong>{editor.kind === 'image' ? '图片生成' : '视频生成'}</strong><span>{editor.id ? '查看生成记录并继续创作' : '新建生成'}</span></div><button type="button" aria-label="关闭提示词编辑框" title="关闭" onClick={() => setEditor(null)}><X size={18} /></button></header>
        <div className="pp-result-editor-body">
          <label htmlFor="pp-result-prompt">{editor.id ? '生成时的 Prompt · 可编辑' : 'Prompt'}</label>
          {editor.id && !editor.originalPrompt && <p className="pp-result-hint">此历史记录没有保存生成时的 Prompt，可输入新描述继续生成。</p>}
          <textarea id="pp-result-prompt" value={editor.prompt} placeholder={editor.kind === 'image' ? '描述你想生成的画面…' : '描述画面、动作与镜头…'} onChange={event => setEditor({ ...editor, prompt: event.target.value })} />
          {!!editor.originalPrompt && editor.prompt !== editor.originalPrompt && <details><summary>查看原始 Prompt</summary><pre>{editor.originalPrompt}</pre></details>}
          <label htmlFor="pp-result-ratio">画幅</label>
          <select id="pp-result-ratio" value={editor.ratio} onChange={event => setEditor({ ...editor, ratio: event.target.value, size: undefined })}>
            {editor.kind === 'image' && <option value="">自动 · 由模型决定</option>}
            {['9:16', '16:9', ...(editor.kind === 'image' ? ['1:1', '4:5', '3:2', '2:3'] : []), ...(editor.kind === 'image' && editor.ratio && !['9:16', '16:9', '1:1', '4:5', '3:2', '2:3'].includes(editor.ratio) ? [editor.ratio] : [])].map(ratio => <option key={ratio} value={ratio}>{ratio}</option>)}
          </select>
          {editor.kind === 'image' && <><label htmlFor="pp-result-size">像素尺寸 · 可选</label><input id="pp-result-size" value={editor.size || ''} placeholder="自动，或输入 1536x864" onChange={event => setEditor({ ...editor, size: event.target.value || undefined })} />{editor.id && project.agentImages?.find(image => image.id === editor.id)?.warning && <p className="pp-result-hint" role="status">{project.agentImages.find(image => image.id === editor.id)?.warning}</p>}</>}
          {editor.kind === 'video' && <><label htmlFor="pp-result-grid">关联分镜</label><select id="pp-result-grid" value={editor.gridId || ''} onChange={event => setEditor({ ...editor, gridId: event.target.value || undefined })}><option value="">独立视频</option>{includedGrids.map((grid, index) => <option key={grid.id} value={grid.id}>分镜网格 {String(index + 1).padStart(2, '0')}</option>)}</select><p className="pp-result-hint">当前使用本地测试视频，结果不会随 Prompt 改变。</p></>}
          {editor.kind === 'image' && editor.referenceIds.length > 0 && <p className="pp-result-hint">已沿用 {editor.referenceIds.length} 张参考图</p>}
          {editorError && <p className="pp-result-error" role="alert">{editorError}</p>}
        </div>
        <footer><button type="button" onClick={() => setEditor(null)}>取消</button><button type="button" className="is-primary" disabled={disabled || creating || !editor.prompt.trim() || (editor.kind === 'image' && !!project.agentImages?.some(image => image.status === 'running'))} onClick={() => void submitResult()}>{creating ? '正在提交…' : editor.id ? '生成新版本' : editor.kind === 'image' ? '生成图片' : '生成视频'}</button></footer>
      </aside>}

      {whisper && <div className="pp-whisper">上下滚动浏览流程 · 拖动卡片 · 双指缩放</div>}

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
        <button type="button" className="pp-icon" aria-label="自动排布" title="自动排布" onClick={resetLayout}><LayoutGrid size={15} /></button>
      </div>
    </div>
  </section>;
}

