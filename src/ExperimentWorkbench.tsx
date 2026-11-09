import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Background, BackgroundVariant, Controls, Handle, MiniMap, Position, ReactFlow, applyNodeChanges, type Node, type NodeProps, type NodeChange, type ReactFlowInstance } from '@xyflow/react';
import { ArrowDownToLine, ArrowRight, BookOpen, Boxes, Check, CheckCheck, ChevronDown, Code2, ExternalLink, FileText, Film, FlaskConical, GitBranch, GitFork as Github, Image, Layers, LayoutGrid, Link2, LoaderCircle, Maximize2, Plus, Save, Sparkles, Trash2, Workflow, X } from 'lucide-react';
import type { Project } from '../shared/domain';
import { activeExperimentMethod, emptyExperiment, normalizeExperimentGraph, experimentKindLabels, experimentRecipes, experimentStatusLabels, type ExperimentGraph, type ExperimentNode, type ExperimentOperation } from '../shared/experiment';
import { ExperimentComparisons, ExperimentMethodEditor, ExperimentPlanEditor, ExperimentRunDetails, type WorkbenchSource } from './ExperimentPlans';
import { api, downloadBlob } from './api';
import '@xyflow/react/dist/style.css';
import './experiment-workbench.css';

const kindIcons = { asset: Image, step: Workflow, skill: Github, artifact: Film, compare: GitBranch };
type FlowNode = Node<{ item: ExperimentNode; planTitle?: string; methodTitle?: string; dimmed?: boolean; related?: boolean; adopted?: boolean }, 'experiment'>;

function ExperimentCard({ data, selected }: NodeProps<FlowNode>) {
  const n = data.item, Icon = kindIcons[n.kind];
  return <article className={`lab-node lab-node-${n.kind}${selected ? ' is-selected' : ''}${data.dimmed ? ' is-dimmed' : ''}${data.related ? ' is-related' : ''}`} data-status={n.status}>
    <Handle type="target" position={Position.Left} />
    <header><span className="lab-node-kind"><Icon size={14} />{experimentKindLabels[n.kind]}</span><span className={`lab-status lab-status-${n.status}`}>{n.status === 'running' && <LoaderCircle size={11} className="lab-spin" />}{experimentStatusLabels[n.status]}</span></header>
    <h3>{n.title}</h3>
    {data.adopted && <div className="lab-adopted"><Check size={12} />已采用的产物</div>}
    {n.kind === 'compare' && n.selectedInput && <div className="lab-node-method"><Check size={12} />已选定制作方案</div>}
    {n.url && n.mediaType === 'image' ? <img className="lab-node-image" src={n.url} alt={n.title} loading="lazy" />
      : n.url && n.mediaType === 'video' ? <video className="lab-node-image nodrag nowheel" src={n.url} controls preload="metadata" />
      : n.skill ? <div className="lab-skill-source"><Github size={22} /><div><strong>{n.skill.repository}</strong><code>{n.skill.commit.slice(0, 9)} · 版本已固定</code></div></div>
      : <p className="lab-node-excerpt">{n.content || n.prompt || n.description || (n.kind === 'step' ? '添加制作方法与输入，由 Agent 继续。' : n.kind === 'compare' ? '并排保留方案，查看各自的制作结果。' : '等待真实素材或阶段结果。')}</p>}
    {n.method && !n.skill && <div className="lab-node-method"><Layers size={12} /><span>{n.method}</span></div>}
    {n.kind === 'artifact' && data.methodTitle && <div className="lab-node-method"><Layers size={12} /><span>来自 {data.methodTitle}</span></div>}
    {n.kind === 'step' && <div className="lab-node-method"><Layers size={12} /><span>{n.methods?.length || 1} 种方法 · {activeExperimentMethod(n)?.referenceIds.length || 0} 张参考图</span></div>}
    <footer><span title={data.planTitle}>{data.planTitle || (n.inputs.length ? `${n.inputs.length} 个上游输入` : '共享素材 / 方法')}</span><span>v{n.revision}</span></footer>
    <Handle type="source" position={Position.Right} />
  </article>;
}
const nodeTypes = { experiment: ExperimentCard };
const recipeIcons = { programmatic: Code2, 'talking-head': FileText, keyframes: Image, direct: Sparkles, grid: LayoutGrid, character: Film };
type Draft = Pick<ExperimentNode, 'title' | 'content' | 'description'>;

