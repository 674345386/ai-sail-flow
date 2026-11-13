import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Background, BackgroundVariant, Handle, MiniMap, Position, ReactFlow, applyNodeChanges, type Node, type NodeProps, type NodeChange, type ReactFlowInstance } from '@xyflow/react';
import { ArrowDownToLine, ArrowRight, BookOpen, Boxes, Check, CheckCheck, ChevronDown, Code2, Ellipsis, ExternalLink, FileText, Film, FlaskConical, GitBranch, GitFork as Github, Hand, Image, Layers, LayoutGrid, Link2, LoaderCircle, Map as MapIcon, Maximize2, Minus, MousePointer2, Play, Plus, Save, SlidersHorizontal, Sparkles, Trash2, Workflow, X } from 'lucide-react';
import type { Project } from '../shared/domain';
import { activeExperimentMethod, emptyExperiment, normalizeExperimentGraph, experimentKindLabels, experimentRecipes, experimentStatusLabels, type ExperimentGraph, type ExperimentNode, type ExperimentOperation } from '../shared/experiment';
import { ExperimentComparisons, ExperimentMethodEditor, ExperimentPlanEditor, ExperimentRunDetails, type WorkbenchSource } from './ExperimentPlans';
import { api, downloadBlob } from './api';
import '@xyflow/react/dist/style.css';
import './experiment-workbench.css';
import { SkillReferenceBar } from './SkillAssetCenter';
import { ExperimentPolicyControl, ExperimentRoutes } from './ExperimentRoutes';
import { activeExperimentProposal, experimentLevel } from '../shared/experiment-planning';
import './experiment-routes.css';
import { completedPlanArtifact, experimentNodePresentation, type ExperimentNodePresentation } from './experiment-status';
import './experiment-canvas.css';
import './experiment-canvas-v2.css';
import { ExperimentCanvasNode, type ExperimentCanvasFlowNode as FlowNode } from './ExperimentCanvasNode';
import ExperimentCanvasComposer from './ExperimentCanvasComposer';
import { addCanvasReference, canvasModels, canvasNodeRatio, canvasOutputKind, canvasReference, composerStep, selectedCanvasRelations, type CanvasModel, type CanvasStatus } from './experiment-canvas-model';
import { executionTurnCanvas, type TurnPosition } from './experiment-turns';

const nodeTypes = { experiment: ExperimentCanvasNode };
const recipeIcons = { programmatic: Code2, 'talking-head': FileText, keyframes: Image, direct: Sparkles, grid: LayoutGrid, character: Film };
type Draft = Pick<ExperimentNode, 'title' | 'content' | 'description'>;

function WorkbenchPopover({ label, summary, children, className, closeOnAction = false }: {
  label: string; summary: ReactNode; children: ReactNode; className: string; closeOnAction?: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (ref.current?.open && event.target instanceof Node && !ref.current.contains(event.target)) ref.current.open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && ref.current?.open) {
        event.preventDefault(); ref.current.open = false; ref.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, []);
  return <details ref={ref} className={`lab-toolbar-popover ${className}`}>
    <summary aria-label={label} title={label}>{summary}</summary>
    <div className="lab-toolbar-popover-panel" role="group" aria-label={label} onClick={event => {
      const button = event.target instanceof Element ? event.target.closest('button') : null;
      if (closeOnAction && button && !button.disabled && ref.current) { ref.current.open = false; ref.current.querySelector('summary')?.focus(); }
    }}>{children}</div>
  </details>;
}

export default function ExperimentWorkbench({ project, graph: incoming, onGraph, onDraft, onExecute, onProjectUpdate, onBeforeChange, disabled = false, active = true }: {
  project: Project; graph?: ExperimentGraph; onGraph: (graph: ExperimentGraph) => void; onDraft: (text: string) => void; onExecute?: (text: string) => void; onProjectUpdate?: (project: Project) => void; onBeforeChange?: () => Promise<unknown>; disabled?: boolean; active?: boolean;
}) {
  const graph = useMemo(() => normalizeExperimentGraph(incoming || emptyExperiment()), [incoming]);
  const graphRef = useRef(graph);
  if (graph.revision >= graphRef.current.revision) graphRef.current = graph;
  const proposal = activeExperimentProposal(graph);
  const [view, setView] = useState<'routes' | 'execution'>(proposal ? proposal.selectedRouteIds.length ? 'execution' : 'routes' : graph.nodes.length ? 'execution' : 'routes');
  const [canvasMode, setCanvasMode] = useState<'turns' | 'nodes'>('turns');
  const [overviewFocus, setOverviewFocus] = useState<string>();
  useEffect(() => { if (graph.nodes.length && !proposal) setView('execution'); }, [!!graph.nodes.length]);
  useEffect(() => { if (proposal) setView(proposal.selectedRouteIds.length ? 'execution' : 'routes'); }, [proposal?.id]);
  const [selectedId, setSelectedId] = useState<string>();
  const [planId, setPlanId] = useState('');
  const plan = graph.plans?.find(item => item.id === planId);
  const selected = graph.nodes.find(n => n.id === selectedId);
  const composerTarget = composerStep(graph, selected);
  const selectedPresentation = selected && experimentNodePresentation(selected, graph);
  const untouchedAlternative = !!plan?.basedOn && !graph.runs?.some(run => run.planId === plan.id);
  const originalOutput = untouchedAlternative ? completedPlanArtifact(graph, plan?.basedOn, true) : undefined;
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [working, setWorking] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [drawer, setDrawer] = useState<'recipes' | 'skill' | 'templates' | 'save' | 'plan' | 'compare' | 'methods' | null>(null);
  useEffect(() => { if (drawer) setView('execution'); }, [drawer]);
  const workingRef = useRef(false);
  const [skillURL, setSkillURL] = useState(''), [skillPath, setSkillPath] = useState(''), [choices, setChoices] = useState<string[]>([]);
  const [templateTitle, setTemplateTitle] = useState('');
  const [draft, setDraft] = useState<Draft>({ title: '', content: '', description: '' });
  const [methodDirty, setMethodDirty] = useState(false);
  const [editRevision, setEditRevision] = useState(0);
  const [sourceId, setSourceId] = useState('');
  const [canvasTool, setCanvasTool] = useState<'select' | 'pan'>('select');
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(true), [inspectorOpen, setInspectorOpen] = useState(false);
  const [models, setModels] = useState<CanvasModel[]>([]);
  const [naturalRatios, setNaturalRatios] = useState<Record<string, number>>({});
  const [activeTurnId, setActiveTurnId] = useState('');
  const [selectedInstance, setSelectedInstance] = useState('');
  const [turnPositions, setTurnPositions] = useState<Record<string, TurnPosition>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(`sail-turn-positions:${project.id}`) || '{}');
      return Object.fromEntries(Object.entries(stored).filter(([, value]) => value && typeof value === 'object' && Number.isFinite((value as TurnPosition).x) && Number.isFinite((value as TurnPosition).y))) as Record<string, TurnPosition>;
    } catch { return {}; }
  });
  useEffect(() => { try { localStorage.setItem(`sail-turn-positions:${project.id}`, JSON.stringify(turnPositions)); } catch { /* The canvas remains usable without storage. */ } }, [project.id, turnPositions]);
  const initialTurnFit = useRef(false);
  const [nextMenu, setNextMenu] = useState<{ id: string; left: number; top: number } | null>(null);
  const [droppedReference, setDroppedReference] = useState<{ nodeId: string; at: number }>();
  const [previewId, setPreviewId] = useState<string>();
  const viewportElement = useRef<HTMLDivElement>(null), previewDialog = useRef<HTMLDialogElement>(null);
  const canvasActions = useRef({ menu: (_id: string, _point: { x: number; y: number }) => {}, size: (_id: string, _width: number, _height: number) => {}, resize: (_id: string, _width: number, _ratio: number, _position: { x: number; y: number }) => {} });
  const flow = useRef<ReactFlowInstance<FlowNode> | null>(null);
  const busy = working || disabled;
  const dirty = !!selected && Object.entries(draft).some(([key, value]) => selected[key as keyof Draft] !== value);
  const conflict = !!selected && selected.revision !== editRevision;
  const sources = useMemo<WorkbenchSource[]>(() => [
    ...(graph.files || []).map(a => ({ id: a.id, title: a.title, url: a.url, mediaType: a.mediaType })),
    ...project.assets.map(a => ({ id: a.id, title: a.name, url: a.url, mediaType: a.mime.startsWith('image/') ? 'image' as const : a.mime.startsWith('video/') ? 'video' as const : 'text' as const })),
    ...(project.storyboardGrids || []).map(a => ({ id: a.id, title: `${a.start}–${a.end} 秒连续分镜`, url: a.url, mediaType: 'image' as const })),
    ...(project.agentImages || []).map(a => ({ id: a.id, title: `图片 · ${a.prompt.slice(0, 45)}`, url: a.url, mediaType: 'image' as const, referenceAvailable: a.status === 'completed' })),
    ...project.generatedVideos.map(a => ({ id: a.id, title: `视频 · ${a.prompt.slice(0, 45)}`, url: a.url, mediaType: 'video' as const })),
    ...(project.composedVideos || []).map(a => ({ id: a.id, title: '剪辑成片', url: a.url, mediaType: 'video' as const })),
  ].filter((source, index, all) => all.findIndex(item => item.id === source.id) === index), [graph.files, project.assets, project.storyboardGrids, project.agentImages, project.generatedVideos, project.composedVideos]);
  const turnCanvas = useMemo(() => executionTurnCanvas(graph, project, sources, naturalRatios, turnPositions), [graph, project, sources, naturalRatios, turnPositions]);
  const turnMode = canvasMode === 'turns' && turnCanvas.turns.length > 0;
  const related = useMemo(() => {
    if (selectedId) return selectedCanvasRelations(graph, selectedId);
    if (!plan) return undefined;
    const ids = new Set(graph.nodes.filter(node => node.planId === plan.id).map(node => node.id));
    const visit = (id: string) => { const node = graph.nodes.find(item => item.id === id); for (const input of node?.inputs || []) if (!ids.has(input)) { ids.add(input); visit(input); } };
    [...ids].forEach(visit);
    for (const node of graph.nodes) if (node.sourceId && graph.nodes.some(step => step.planId === plan.id && step.methods?.some(method => method.referenceIds.includes(node.sourceId!)))) ids.add(node.id);
    return ids;
  }, [graph.nodes, plan, selectedId]);
  useEffect(() => {
    if (turnMode) {
      setNodes(previous => turnCanvas.items.map(entry => {
        const old = previous.find(node => node.id === entry.id);
        return { id: entry.id, type: 'experiment', position: old?.dragging ? old.position : entry.position, style: { width: entry.width }, selectable: entry.role !== 'heading', draggable: entry.role !== 'heading', connectable: entry.role !== 'heading', data: {
          item: entry.item, ratio: entry.ratio, role: entry.role, referenceId: entry.canonicalId || entry.item.sourceId,
          presentation: entry.role === 'input' ? { label: '本轮输入' } : experimentNodePresentation(entry.item, graph),
          onOpenCompleted: (id: string) => { setSelectedId(id); setInspectorOpen(false); setComposerOpen(true); },
          onPreview: () => setPreviewId(entry.id),
          onNextMenu: (_id: string, point: { x: number; y: number }) => { if (entry.canonicalId) canvasActions.current.menu(entry.canonicalId, point); else if (entry.role === 'output') canvasActions.current.menu(entry.stepId, point); else setNotice('这份参考图可以拖入创作面板，或连接到新一轮的输出节点。'); },
          onMediaSize: (_id: string, width: number, height: number) => { canvasActions.current.size(entry.id, width, height); canvasActions.current.size(entry.item.sourceId || entry.item.id, width, height); },
          onResize: (_id: string, width: number, ratio: number, position: { x: number; y: number }) => setTurnPositions(current => ({ ...current, [entry.id]: { ...position, width, ratio } })),
          onSettings: entry.role === 'output' ? () => { setSelectedId(entry.canonicalId || entry.stepId); setSelectedInstance(entry.id); setInspectorOpen(true); setComposerOpen(false); setDrawer(null); } : undefined,
          methodTitle: turnCanvas.turns.find(turn => turn.id === entry.turnId)?.method.title,
          adopted: entry.role === 'output' && graph.plans?.some(value => value.adopted && value.selectedArtifactId === entry.canonicalId),
        }, selected: entry.id === selectedInstance };
      }));
      return;
    }
    setNodes(previous => graph.nodes.map(item => {
    const old = previous.find(node => node.id === item.id), ratio = canvasNodeRatio(item, graph, project, naturalRatios[item.id]);
    const producer = item.kind === 'artifact' ? graph.nodes.find(node => node.kind === 'step' && item.inputs.includes(node.id)) : undefined;
    const mediaType = item.mediaType || (producer ? canvasOutputKind(graph, producer) : undefined);
    const displayed = mediaType === item.mediaType ? item : { ...item, mediaType };
    const visual = !!item.url && ['image', 'video'].includes(mediaType || '') || item.kind === 'artifact' && !item.content && ['image', 'video'].includes(mediaType || '');
    const width = item.display?.width || (visual ? ratio > 1.3 ? 320 : ratio < .8 ? 220 : 266 : 266);
    return { id: item.id, type: 'experiment', position: old?.dragging ? old.position : item.position, style: { width }, data: { item: displayed, ratio, presentation: experimentNodePresentation(item, graph),
      onOpenCompleted: (id: string) => { setSelectedId(id); setDrawer(null); setComposerOpen(true); setInspectorOpen(false); }, onPreview: setPreviewId,
      onNextMenu: (id, point) => canvasActions.current.menu(id, point), onMediaSize: (id, w, h) => canvasActions.current.size(id, w, h), onResize: (id, w, r, position) => canvasActions.current.resize(id, w, r, position),
      planTitle: graph.plans?.find(value => value.id === item.planId)?.title, methodTitle: graph.runs?.find(run => run.id === item.runId)?.method.title,
      dimmed: !!related && !related.has(item.id), related: !!related?.has(item.id), adopted: graph.plans?.some(value => value.adopted && value.selectedArtifactId === item.id) }, selected: item.id === selectedId };
    }));
  }, [graph.nodes, graph.plans, graph.runs, selectedId, related, naturalRatios, project.assets, project.agentImages, project.generatedVideos, turnMode, turnCanvas, selectedInstance]);
  useEffect(() => { let live = true; void api<CanvasStatus>('/api/status').then(status => { if (live) setModels(canvasModels(status)); }).catch(() => {}); return () => { live = false; }; }, []);
  useEffect(() => {
    if (!previewId || !previewDialog.current) return;
    const dialog = previewDialog.current, previousFocus = document.activeElement;
    dialog.showModal();
    return () => { dialog.querySelector('video')?.pause(); dialog.close(); if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, [previewId]);
  useEffect(() => {
    if (!nextMenu) return;
    const close = (event: PointerEvent) => { if (!(event.target instanceof Element) || !event.target.closest('.lab-next-menu,.lab-node-next')) setNextMenu(null); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setNextMenu(null); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); };
  }, [nextMenu]);
  const reloadEditor = useCallback((node: ExperimentNode) => { setDraft({ title: node.title, content: node.content, description: node.description }); setEditRevision(node.revision); setSourceId(''); }, []);
  useEffect(() => { const node = graph.nodes.find(n => n.id === selectedId); if (node) reloadEditor(node); }, [selectedId, reloadEditor]);
  useEffect(() => { if (selected && !dirty && selected.revision !== editRevision) reloadEditor(selected); }, [selected?.revision, dirty, editRevision, reloadEditor]);
  useEffect(() => { if (selected?.planId) setPlanId(selected.planId); setMethodDirty(false); }, [selectedId, selected?.planId]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (!active || !graph.nodes.length) return;
    if (turnMode && initialTurnFit.current) return;
    const timer = setTimeout(() => {
      if (turnMode) {
        const turn = turnCanvas.turns[0];
        if (turn && flow.current) { void flow.current.fitView({ nodes: turn.nodeIds.map(id => ({ id })), padding: .12, minZoom: .65, maxZoom: 1, duration: 0 }); setActiveTurnId(turn.id); initialTurnFit.current = true; }
      } else void flow.current?.fitView({ padding: .18, duration: 0, maxZoom: 1 });
    }, 100);
    return () => clearTimeout(timer);
  }, [active, graph.nodes.length, turnMode, turnCanvas.turns.length]);
  useEffect(() => {
    if (!overviewFocus) return;
    const timer = setTimeout(() => {
      const owned = turnCanvas.turns.filter(turn => turn.stepId === overviewFocus).at(-1);
      const ids = turnMode ? turnCanvas.items.filter(item => item.role === 'output' && (item.canonicalId === overviewFocus || item.turnId === owned?.id)).map(item => ({ id: item.id })) : [{ id: overviewFocus }];
      void flow.current?.fitView({ nodes: ids, padding: .45, minZoom: .65, maxZoom: 1, duration: 0 }); setOverviewFocus(undefined);
    }, 150);
    return () => clearTimeout(timer);
  }, [overviewFocus, canvasMode]);
  const run = async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    if (workingRef.current) return;
    workingRef.current = true; setWorking(true); setError('');
    try { return await work(); } catch (failure) { setError(failure instanceof Error ? failure.message : '操作未完成，请重试。'); return undefined; }
    finally { workingRef.current = false; setWorking(false); }
  };
  const saveOperation = async (operation: ExperimentOperation) => {
    const updated = await api<ExperimentGraph>(`/api/projects/${project.id}/agent/experiment`, { method: 'POST', body: JSON.stringify({ ...operation, expectedRevision: graphRef.current.revision }) });
    graphRef.current = updated; onGraph(updated); return updated;
  };
  const mutate = (operation: ExperimentOperation) => run(() => saveOperation(operation));
  const selectNode = (id: string) => { setSelectedId(id); setDrawer(null); setComposerOpen(true); setInspectorOpen(false); setNextMenu(null); };
  const showNextMenu = (id: string, point: { x: number; y: number }) => {
    if (busy) return;
    const bounds = viewportElement.current?.getBoundingClientRect(); if (!bounds) return;
    setNextMenu({ id, left: Math.max(8, Math.min(bounds.width - 256, point.x - bounds.left)), top: Math.max(8, Math.min(bounds.height - 340, point.y - bounds.top)) });
  };
  const nextFrom = async (id: string, kind: 'image' | 'video' | 'step') => {
    setNextMenu(null);
    const updated = await mutate({ op: 'canvas-next', sourceId: id, kind, model: models.find(item => item.kind === kind)?.id || '' });
    if (updated) { const next = updated.nodes.filter(node => node.kind === 'step').at(-1); if (next) { selectNode(next.id); setOverviewFocus(next.id); setPlanId(next.planId || ''); setNotice('已创建创作草稿并带入素材。写好要求后点击生成。'); } }
  };
  const connectFrom = async (sourceId: string, targetId: string) => {
    const current = graphRef.current, target = current.nodes.find(node => node.id === targetId), method = target && activeExperimentMethod(target);
    if (!method || sourceId === targetId) return;
    const reference = canvasReference(current, sourceId, sources);
    const next = reference ? addCanvasReference(method, reference) : { ...method, inputs: [...new Set([...method.inputs, sourceId])] };
    const updated = await mutate({ op: 'method', stepId: targetId, method: next });
    if (updated) { selectNode(targetId); setNotice('已连接到当前步骤。'); }
  };
  const organize = () => { if (turnMode) { setTurnPositions({}); return; } void mutate({ op: 'layout', dimensions: (flow.current?.getNodes() || []).map(node => ({ id: node.id, width: node.measured?.width || Number(node.style?.width) || 266, height: node.measured?.height || 266 })) }); };
  const uploadReference = onProjectUpdate ? (file: File) => run(async () => {
    await onBeforeChange?.();
    const body = new FormData(); body.append('file', file);
    const updated = await api<Project>(`/api/projects/${project.id}/assets/product`, { method: 'POST', body });
    onProjectUpdate(updated);
    const asset = updated.assets.find(item => !project.assets.some(old => old.id === item.id) && item.kind === 'product');
    if (!asset) throw new Error('素材已上传，请重新打开素材列表。');
    const nodeId = crypto.randomUUID();
    await saveOperation({ op: 'upsert', nodes: [{ id: nodeId, kind: 'asset', title: asset.name.slice(0, 120), sourceId: asset.id, status: 'completed', description: '', prompt: '', content: '', method: '', inputs: [], position: { x: (selected?.position.x || 0) - 390, y: (selected?.position.y || 0) + 340 } }] });
    const bound = await api<ExperimentGraph>(`/api/projects/${project.id}/agent/experiment/bind`, { method: 'POST', body: JSON.stringify({ stepId: nodeId, sourceId: asset.id }) });
    graphRef.current = bound; onGraph(bound);
    return { id: asset.id, title: asset.name, url: asset.url, mediaType: 'image' as const, referenceAvailable: true };
  }) : undefined;
  canvasActions.current = { menu: showNextMenu, size: (id, width, height) => {
    if (!width || !height) return; const ratio = Math.max(.1, Math.min(10, width / height));
    setNaturalRatios(previous => previous[id] === ratio ? previous : { ...previous, [id]: ratio });
  }, resize: (id, width, aspectRatio, position) => { if (!busy) void mutate({ op: 'resize', id, width: Math.max(160, Math.min(720, width)), aspectRatio: Math.max(.1, Math.min(10, aspectRatio)), position }); } };
  const branchPlan = async () => { if (!plan) return; const updated = await mutate({ op: 'branch-plan', planId: plan.id }); if (updated) { setPlanId(updated.plans!.at(-1)!.id); setSelectedId(undefined); setDrawer('plan'); setNotice('已创建尚未执行的备选方案，原方案与已有结果保留。'); } };
  const addPlan = async () => { const updated = await mutate({ op: 'plan', title: '新的制作方案', goal: '' }); if (updated) { setPlanId(updated.plans!.at(-1)!.id); setSelectedId(undefined); setDrawer('plan'); } };
  const fit = () => void flow.current?.fitView({ padding: 0.18, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240, maxZoom: 1 });
  const addNode = async (fromSelection = true) => {
    const id = crypto.randomUUID(), point = flow.current?.screenToFlowPosition({ x: window.innerWidth * 0.58, y: window.innerHeight * 0.46 }) || { x: 0, y: 0 };
    const updated = await mutate({ op: 'upsert', nodes: [{ id, planId: plan?.id || selected?.planId, kind: 'step', title: '新的制作步骤', method: '', description: '', prompt: '', content: '', status: 'planned', inputs: fromSelection && selected ? [selected.id] : [], position: point }] });
    if (updated) selectNode(id);
  };
  const addRecipe = async (recipe: typeof experimentRecipes[number]['id']) => {
    const updated = await mutate({ op: 'recipe', recipe });
    if (updated) { setPlanId(updated.plans!.at(-1)!.id); setDrawer('plan'); setNotice('已添加方案与制作路径，步骤将在实际执行后更新。'); }
  };
  const importSkill = () => run(async () => {
    const result = await api<{ graph?: ExperimentGraph; choices?: string[] }>(`/api/projects/${project.id}/agent/experiment/skill`, { method: 'POST', body: JSON.stringify({ url: skillURL, ...(skillPath ? { path: skillPath } : {}), ...(selected?.kind === 'skill' ? { nodeId: selected.id } : selected?.kind === 'step' ? { targetStepId: selected.id } : {}) }) });
    if (result.choices) { setChoices(result.choices); setNotice('仓库包含多个 Skill，请选择一个文件。'); return; }
    if (result.graph) { onGraph(result.graph); setDrawer(null); setChoices([]); setSkillPath(''); setNotice('Skill 已读取并固定版本，可以查看方法原文。'); }
  });
  const bind = () => run(async () => {
    if (!selected || !sourceId) return;
    const updated = await api<ExperimentGraph>(`/api/projects/${project.id}/agent/experiment/bind`, { method: 'POST', body: JSON.stringify({ stepId: selected.id, sourceId }) });
    onGraph(updated); setNotice('已连接真实素材与任务状态。');
  });
  const requestStep = (asDraft = false, requestedId = selectedId, currentGraph = graphRef.current) => {
    const node = currentGraph.nodes.find(item => item.id === requestedId);
    if (!node || node.kind !== 'step') return;
    const method = activeExperimentMethod(node), owner = currentGraph.plans?.find(item => item.id === node.planId);
    const activeProposal = activeExperimentProposal(currentGraph), route = activeProposal?.routes.find(item => item.id === owner?.routeId);
    const expected = node.routeStepIndex === undefined ? undefined : route?.steps[node.routeStepIndex];
    const model = models.find(item => item.id === method?.model);
    const selectedRoute = owner?.proposalId === activeProposal?.id && !!route && activeProposal!.selectedRouteIds.includes(route.id);
    const needsProposal = !selectedRoute || !!model && !!expected && (model.tool !== expected.tool || !!expected.model && expected.model !== method?.model);
    const prompt = `${needsProposal ? '这是我从画布发起的新创作请求。请先按当前实验深度规划路线，保留已有草稿与结果；在由用户选择的模式下，发布提案并等待我选择后再执行。' : '请执行我已选定路线中的当前步骤。'}\n方案：${owner?.title || currentGraph.title}\n目标：${owner?.goal || node.description}\n当前步骤：「${node.title}」（stepId：${node.id}）。\n使用已保存的方法「${method?.title || node.method}」（methodId：${method?.id || ''}）。先读取 get_creative 和 read_experiment_node，核对参数、上游输入与参考图。${method?.prompt ? `\n原始创作要求（保持原文）：\n${method.prompt}` : ''}${method?.referenceIds.length ? `\n参考图 ID（按顺序）：${method.referenceIds.join('、')}` : ''}${method?.model ? `\n模型：${method.model}` : ''}${method ? `\n已保存参数：${JSON.stringify(method.parameters)}` : ''}\n${needsProposal ? '将这里的提示词、模型、参数和真实素材带入对应路线；引用不支持直接使用的视频时，先规划提帧或其他适用方法。' : '只执行这个步骤，生成时传入 stepId，并使用当前保存的方法与参数。'}${owner?.basedOn ? '这是独立备选，保留原方案产物，不复用原产物冒充新结果。' : ''}新结果单独保留，缺少条件时说明。`;
    if (onExecute && !asDraft) { onExecute(prompt); setNotice('已将当前步骤交给 Agent 执行。'); }
    else { onDraft(prompt); setNotice('任务已填入对话输入框，可以补充要求后发送。'); }
  };
  const exportGraph = () => downloadBlob(new Blob([JSON.stringify({ format: 'sail-experiment-v2', project: { id: project.id, title: project.title }, ...graph }, null, 2)], { type: 'application/json' }), `sail-experiment-${project.id.slice(0, 8)}.json`);
  const completed = graph.nodes.filter(n => n.status === 'completed').length, stale = graph.nodes.filter(n => n.status === 'stale').length;
  const policyName = experimentLevel(graph.policy?.level ?? 0).name;
  const previewNode = turnCanvas.items.find(entry => entry.id === previewId)?.item || graph.nodes.find(node => node.id === previewId);
  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => setNodes(current => applyNodeChanges(changes, current)), []);

  return <section className={`experiment-workbench${view === 'execution' ? ' lab-media-canvas' : ''}`} aria-label="视频创作实验台">
    <header className="lab-toolbar">
      <nav className="lab-workbench-views" aria-label="实验台视图"><button type="button" aria-pressed={view === 'routes'} onClick={() => { setView('routes'); setDrawer(null); }}><GitBranch size={14} />路线提案{proposal && <span>{proposal.routes.length}</span>}</button><button type="button" aria-pressed={view === 'execution'} onClick={() => setView('execution')}><Workflow size={14} />执行画布{graph.nodes.length > 0 && <span>{graph.nodes.length}</span>}</button></nav>
      {!!graph.nodes.length && <span className="lab-workbench-stats" title={`${graph.title} · ${graph.nodes.length} 个节点 · ${completed} 已完成${stale ? ` · ${stale} 需要更新` : ''}`}>{turnMode ? `${turnCanvas.turns.length} 轮尝试` : <>{completed} 已完成{stale > 0 && <span> · {stale} 需更新</span>}</>}</span>}
      <div className="lab-toolbar-actions">
        <button type="button" className="lab-new-plan" aria-label="新建方案" title="新建方案" disabled={busy} onClick={() => void addPlan()}><Plus size={14} /><span>新建方案</span></button>
        <WorkbenchPopover className="lab-settings-menu" label={`实验设置：${policyName}`} summary={<><SlidersHorizontal size={14} /><span>{policyName}</span><ChevronDown size={12} /></>}>
          <ExperimentPolicyControl graph={graph} busy={busy} mutate={mutate} />
          <SkillReferenceBar projectId={project.id} graph={graph} onGraph={onGraph} onDraft={onDraft} disabled={busy} />
        </WorkbenchPopover>
        <WorkbenchPopover className="lab-actions-menu" label="更多实验操作" summary={<Ellipsis size={17} />} closeOnAction>
          <button type="button" disabled={busy} onClick={() => setDrawer(drawer === 'recipes' ? null : 'recipes')}><Plus size={14} />添加制作路径</button>
          <button type="button" disabled={busy} onClick={() => { setDrawer(drawer === 'skill' ? null : 'skill'); setChoices([]); setSkillPath(''); }}><Github size={14} />导入 Skill</button>
          <button type="button" disabled={busy || !graph.nodes.length} onClick={() => { setTemplateTitle(plan?.title || graph.title); setDrawer('save'); }}><Save size={14} />保存配方</button>
          <button type="button" onClick={() => setDrawer(drawer === 'templates' ? null : 'templates')}><BookOpen size={14} />已保存的配方</button>
          <button type="button" onClick={() => { initialTurnFit.current = false; setCanvasMode(mode => mode === 'turns' ? 'nodes' : 'turns'); }}>{canvasMode === 'turns' ? '查看完整依赖图' : '按轮次显示输入与输出'}</button>
        </WorkbenchPopover>
      </div>
    </header>
    {view === 'execution' && turnMode ? <div className="lab-plan-navigation lab-turn-navigation"><nav aria-label="尝试轮次">{turnCanvas.turns.map(turn => <button type="button" key={turn.id} aria-pressed={activeTurnId === turn.id} title={`Turn ${turn.index} · ${turn.title}`} onClick={() => { setActiveTurnId(turn.id); setSelectedId(undefined); setSelectedInstance(''); setDrawer(null); void flow.current?.fitView({ nodes: turn.nodeIds.map(id => ({ id })), padding: .12, minZoom: .65, maxZoom: 1, duration: 0 }); }}><span>Turn {turn.index}</span><small>{turn.title}</small></button>)}</nav></div> : view === 'execution' && !!graph.plans?.length && <div className="lab-plan-navigation">
      <nav aria-label="制作方案"><button type="button" aria-pressed={!plan} onClick={() => setPlanId('')}>全部节点</button>{graph.plans.map(item => <button type="button" key={item.id} title={item.goal || item.title} aria-pressed={item.id === planId} onClick={() => { setPlanId(item.id); setSelectedId(undefined); }}>{item.adopted ? <Check size={13} /> : <GitBranch size={13} />}<span>{item.title}</span></button>)}</nav>
      <div className="lab-plan-actions">{plan && <button type="button" title={plan.goal || '方案详情'} aria-label="方案详情" onClick={() => setDrawer('plan')}><FileText size={13} /><span>方案详情</span></button>}<button type="button" aria-label="比较方案" title="比较方案" onClick={() => setDrawer('compare')}><GitBranch size={13} /><span>比较方案</span></button></div>
    </div>}
    {view === 'execution' && !turnMode && untouchedAlternative && <div className="lab-message" role="status"><GitBranch size={14} /><span>{originalOutput ? '当前查看的是尚未执行的备选方案，原方案已有完成结果。' : '当前查看的是备选方案，尚未产生执行记录。'}</span>{originalOutput && <button type="button" onClick={() => selectNode(originalOutput.id)}>查看原方案结果<ArrowRight size={13} /></button>}</div>}
    {error && <div className="lab-message lab-error" role="alert"><span>{error}</span><button type="button" aria-label="关闭错误提示" onClick={() => setError('')}><X size={14} /></button></div>}
    {notice && <div className="lab-message" role="status"><Check size={14} /><span>{notice}</span></div>}
    {view === 'routes' ? <div className="lab-route-stage"><ExperimentRoutes graph={graph} busy={busy} mutate={mutate} onDraft={onDraft} onExecute={onExecute} onExecution={() => { setView('execution'); setSelectedId(undefined); }} /></div> : <div className={`lab-stage${selected && inspectorOpen ? ' has-inspector' : ''}`}>
      <div className="lab-viewport" ref={viewportElement}>
        {!graph.nodes.length ? <div className="lab-welcome">
          <div className="lab-welcome-symbol"><FlaskConical size={30} strokeWidth={1.4} /></div>
          <h2>让灵感，先做一次实验。</h2>
          <p>在对话中描述目标，让 Agent 探索制作路线。也可以从一种熟悉的方法开始。</p>
          <div className="lab-recipe-grid">{experimentRecipes.map(recipe => { const Icon = recipeIcons[recipe.id]; return <button type="button" disabled={busy} key={recipe.id} onClick={() => void addRecipe(recipe.id)}><Icon size={20} strokeWidth={1.5} /><span><strong>{recipe.title}</strong><small>{recipe.subtitle}</small></span><ArrowRight size={15} /></button>; })}</div>
          <div className="lab-welcome-bottom"><span>也可以直接在对话中描述目标，让 Agent 自己组织路径。</span><button type="button" disabled={busy} onClick={() => setDrawer('skill')}><Github size={14} />从 GitHub Skill 开始</button></div>
        </div> : <ReactFlow<FlowNode>
          nodes={nodes} edges={turnMode ? turnCanvas.edges.map(edge => ({ ...edge, style: { stroke: '#879b91', strokeWidth: 1.4 } })) : graph.nodes.flatMap(n => n.inputs.map(id => ({ id: `${id}--${n.id}`, source: id, target: n.id, type: 'default', animated: n.status === 'running', style: { stroke: n.status === 'stale' ? '#c0a16e' : n.status === 'running' || selectedId && related?.has(n.id) && related.has(id) ? '#9acbf5' : '#747b82', opacity: selectedId && (!related?.has(n.id) || !related.has(id)) ? .2 : 1, strokeWidth: 1.6, strokeDasharray: n.status === 'stale' ? '5 5' : undefined } })))}
          nodeTypes={nodeTypes} onInit={instance => { flow.current = instance; }} onNodesChange={onNodesChange}
          onNodeClick={(_, node) => {
            if (!turnMode) { selectNode(node.id); return; }
            const entry = turnCanvas.items.find(item => item.id === node.id); if (!entry || entry.role === 'heading') return;
            setActiveTurnId(entry.turnId); setSelectedInstance(entry.id);
            if (entry.role === 'input' && entry.item.url && entry.item.mediaType !== 'text') { setSelectedId(undefined); setPreviewId(entry.id); }
            else selectNode(entry.canonicalId || entry.stepId);
          }} onPaneClick={() => { setSelectedId(undefined); setSelectedInstance(''); setNextMenu(null); }}
          onNodeDragStop={(event, node, draggedNodes) => {
            const point = 'changedTouches' in event ? event.changedTouches[0] : event;
            const panel = viewportElement.current?.querySelector('.lab-floating-composer[data-composer-step]')?.getBoundingClientRect();
            if (composerOpen && composerTarget && panel && point && point.clientX >= panel.left && point.clientX <= panel.right && point.clientY >= panel.top && point.clientY <= panel.bottom && node.id !== composerTarget.id) {
              const entry = turnCanvas.items.find(item => item.id === node.id);
              setDroppedReference({ nodeId: turnMode ? entry?.canonicalId || entry?.item.sourceId || node.id : node.id, at: performance.now() }); setNodes(current => current.map(item => ({ ...item, position: turnMode ? turnCanvas.items.find(saved => saved.id === item.id)?.position || item.position : graphRef.current.nodes.find(saved => saved.id === item.id)?.position || item.position }))); return;
            }
            if (!busy) {
              const moved = draggedNodes.length ? draggedNodes : [node];
              if (turnMode) setTurnPositions(current => ({ ...current, ...Object.fromEntries(moved.map(item => [item.id, { ...current[item.id], ...item.position }])) }));
              else void mutate({ op: 'move', positions: moved.map(item => ({ id: item.id, position: item.position })) });
            }
          }}
          onConnect={connection => {
            if (busy || !connection.source || !connection.target) return;
            if (!turnMode) { void connectFrom(connection.source, connection.target).catch(failure => setError(failure instanceof Error ? failure.message : '连接失败。')); return; }
            const source = turnCanvas.items.find(item => item.id === connection.source), target = turnCanvas.items.find(item => item.id === connection.target);
            if (!source || !target || target.role !== 'output') return;
            if (turnCanvas.turns.find(turn => turn.id === target.turnId)?.runId) { setNotice('这一轮已有执行记录。点击输出节点的 +，创建备选做法后再连接素材。'); return; }
            void connectFrom(source.canonicalId || source.item.sourceId || source.item.id, target.stepId).catch(failure => setError(failure instanceof Error ? failure.message : '连接失败。'));
          }}
          nodesDraggable={!busy && canvasTool === 'select'} nodesConnectable={!busy && canvasTool === 'select'} panOnDrag={canvasTool === 'pan' ? true : [1, 2]} selectionOnDrag={canvasTool === 'select'} onMoveEnd={(_, viewport) => setCanvasZoom(viewport.zoom)} colorMode="dark" connectionLineStyle={{ stroke: '#9acbf5', strokeWidth: 1.8 }} edgesReconnectable={false} deleteKeyCode={null} minZoom={0.2} maxZoom={1.5} fitView={!turnMode} defaultViewport={{ x: 60, y: 40, zoom: .85 }} fitViewOptions={{ padding: 0.18, maxZoom: 1 }} proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={.7} color="#414141" bgColor="#191919" />
          {minimapOpen && <MiniMap<FlowNode> pannable zoomable nodeColor={n => n.data.item.kind === 'skill' ? '#67665c' : n.data.item.kind === 'artifact' ? '#6e8496' : '#5c6065'} bgColor="#222222" maskColor="#111111b3" />}
        </ReactFlow>}
        {!!graph.nodes.length && <>
          <div className="lab-canvas-tools" role="toolbar" aria-label="画布工具">
            <button type="button" className="lab-canvas-add" disabled={busy} onClick={event => { if (selected) { const rect = event.currentTarget.getBoundingClientRect(); showNextMenu(selected.id, { x: rect.left, y: rect.top - 340 }); } else void addNode(false); }} title="添加制作步骤" aria-label="添加制作步骤"><Plus size={22} strokeWidth={1.6} /></button>
            <button type="button" aria-pressed={canvasTool === 'select'} onClick={() => setCanvasTool('select')} title="选择与移动节点" aria-label="选择与移动节点"><MousePointer2 size={18} strokeWidth={1.6} /></button>
            <button type="button" aria-pressed={canvasTool === 'pan'} onClick={() => setCanvasTool('pan')} title="平移画布" aria-label="平移画布"><Hand size={18} strokeWidth={1.6} /></button>
            <button type="button" onClick={fit} title="适应画布" aria-label="适应画布"><Maximize2 size={18} strokeWidth={1.6} /></button>
            <span className="lab-canvas-divider" />
            <WorkbenchPopover className="lab-canvas-more" label="更多画布操作" summary={<Ellipsis size={18} />} closeOnAction><button type="button" disabled={busy} onClick={() => setDrawer('recipes')}><Workflow size={15} />添加制作路径</button><button type="button" disabled={busy} onClick={() => { setDrawer('skill'); setChoices([]); setSkillPath(''); }}><Github size={15} />导入 Skill</button><button type="button" onClick={() => setDrawer('templates')}><BookOpen size={15} />已保存的配方</button><button type="button" disabled={busy} onClick={organize}><Boxes size={15} />自动整理节点</button><button type="button" onClick={exportGraph}><ArrowDownToLine size={15} />导出实验台</button></WorkbenchPopover>
          </div>
          <div className="lab-canvas-zoom" role="group" aria-label="缩放与导航">
            <button type="button" onClick={() => void flow.current?.zoomOut()} title="缩小" aria-label="缩小"><Minus size={15} /></button>
            <button type="button" className="lab-canvas-zoom-value" onClick={() => void flow.current?.zoomTo(1)} title="恢复 100% 缩放">{Math.round(canvasZoom * 100)}%</button>
            <button type="button" onClick={() => void flow.current?.zoomIn()} title="放大" aria-label="放大"><Plus size={15} /></button>
            <button type="button" onClick={fit} title="适应画布" aria-label="适应画布"><Maximize2 size={15} /></button>
            <button type="button" aria-pressed={minimapOpen} onClick={() => setMinimapOpen(value => !value)} title="切换小地图" aria-label="切换小地图"><MapIcon size={15} /></button>
          </div>
        </>}
        {!!graph.nodes.length && <div className="lab-canvas-hint">{canvasTool === 'pan' ? '拖动平移画布 · 滚轮缩放' : '拖动节点 · 框选多个节点 · 拖动 + 连接'}</div>}
        {nextMenu && <div className="lab-next-menu" style={{ left: nextMenu.left, top: nextMenu.top }} role="region" aria-label="选择下一步"><header><strong>下一步做什么</strong><button type="button" aria-label="关闭下一步菜单" onClick={() => setNextMenu(null)}><X size={13} /></button></header>
          <button type="button" disabled={busy || !models.some(model => model.kind === 'image') || graph.nodes.find(node => node.id === nextMenu.id)?.mediaType === 'video'} onClick={() => void nextFrom(nextMenu.id, 'image')}><Image size={17} /><span>继续创作图片<small>带入当前图片与输入关系</small></span></button>
          <button type="button" disabled={busy || !models.some(model => model.kind === 'video')} onClick={() => void nextFrom(nextMenu.id, 'video')}><Film size={17} /><span>制作视频<small>创建视频步骤与结果占位</small></span></button>
          <button type="button" disabled={busy} onClick={() => { const node = graph.nodes.find(item => item.id === nextMenu.id); const step = node?.kind === 'step' ? node : graph.nodes.find(item => item.kind === 'step' && node?.inputs.includes(item.id)); const recorded = graph.runs?.find(run => run.id === node?.runId); setNextMenu(null); if (step) void mutate(recorded ? { op: 'method', stepId: step.id, method: { ...structuredClone(recorded.method), id: crypto.randomUUID(), title: `备选方法 ${(step.methods?.length || 0) + 1}` } } : { op: 'branch-method', stepId: step.id }).then(updated => { if (updated) { selectNode(step.id); setOverviewFocus(step.id); } }); else void nextFrom(nextMenu.id, 'step'); }}><GitBranch size={17} /><span>再试一次<small>沿用这一轮输入，保留已有结果</small></span></button>
          <button type="button" onClick={() => { const node = graph.nodes.find(item => item.id === nextMenu.id); const step = node?.kind === 'step' ? node : graph.nodes.find(item => item.kind === 'step' && node?.inputs.includes(item.id)); setPlanId(node?.planId || ''); setNextMenu(null); if (step) { selectNode(step.id); setDrawer('methods'); } else setDrawer('compare'); }}><Layers size={17} /><span>比较方案与结果<small>并排查看真实产物</small></span></button>
          <details><summary>连接到已有步骤<ChevronDown size={12} /></summary><div>{graph.nodes.filter(node => node.kind === 'step' && node.id !== nextMenu.id).map(node => <button type="button" key={node.id} disabled={busy} onClick={() => void connectFrom(nextMenu.id, node.id).then(() => setNextMenu(null)).catch(failure => setError(failure instanceof Error ? failure.message : '连接失败。'))}><Link2 size={12} /><span>{node.title}</span></button>)}{!graph.nodes.some(node => node.kind === 'step' && node.id !== nextMenu.id) && <p>先添加一个制作步骤。</p>}</div></details>
        </div>}
        {selected && composerOpen && !inspectorOpen && !drawer && <ExperimentCanvasComposer projectId={project.id} selected={selected} step={composerTarget} graph={graph} sources={sources} models={models} busy={busy || !!graph.runs?.some(run => run.stepId === composerTarget?.id && run.status === 'running')} dropped={droppedReference} mutate={mutate} onExecute={(id, updated) => requestStep(false, id, updated)} onDetails={() => { setInspectorOpen(true); setComposerOpen(false); }} onClose={() => setComposerOpen(false)} onNext={(id, kind) => void nextFrom(id, kind)} onUpload={uploadReference} onDirty={setMethodDirty} />}
        {selected && !composerOpen && !inspectorOpen && <button type="button" className="lab-open-composer" onClick={() => setComposerOpen(true)}><Sparkles size={14} />打开创作面板</button>}
      </div>
      {selected && inspectorOpen && <aside className="lab-inspector" aria-label="节点详情">
        <header><span>{experimentKindLabels[selected.kind]}</span><button type="button" className="lab-icon-button" onClick={() => { setInspectorOpen(false); setComposerOpen(true); }}>回到创作</button><button type="button" className="lab-icon-button" onClick={() => setInspectorOpen(false)} aria-label="关闭节点详情"><X size={17} /></button></header>
        <div className="lab-inspector-scroll">
          <div className="lab-inspector-heading"><h2>{selected.title}</h2><span className={`lab-status lab-status-${selected.status}`}>{selectedPresentation?.label}</span></div>
          {selectedPresentation?.hint && <p className="lab-help">{selectedPresentation.hint}</p>}
          {selectedPresentation?.completedArtifactId && <button type="button" className="lab-link-button" onClick={() => selectNode(selectedPresentation.completedArtifactId!)}>查看已有完成结果<ArrowRight size={13} /></button>}
          {selected.kind === 'step' && <div className="lab-step-actions lab-step-run"><button type="button" className="lab-primary" disabled={busy || dirty || methodDirty || conflict || graph.runs?.some(run => run.stepId === selected.id && run.status === 'running')} onClick={() => requestStep()}><Sparkles size={14} />{onExecute ? '执行当前步骤' : '将任务填入对话'}</button>{dirty || methodDirty ? <span className="lab-help">请先保存修改，再执行。</span> : <span className="lab-help">使用已保存的「{activeExperimentMethod(selected)?.title || selected.method}」执行，结果单独保留。</span>}{onExecute && <button type="button" disabled={busy || dirty || methodDirty || conflict} onClick={() => requestStep(true)}>先编辑执行要求</button>}</div>}
          <label>所属方案<select value={selected.planId || ''} disabled={busy || dirty || methodDirty || !!selected.runId} onChange={event => { if (event.target.value) void mutate({ op: 'assign-plan', planId: event.target.value, nodeIds: [selected.id] }); }}><option value="">共享素材 / 尚未归入方案</option>{graph.plans?.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          {selected.planId && <button type="button" className="lab-link-button" onClick={() => { setPlanId(selected.planId!); setDrawer('plan'); }}>查看方案目标与全部步骤<ArrowRight size={13} /></button>}
          {selected.status === 'stale' && <p className="lab-stale-note">上游输入或制作方法已改变。已有结果仍然保留，请重新检查并执行受影响的步骤。</p>}
          {selected.error && <p className="lab-stale-note">{selected.error}</p>}
          {selected.kind === 'compare' ? <div className="lab-comparisons">{selected.inputs.map(id => {
            const option = graph.nodes.find(n => n.id === id);
            if (!option) return null;
            const outputs = graph.nodes.filter(n => n.inputs.includes(id) && n.kind === 'artifact');
            return <section key={id}><button type="button" onClick={() => setSelectedId(id)}><GitBranch size={14} />{option.title}<ArrowRight size={14} /></button><p>{option.method || '待选择制作方法'}</p><span className={`lab-status lab-status-${option.status}`}>{experimentStatusLabels[option.status]}</span>{outputs.map(output => output.url ? output.mediaType === 'video' ? <video controls preload="metadata" key={output.id} src={output.url} /> : <img key={output.id} src={output.url} alt={output.title} /> : <p key={output.id}>{output.content || experimentStatusLabels[output.status]}</p>)}<button type="button" disabled={busy || selected.inputs.some(inputId => graph.nodes.find(n => n.id === inputId)?.status !== 'completed')} onClick={() => void mutate({ op: 'patch', id: selected.id, changes: { selectedInput: id, status: 'completed', description: `已选用「${option.title}」` } })}>{selected.selectedInput === id ? <Check size={13} /> : <GitBranch size={13} />}{selected.selectedInput === id ? '已选用此方案' : '选用此方案'}</button></section>;
          })}</div> : <>
            <label>节点名称<input value={draft.title} maxLength={120} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} /></label>
            <label>{selected.kind === 'skill' ? '说明' : '目标与约束'}<textarea rows={3} value={draft.description} maxLength={2000} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} placeholder="写清这一步要解决什么。" /></label>
            {(selected.kind === 'artifact' || selected.kind === 'asset') && <label>{selected.kind === 'artifact' ? '文本 / 代码结果' : '素材与创作说明'}<textarea rows={6} value={draft.content} readOnly={!!selected.runId} maxLength={30000} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))} placeholder="脚本、分析、代码或明确的创作输入。" />{selected.runId && <span>保留本次执行的原始内容；修改做法后会创建新的独立产物。</span>}</label>}
            {conflict && <div className="lab-conflict">这个节点已被更新。<button type="button" onClick={() => reloadEditor(selected)}>重新读取</button></div>}
            <button type="button" className="lab-primary lab-save-edit" disabled={busy || !dirty || conflict || !draft.title.trim()} onClick={async () => { const updated = await mutate({ op: 'patch', id: selected.id, changes: draft }); const n = updated?.nodes.find(n => n.id === selected.id); if (n) { reloadEditor(n); setNotice('节点已保存，受影响的结果会提示更新。'); } }}><Check size={14} />保存修改</button>
          </>}
          {selected.kind === 'step' && <ExperimentMethodEditor key={selected.id} node={selected} graph={graph} sources={sources} busy={busy || dirty} mutate={mutate} onDirty={setMethodDirty} />}
          {selected.runId && graph.runs?.find(run => run.id === selected.runId) && <ExperimentRunDetails run={graph.runs.find(run => run.id === selected.runId)!} graph={graph} sources={sources} onSelect={selectNode} />}
          {selected.kind === 'artifact' && selected.planId && <button type="button" className="lab-primary lab-adopt-button" disabled={busy || selected.status !== 'completed' || (!selected.sourceId && !selected.content.trim()) || graph.plans?.some(item => item.adopted && item.selectedArtifactId === selected.id)} onClick={async () => { const updated = await mutate({ op: 'adopt-artifact', planId: selected.planId!, artifactId: selected.id }); if (updated) setNotice('已采用这份产物，后续创作可继续使用；受影响的已有步骤会提示更新。'); }}><Check size={14} />{graph.plans?.some(item => item.adopted && item.selectedArtifactId === selected.id) ? '已采用此产物' : '采用此产物'}</button>}
          {selected.skill && <section className="lab-skill-details"><h3>方法来源</h3><a href={selected.skill.url} target="_blank" rel="noreferrer">{selected.skill.repository}<ExternalLink size={13} /></a><code>{selected.skill.commit}</code><p>{selected.skill.path}</p><details><summary>查看 SKILL.md 原文</summary><pre>{selected.skill.content}</pre></details><button type="button" disabled={busy} onClick={() => { setSkillURL(selected.skill!.url); setSkillPath(''); setChoices([]); setDrawer('skill'); }}><Github size={14} />更换 Skill</button><small>已读取方法文件。执行所需的工具、依赖和服务由具体步骤核对。</small></section>}
          {selected.url && <section className="lab-result-preview"><h3>真实素材 / 产物</h3>{selected.mediaType === 'video' ? <video src={selected.url} controls preload="metadata" /> : selected.mediaType === 'image' ? <img src={selected.url} alt={selected.title} /> : <a href={selected.url} target="_blank" rel="noreferrer">打开文件<ExternalLink size={13} /></a>}</section>}
          <section className="lab-inputs"><h3>上游输入 <span>{selected.inputs.length}</span></h3>{selected.inputs.length ? selected.inputs.map(id => { const input = graph.nodes.find(n => n.id === id); return input ? <div key={id}><button type="button" onClick={() => setSelectedId(id)}><Link2 size={13} /><span>{input.title}</span></button><button type="button" disabled={busy} aria-label={`断开${input.title}`} onClick={() => void mutate({ op: 'patch', id: selected.id, changes: { inputs: selected.inputs.filter(value => value !== id) } })}><X size={12} /></button></div> : null; }) : <p>这是一个流程起点。拖动画布上的连接圆点可添加依赖。</p>}</section>
          {['asset', 'step', 'artifact'].includes(selected.kind) && <section className="lab-bind"><h3>连接已有素材或产物</h3><select aria-label="选择当前创意素材" value={sourceId} onChange={e => setSourceId(e.target.value)}><option value="">选择当前创意里的真实结果</option>{sources.map(source => <option key={source.id} value={source.id}>{source.title}</option>)}</select><button type="button" disabled={busy || !sourceId} onClick={() => void bind()}><Link2 size={14} />连接到此节点</button></section>}
          {selected.kind !== 'compare' && selected.kind !== 'skill' && !!selected.content && !selected.sourceId && selected.status !== 'completed' && <button type="button" disabled={busy || dirty} onClick={() => void mutate({ op: 'patch', id: selected.id, changes: { status: 'completed' } })}><CheckCheck size={14} />确认这份文本输入 / 结果</button>}
          {selected.kind === 'step' && <section className="lab-step-results"><div className="lab-section-title"><h3>执行记录与独立产物</h3><button type="button" onClick={() => setDrawer('methods')}>比较方法<ArrowRight size={13} /></button></div>{(graph.runs || []).filter(run => run.stepId === selected.id).slice().reverse().map(run => <div className="lab-run-row" key={run.id}><div><strong>{run.method.title}</strong><span className={`lab-status lab-status-${run.status}`}>{experimentStatusLabels[run.status]}</span></div><small>{new Date(run.startedAt).toLocaleString('zh-CN')}</small>{run.artifactIds.map(id => { const output = graph.nodes.find(node => node.id === id); return output && <button type="button" key={id} onClick={() => selectNode(id)}>{output.url && output.mediaType === 'image' && <img src={output.url} alt="" />}<span>{output.title}</span><ArrowRight size={12} /></button>; })}{run.error && <p className="lab-help">{run.error}</p>}</div>)}{!graph.runs?.some(run => run.stepId === selected.id) && <p className="lab-help">每次执行都会保存当时的方法与参考图，产物单独成节点。</p>}</section>}
          {selected.kind === 'step' && <div className="lab-step-actions"><button type="button" disabled={busy || dirty || methodDirty} onClick={() => void branchPlan()}><GitBranch size={14} />创建整套备选方案</button><button type="button" disabled={busy || dirty || methodDirty} onClick={() => { setSkillPath(''); setChoices([]); setDrawer('skill'); }}><Github size={14} />为此步骤连接 Skill</button></div>}
          <button type="button" className="lab-remove" disabled={busy || !!selected.runId || graph.runs?.some(run => run.stepId === selected.id || run.method.inputs.includes(selected.id))} title={selected.runId || graph.runs?.some(run => run.stepId === selected.id || run.method.inputs.includes(selected.id)) ? '保留有执行记录的节点以追溯产物' : undefined} onClick={async () => { const updated = await mutate({ op: 'remove', id: selected.id }); if (updated) setSelectedId(undefined); }}><Trash2 size={13} />移除此节点</button>
        </div>
        <footer className="lab-inspector-footer">节点 v{selected.revision} · {selected.id.slice(0, 12)}</footer>
      </aside>}
      {drawer && <aside className={`lab-drawer${drawer === 'compare' || drawer === 'methods' ? ' lab-drawer-wide' : ''}`} aria-label={drawer === 'plan' ? '方案详情' : drawer === 'compare' ? '比较方案' : drawer === 'methods' ? '比较方法' : drawer === 'skill' ? '导入 GitHub Skill' : drawer === 'save' ? '保存流程配方' : drawer === 'templates' ? '已保存配方' : '添加制作路径'}>
        <header><h2>{drawer === 'plan' ? '方案目标、步骤与产物' : drawer === 'compare' ? '比较方案与产物' : drawer === 'methods' ? '比较方法与执行结果' : drawer === 'skill' ? '把一种新方法，放上实验台。' : drawer === 'save' ? '让这次探索成为下次的起点。' : drawer === 'templates' ? '你的流程配方' : '选择这次创作的起点'}</h2><button type="button" className="lab-icon-button" onClick={() => setDrawer(null)} aria-label="关闭面板"><X size={18} /></button></header>
        {drawer === 'plan' && plan && <ExperimentPlanEditor key={plan.id} plan={plan} graph={graph} busy={busy} mutate={mutate} onSelect={selectNode} onAddStep={() => { setSelectedId(undefined); setDrawer(null); void addNode(false); }} onBranch={() => void branchPlan()} onCompare={() => setDrawer('compare')} />}
        {(drawer === 'compare' || drawer === 'methods') && <ExperimentComparisons graph={graph} plan={drawer === 'compare' ? plan : undefined} step={drawer === 'methods' && selected?.kind === 'step' ? selected : undefined} busy={busy} mutate={mutate} onSelect={selectNode} />}
        {drawer === 'recipes' && <><p>这些路径用于开始规划。Agent 可以按任务增删、重组步骤。</p><div className="lab-recipe-list">{experimentRecipes.map(recipe => { const Icon = recipeIcons[recipe.id]; return <button type="button" disabled={busy} key={recipe.id} onClick={() => void addRecipe(recipe.id)}><Icon size={20} /><span><strong>{recipe.title}</strong><small>{recipe.steps.join(' → ')}</small></span><Plus size={15} /></button>; })}</div></>}
        {drawer === 'skill' && <form onSubmit={e => { e.preventDefault(); void importSkill(); }}><p>{selected?.kind === 'skill' ? `替换「${selected.title}」的方法版本，保留已有结果并标记受影响的下游。` : selected?.kind === 'step' ? `读取后会连接到「${selected.title}」。` : '粘贴公开 GitHub 仓库或 SKILL.md 链接，读取方法并固定到具体版本。'}</p><label>GitHub 地址<input type="url" required placeholder="https://github.com/owner/repo" value={skillURL} onChange={e => { setSkillURL(e.target.value); setChoices([]); setSkillPath(''); }} /></label>{choices.length ? <label>选择 Skill 文件<select required value={skillPath} onChange={e => setSkillPath(e.target.value)}><option value="">这个仓库中找到 {choices.length} 个 Skill</option>{choices.map(path => <option key={path} value={path}>{path}</option>)}</select></label> : <label>Skill 文件路径 <span>可选</span><input value={skillPath} placeholder="skills/my-workflow/SKILL.md" onChange={e => setSkillPath(e.target.value)} /></label>}<button type="submit" className="lab-primary" disabled={busy || !skillURL || (!!choices.length && !skillPath)}>{working ? <LoaderCircle size={15} className="lab-spin" /> : <Github size={15} />}读取并添加 Skill</button><small>保留来源、文件原文与 commit。导入后可查看、连接或更换。</small></form>}
        {drawer === 'save' && <form onSubmit={async e => { e.preventDefault(); const updated = await mutate({ op: 'freeze', title: templateTitle, planId: plan?.id }); if (updated) { setDrawer('templates'); setNotice(updated.templates.at(-1)?.verified ? '已保存有完成记录的流程。' : '已保存流程草稿，尚未完成的步骤会保留。'); } }}><p>{plan ? `保存「${plan.title}」的目标、步骤、备选方法、输入关系与 Skill 版本。` : '保存全部方案的目标、步骤、备选方法、输入关系与 Skill 版本。'}复用时创建新方案，重新连接素材和生成结果。</p><label>配方名称<input value={templateTitle} required maxLength={120} onChange={e => setTemplateTitle(e.target.value)} /></label><button type="submit" className="lab-primary" disabled={busy || !templateTitle.trim()}><Save size={15} />保存当前流程</button><small>步骤完成且存在真实产物时标为“已跑通”；尚未完成的流程保存为草稿。历史失败结果会保留。</small></form>}
        {drawer === 'templates' && <div className="lab-templates">{!graph.templates.length ? <p>成功的方法值得留下。打开一个流程，点击“保存配方”。</p> : graph.templates.map(template => <section key={template.id}><div><BookOpen size={18} /><strong>{template.title}</strong></div><p>{template.nodes.length} 个节点 · {template.verified ? '已跑通' : '流程草稿'} · {new Date(template.createdAt).toLocaleDateString('zh-CN')}</p><button type="button" disabled={busy} onClick={async () => { const updated = await mutate({ op: 'instantiate', templateId: template.id }); if (updated) { setPlanId(updated.plans!.at(-1)!.id); setSelectedId(undefined); setDrawer(null); setNotice('已创建新方案，请连接新素材并继续执行。'); } }}>复用这份配方<ArrowRight size={14} /></button></section>)}</div>}
      </aside>}
    </div>}
    {previewNode?.url && <dialog className="lab-media-preview-dialog" ref={previewDialog} onCancel={event => { event.preventDefault(); setPreviewId(undefined); }} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setPreviewId(undefined); } }}><header><div><strong>{previewNode.title}</strong><span>关闭后返回原画布位置</span></div><a href={previewNode.url} target="_blank" rel="noreferrer" aria-label="打开原始素材"><ExternalLink size={15} /></a><button type="button" aria-label="关闭素材预览" onClick={() => setPreviewId(undefined)}><X size={18} /></button></header>{previewNode.mediaType === 'video' ? <video src={previewNode.url} controls playsInline preload="metadata" /> : <img src={previewNode.url} alt={previewNode.title} />}</dialog>}
    <footer className="lab-footer"><span><span className="lab-live-dot" />{working ? '正在保存…' : dirty || methodDirty ? '当前节点或方法有未保存的修改' : '与当前创意一起保存'}</span><span>{graph.nodes.length ? '方案 → 步骤 → 方法 + 输入 → 独立产物' : 'Agent 自由探索 · 画布记录关系'}</span></footer>
  </section>;
}