export default function ExperimentWorkbench({ project, graph: incoming, onGraph, onDraft, disabled = false, active = true }: {
  project: Project; graph?: ExperimentGraph; onGraph: (graph: ExperimentGraph) => void; onDraft: (text: string) => void; disabled?: boolean; active?: boolean;
}) {
  const graph = useMemo(() => normalizeExperimentGraph(incoming || emptyExperiment()), [incoming]);
  const [selectedId, setSelectedId] = useState<string>();
  const [planId, setPlanId] = useState('');
  const plan = graph.plans?.find(item => item.id === planId);
  const selected = graph.nodes.find(n => n.id === selectedId);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [working, setWorking] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [drawer, setDrawer] = useState<'recipes' | 'skill' | 'templates' | 'save' | 'plan' | 'compare' | 'methods' | null>(null);
  const [skillURL, setSkillURL] = useState(''), [skillPath, setSkillPath] = useState(''), [choices, setChoices] = useState<string[]>([]);
  const [templateTitle, setTemplateTitle] = useState('');
  const [draft, setDraft] = useState<Draft>({ title: '', content: '', description: '' });
  const [methodDirty, setMethodDirty] = useState(false);
  const [editRevision, setEditRevision] = useState(0);
  const [sourceId, setSourceId] = useState('');
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
  const related = useMemo(() => {
    if (!plan) return undefined;
    const ids = new Set(graph.nodes.filter(node => node.planId === plan.id).map(node => node.id));
    const visit = (id: string) => { const node = graph.nodes.find(item => item.id === id); for (const input of node?.inputs || []) if (!ids.has(input)) { ids.add(input); visit(input); } };
    [...ids].forEach(visit);
    for (const node of graph.nodes) if (node.sourceId && graph.nodes.some(step => step.planId === plan.id && step.methods?.some(method => method.referenceIds.includes(node.sourceId!)))) ids.add(node.id);
    return ids;
  }, [graph.nodes, plan]);
  useEffect(() => { setNodes(graph.nodes.map(item => ({ id: item.id, type: 'experiment', position: item.position, data: { item, planTitle: graph.plans?.find(value => value.id === item.planId)?.title, methodTitle: graph.runs?.find(run => run.id === item.runId)?.method.title, dimmed: !!related && !related.has(item.id), related: !!related?.has(item.id), adopted: graph.plans?.some(value => value.adopted && value.selectedArtifactId === item.id) }, selected: item.id === selectedId }))); }, [graph.nodes, graph.plans, graph.runs, selectedId, related]);
  const reloadEditor = useCallback((node: ExperimentNode) => { setDraft({ title: node.title, content: node.content, description: node.description }); setEditRevision(node.revision); setSourceId(''); }, []);
  useEffect(() => { const node = graph.nodes.find(n => n.id === selectedId); if (node) reloadEditor(node); }, [selectedId, reloadEditor]);
  useEffect(() => { if (selected && !dirty && selected.revision !== editRevision) reloadEditor(selected); }, [selected?.revision, dirty, editRevision, reloadEditor]);
  useEffect(() => { if (selected?.planId) setPlanId(selected.planId); setMethodDirty(false); }, [selectedId, selected?.planId]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { if (active && graph.nodes.length) { const timer = setTimeout(() => void flow.current?.fitView({ padding: 0.18, duration: 0, maxZoom: 1 }), 80); return () => clearTimeout(timer); } }, [active, graph.nodes.length]);
  const run = async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    if (working) return;
    setWorking(true); setError('');
    try { return await work(); } catch (failure) { setError(failure instanceof Error ? failure.message : '操作未完成，请重试。'); return undefined; }
    finally { setWorking(false); }
  };
  const mutate = (operation: ExperimentOperation) => run(async () => {
    const updated = await api<ExperimentGraph>(`/api/projects/${project.id}/agent/experiment`, { method: 'POST', body: JSON.stringify({ ...operation, expectedRevision: graph.revision }) });
    onGraph(updated); return updated;
  });
  const selectNode = (id: string) => { setSelectedId(id); setDrawer(null); };
  const branchPlan = async () => { if (!plan) return; const updated = await mutate({ op: 'branch-plan', planId: plan.id }); if (updated) { setPlanId(updated.plans!.at(-1)!.id); setSelectedId(undefined); setDrawer('plan'); setNotice('已创建完整备选方案，参考素材复用，方法和步骤可独立调整。'); } };
  const addPlan = async () => { const updated = await mutate({ op: 'plan', title: '新的制作方案', goal: '' }); if (updated) { setPlanId(updated.plans!.at(-1)!.id); setSelectedId(undefined); setDrawer('plan'); } };
  const fit = () => void flow.current?.fitView({ padding: 0.18, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240, maxZoom: 1 });
  const addNode = async (fromSelection = true) => {
    const id = crypto.randomUUID(), point = flow.current?.screenToFlowPosition({ x: window.innerWidth * 0.58, y: window.innerHeight * 0.46 }) || { x: 0, y: 0 };
    const updated = await mutate({ op: 'upsert', nodes: [{ id, planId: plan?.id || selected?.planId, kind: 'step', title: '新的制作步骤', method: '', description: '', prompt: '', content: '', status: 'planned', inputs: fromSelection && selected ? [selected.id] : [], position: point }] });
    if (updated) setSelectedId(id);
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
  const requestStep = () => {
    if (!selected) return;
    const method = activeExperimentMethod(selected), owner = graph.plans?.find(item => item.id === selected.planId);
    onDraft(`请执行方案「${owner?.title || graph.title}」中的步骤「${selected.title}」（stepId：${selected.id}）。\n方案目标：${owner?.goal || selected.description}\n使用已保存的方法「${method?.title || selected.method}」（methodId：${method?.id || ''}）。先读取 get_creative 和 read_experiment_node，核对当前参数与参考图。${method?.prompt ? `\n提示词：\n${method.prompt}` : ''}${method?.referenceIds.length ? `\n参考图 ID（按顺序）：${method.referenceIds.join('、')}` : ''}${method?.model ? `\n模型 / 工具：${method.model}` : ''}\n生成时传入 stepId，并使用这个方法保存的提示词、参考图和参数。保留旧产物，本次结果创建独立产物节点，关联到本方案与本次方法执行；后续步骤优先使用方案已采用的产物。如缺少素材或执行能力，请说明。`);
    setNotice('任务已填入对话输入框，可以补充要求后发送。');
  };
  const exportGraph = () => downloadBlob(new Blob([JSON.stringify({ format: 'sail-experiment-v2', project: { id: project.id, title: project.title }, ...graph }, null, 2)], { type: 'application/json' }), `sail-experiment-${project.id.slice(0, 8)}.json`);
  const completed = graph.nodes.filter(n => n.status === 'completed').length, stale = graph.nodes.filter(n => n.status === 'stale').length;
  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => setNodes(current => applyNodeChanges(changes, current)), []);

  return <section className="experiment-workbench" aria-label="视频创作实验台">
    <header className="lab-toolbar">
      <div className="lab-title"><FlaskConical size={18} /><div><strong>{graph.title}</strong><span>{graph.nodes.length ? `${graph.nodes.length} 个节点 · ${completed} 已完成${stale ? ` · ${stale} 需要更新` : ''}` : '让每一次探索，都留下可继续的路径'}</span></div></div>
      <div className="lab-toolbar-actions">
        <button type="button" disabled={busy} onClick={() => void addPlan()}><Plus size={14} />新建方案</button>
        <button type="button" disabled={busy} onClick={() => setDrawer(drawer === 'recipes' ? null : 'recipes')} aria-expanded={drawer === 'recipes'}><Plus size={14} />制作路径<ChevronDown size={12} /></button>
        <button type="button" disabled={busy} onClick={() => { setDrawer(drawer === 'skill' ? null : 'skill'); setChoices([]); setSkillPath(''); }}><Github size={14} />导入 Skill</button>
        <button type="button" disabled={busy || !graph.nodes.length} onClick={() => { setTemplateTitle(plan?.title || graph.title); setDrawer('save'); }}><Save size={14} />保存配方</button>
        <button type="button" className="lab-icon-button" title="已保存的配方" aria-label="已保存的配方" onClick={() => setDrawer(drawer === 'templates' ? null : 'templates')}><BookOpen size={16} /></button>
      </div>
    </header>
    {!!graph.plans?.length && <div className="lab-plan-navigation">
      <nav aria-label="制作方案"><button type="button" aria-pressed={!plan} onClick={() => setPlanId('')}>全部节点</button>{graph.plans.map(item => <button type="button" key={item.id} aria-pressed={item.id === planId} onClick={() => { setPlanId(item.id); setSelectedId(undefined); }}>{item.adopted ? <Check size={13} /> : <GitBranch size={13} />}<span>{item.title}</span></button>)}</nav>
      <div className="lab-plan-summary"><div>{plan ? <><strong>{plan.goal || '填写方案目标，明确最终要得到的结果。'}</strong><span>{graph.nodes.filter(node => node.planId === plan.id && node.kind === 'step').length} 个步骤 · {graph.nodes.filter(node => node.planId === plan.id && node.kind === 'artifact').length} 份产物 · 相关节点已突出显示</span></> : <span>方案组织步骤与产物，节点可在画布中自由摆放。</span>}</div><div>{plan && <button type="button" onClick={() => setDrawer('plan')}>方案详情<ArrowRight size={13} /></button>}<button type="button" onClick={() => setDrawer('compare')}><GitBranch size={13} />比较方案</button></div></div>
    </div>}
    {error && <div className="lab-message lab-error" role="alert"><span>{error}</span><button type="button" aria-label="关闭错误提示" onClick={() => setError('')}><X size={14} /></button></div>}
    {notice && <div className="lab-message" role="status"><Check size={14} /><span>{notice}</span></div>}
    <div className={`lab-stage${selected ? ' has-inspector' : ''}`}>
      <div className="lab-viewport">
        {!graph.nodes.length ? <div className="lab-welcome">
          <div className="lab-welcome-symbol"><FlaskConical size={30} strokeWidth={1.4} /></div>
          <h2>从一个想法，搭起你的实验台。</h2>
          <p>把参考、制作方法和阶段结果放在一起。让 Agent 探索，也随时接手其中一步。</p>
          <div className="lab-recipe-grid">{experimentRecipes.map(recipe => { const Icon = recipeIcons[recipe.id]; return <button type="button" disabled={busy} key={recipe.id} onClick={() => void addRecipe(recipe.id)}><Icon size={20} strokeWidth={1.5} /><span><strong>{recipe.title}</strong><small>{recipe.subtitle}</small></span><ArrowRight size={15} /></button>; })}</div>
          <div className="lab-welcome-bottom"><span>也可以直接在对话中描述目标，让 Agent 自己组织路径。</span><button type="button" disabled={busy} onClick={() => setDrawer('skill')}><Github size={14} />从 GitHub Skill 开始</button></div>
        </div> : <ReactFlow<FlowNode>
          nodes={nodes} edges={graph.nodes.flatMap(n => n.inputs.map(id => ({ id: `${id}--${n.id}`, source: id, target: n.id, type: 'smoothstep', style: { stroke: n.status === 'stale' ? '#b18345' : '#a6b1ae', strokeWidth: 1.3, strokeDasharray: n.status === 'stale' ? '5 5' : undefined } })))}
          nodeTypes={nodeTypes} onInit={instance => { flow.current = instance; }} onNodesChange={onNodesChange}
          onNodeClick={(_, node) => setSelectedId(node.id)} onPaneClick={() => setSelectedId(undefined)}
          onNodeDragStop={(_, node) => { if (!busy) void mutate({ op: 'move', positions: [{ id: node.id, position: node.position }] }); }}
          onConnect={connection => { if (!busy && connection.source && connection.target) { const target = graph.nodes.find(n => n.id === connection.target); if (target) void mutate({ op: 'patch', id: target.id, changes: { inputs: [...new Set([...target.inputs, connection.source])] } }); } }}
          nodesDraggable={!busy} nodesConnectable={!busy} edgesReconnectable={false} deleteKeyCode={null} minZoom={0.2} maxZoom={1.5} fitView fitViewOptions={{ padding: 0.18, maxZoom: 1 }} proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#d8dedb" />
          <Controls showInteractive={false} />
          <MiniMap<FlowNode> pannable zoomable nodeColor={n => n.data.item.kind === 'skill' ? '#c0cbbd' : n.data.item.kind === 'artifact' ? '#c4cde2' : '#d8dedb'} maskColor="#f5f7f4b3" />
        </ReactFlow>}
        {!!graph.nodes.length && <div className="lab-canvas-tools"><button type="button" disabled={busy} onClick={() => void addNode()}><Plus size={15} />添加步骤</button><button type="button" disabled={busy} onClick={() => void mutate({ op: 'layout' })}><Boxes size={15} />整理</button><button type="button" onClick={fit} title="适应画布" aria-label="适应画布"><Maximize2 size={15} /></button><button type="button" onClick={exportGraph} title="导出实验台 JSON" aria-label="导出实验台 JSON"><ArrowDownToLine size={15} /></button></div>}
        {!!graph.nodes.length && <div className="lab-canvas-hint">拖动整理 · 连接圆点建立依赖 · 点击节点编辑</div>}
      </div>
      {selected && <aside className="lab-inspector" aria-label="节点详情">
        <header><span>{experimentKindLabels[selected.kind]}</span><button type="button" className="lab-icon-button" onClick={() => setSelectedId(undefined)} aria-label="关闭节点详情"><X size={17} /></button></header>
        <div className="lab-inspector-scroll">
          <div className="lab-inspector-heading"><h2>{selected.title}</h2><span className={`lab-status lab-status-${selected.status}`}>{experimentStatusLabels[selected.status]}</span></div>
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
          {selected.kind === 'step' && <div className="lab-step-actions"><button type="button" className="lab-primary" disabled={busy || dirty || methodDirty || graph.runs?.some(run => run.stepId === selected.id && run.status === 'running')} onClick={requestStep}><Sparkles size={14} />使用当前方法交给 Agent</button><button type="button" disabled={busy || dirty || methodDirty} onClick={() => void branchPlan()}><GitBranch size={14} />创建整套备选方案</button><button type="button" disabled={busy || dirty || methodDirty} onClick={() => { setSkillPath(''); setChoices([]); setDrawer('skill'); }}><Github size={14} />为此步骤连接 Skill</button></div>}
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
        {drawer === 'save' && <form onSubmit={async e => { e.preventDefault(); const updated = await mutate({ op: 'freeze', title: templateTitle, planId: plan?.id }); if (updated) { setDrawer('templates'); setNotice(updated.templates.at(-1)?.verified ? '已保存经过完成验证的流程。' : '已保存流程草稿，尚未完成的步骤会保留。'); } }}><p>{plan ? `保存「${plan.title}」的目标、步骤、备选方法、输入关系与 Skill 版本。` : '保存全部方案的目标、步骤、备选方法、输入关系与 Skill 版本。'}复用时创建新方案，重新连接素材和生成结果。</p><label>配方名称<input value={templateTitle} required maxLength={120} onChange={e => setTemplateTitle(e.target.value)} /></label><button type="submit" className="lab-primary" disabled={busy || !templateTitle.trim()}><Save size={15} />保存当前流程</button><small>步骤完成且存在真实产物时标为“已验证”；尚未完成的流程保存为草稿。历史失败结果会保留。</small></form>}
        {drawer === 'templates' && <div className="lab-templates">{!graph.templates.length ? <p>成功的方法值得留下。打开一个流程，点击“保存配方”。</p> : graph.templates.map(template => <section key={template.id}><div><BookOpen size={18} /><strong>{template.title}</strong></div><p>{template.nodes.length} 个节点 · {template.verified ? '已验证' : '流程草稿'} · {new Date(template.createdAt).toLocaleDateString('zh-CN')}</p><button type="button" disabled={busy} onClick={async () => { const updated = await mutate({ op: 'instantiate', templateId: template.id }); if (updated) { setPlanId(updated.plans!.at(-1)!.id); setSelectedId(undefined); setDrawer(null); setNotice('已创建新方案，请连接新素材并继续执行。'); } }}>复用这份配方<ArrowRight size={14} /></button></section>)}</div>}
      </aside>}
    </div>
    <footer className="lab-footer"><span><span className="lab-live-dot" />{working ? '正在保存…' : dirty || methodDirty ? '当前节点或方法有未保存的修改' : '与当前创意一起保存'}</span><span>{graph.nodes.length ? '方案 → 步骤 → 方法 + 输入 → 独立产物' : 'Agent 自由探索 · 画布记录关系'}</span></footer>
  </section>;
}
