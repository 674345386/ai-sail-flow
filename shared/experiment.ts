import { z } from 'zod';
import { activeExperimentMethod, normalizeExperimentGraph, methodMatchesRun } from './experiment-organization';
import { environmentSchema, type SkillEnvironment, type SkillReference } from './skill-assets';
import { applyExperimentPlanning, assertExperimentRouteExecution, defaultExperimentPolicy, experimentPlanningOperations, normalizeExperimentPolicy, type ExperimentPolicy, type ExperimentProposal } from './experiment-planning';
import { experimentReviewInput, type ExperimentReview } from './experiment-review';
export { activeExperimentMethod, normalizeExperimentGraph, methodMatchesRun } from './experiment-organization';

export const experimentKinds = ['asset', 'step', 'skill', 'artifact', 'compare'] as const;
export const experimentStatuses = ['planned', 'running', 'completed', 'failed', 'stale'] as const;
export const experimentKindLabels = { asset: '素材', step: '制作步骤', skill: 'Skill 方法', artifact: '阶段产物', compare: '方案比较' };
export const experimentStatusLabels = { planned: '待执行', running: '执行中', completed: '已完成', failed: '执行失败', stale: '需要更新' };
const nodeId = z.string().regex(/^[\w-]{1,100}$/);
const position = z.object({ x: z.number().finite().min(-50000).max(50000), y: z.number().finite().min(-50000).max(50000) });
export const experimentMethodInput = z.object({
  id: nodeId, title: z.string().trim().min(1).max(120), description: z.string().max(2000).default(''),
  prompt: z.string().max(16000).default(''), inputs: z.array(nodeId).max(80).default([]),
  referenceIds: z.array(z.string().min(1).max(150)).max(20).default([]),
  model: z.string().max(120).default(''),
  parameters: z.record(z.string().max(120), z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()])).default({}),
});
export type ExperimentMethod = z.infer<typeof experimentMethodInput>;
export type ExperimentPlan = { id: string; title: string; goal: string; goalId: string; basedOn?: string; adopted?: boolean; selectedArtifactId?: string; proposalId?: string; routeId?: string };
export type ExperimentRun = {
  id: string; stepId: string; planId: string; method: ExperimentMethod; inputRevisions: Record<string, number>;
  artifactIds: string[]; status: 'running' | 'completed' | 'failed'; startedAt: string; finishedAt?: string; error?: string;
  environment?: SkillEnvironment;
  policy?: ExperimentPolicy; proposalId?: string; routeId?: string;
};
export const experimentNodeInput = z.object({
  id: nodeId, kind: z.enum(experimentKinds), title: z.string().trim().min(1).max(120),
  description: z.string().max(2000).default(''), prompt: z.string().max(16000).default(''),
  content: z.string().max(30000).default(''), method: z.string().max(120).default(''),
  status: z.enum(experimentStatuses).default('planned'), inputs: z.array(nodeId).max(80).default([]),
  position: position.optional(), sourceId: z.string().max(150).optional(),
  selectedInput: nodeId.optional(),
  planId: nodeId.optional(), methods: z.array(experimentMethodInput).min(1).max(16).optional(), activeMethodId: nodeId.optional(),
  assetReferenceId: nodeId.optional(),
  display: z.object({ width: z.number().finite().min(160).max(720), aspectRatio: z.number().finite().min(0.1).max(10).optional() }).optional(),
});
export type ExperimentNodeInput = z.infer<typeof experimentNodeInput>;
export type ExperimentSkill = { repository: string; path: string; commit: string; url: string; content: string; name: string };
export type ExperimentNode = ExperimentNodeInput & {
  position: { x: number; y: number }; revision: number; inputRevisions: Record<string, number>;
  url?: string; mediaType?: 'image' | 'video' | 'text'; skill?: ExperimentSkill; error?: string;
  runId?: string;
  routeStepIndex?: number;
};
export type ExperimentTemplate = { id: string; title: string; createdAt: string; verified: boolean; nodes: ExperimentNode[]; plans?: ExperimentPlan[] };
export type ExperimentFile = { id: string; title: string; url: string; mediaType: 'image' | 'video' | 'text'; status: 'completed'; filename: string; size: number;
  createdAt?: string; purpose?: 'context' | 'output'; sourceId?: string; sourceTime?: number;
  storage?: 'local';
};
export type ExperimentGraph = { version: 1; revision: number; title: string; nodes: ExperimentNode[]; templates: ExperimentTemplate[]; files?: ExperimentFile[]; updatedAt: string; organizationVersion?: 1; plans?: ExperimentPlan[]; runs?: ExperimentRun[]; environment?: SkillEnvironment; assetReferences?: SkillReference[]; policy?: ExperimentPolicy; proposals?: ExperimentProposal[]; activeProposalId?: string; review?: ExperimentReview };
export const experimentOperation = z.discriminatedUnion('op', [
  ...experimentPlanningOperations,
  z.object({ op: z.literal('review'), review: experimentReviewInput.nullable() }),
  z.object({ op: z.literal('environment'), environment: environmentSchema }),
  z.object({ op: z.literal('upsert'), nodes: z.array(experimentNodeInput).min(1).max(80) }),
  z.object({ op: z.literal('patch'), id: nodeId, changes: experimentNodeInput.omit({ id: true, kind: true }).partial() }),
  z.object({ op: z.literal('move'), positions: z.array(z.object({ id: nodeId, position })).max(160) }),
  z.object({ op: z.literal('resize'), id: nodeId, width: z.number().finite().min(160).max(720), aspectRatio: z.number().finite().min(0.1).max(10).optional(), position: position.optional() }),
  z.object({ op: z.literal('canvas-next'), sourceId: nodeId, kind: z.enum(['image', 'video', 'step']), model: z.string().max(120).default(''), aspectRatio: z.string().regex(/^[1-9]\d{0,3}:[1-9]\d{0,3}$/).optional() }),
  z.object({ op: z.literal('remove'), id: nodeId }),
  z.object({ op: z.literal('branch'), id: nodeId }),
  z.object({ op: z.literal('plan'), id: nodeId.optional(), title: z.string().trim().min(1).max(120), goal: z.string().max(2000) }),
  z.object({ op: z.literal('assign-plan'), planId: nodeId, nodeIds: z.array(nodeId).min(1).max(160) }),
  z.object({ op: z.literal('branch-plan'), planId: nodeId }),
  z.object({ op: z.literal('method'), stepId: nodeId, method: experimentMethodInput }),
  z.object({ op: z.literal('branch-method'), stepId: nodeId }),
  z.object({ op: z.literal('select-method'), stepId: nodeId, methodId: nodeId }),
  z.object({ op: z.literal('remove-method'), stepId: nodeId, methodId: nodeId }),
  z.object({ op: z.literal('adopt-artifact'), planId: nodeId, artifactId: nodeId }),
  z.object({ op: z.literal('start-run'), stepId: nodeId, methodId: nodeId.optional(), prompt: z.string().max(16000).optional(), referenceIds: z.array(z.string().min(1).max(150)).max(20).optional(), model: z.string().max(120).optional(), parameters: experimentMethodInput.shape.parameters.optional() }),
  z.object({ op: z.literal('fail-run'), runId: nodeId, error: z.string().max(2000) }),
  z.object({ op: z.literal('recipe'), recipe: z.enum(['programmatic', 'talking-head', 'keyframes', 'direct', 'grid', 'character']) }),
  z.object({ op: z.literal('freeze'), title: z.string().trim().min(1).max(120), planId: nodeId.optional() }),
  z.object({ op: z.literal('instantiate'), templateId: nodeId }),
  z.object({ op: z.literal('layout'), dimensions: z.array(z.object({ id: nodeId, width: z.number().finite().min(1).max(2000), height: z.number().finite().min(1).max(7200) })).max(160).optional() }),
]);
export type ExperimentOperation = z.infer<typeof experimentOperation>;
export class ExperimentError extends Error { status = 400; }
export const emptyExperiment = (): ExperimentGraph => ({ version: 1, organizationVersion: 1, revision: 0, title: '视频创作实验台', nodes: [], plans: [], runs: [], templates: [], updatedAt: new Date().toISOString() });

/** Keep routine Agent reads bounded; a node's full method/content is read on demand. */
export function experimentAgentContext(graph: ExperimentGraph) {
  const proposals = graph.proposals?.map(proposal => proposal.id === graph.activeProposalId
    ? { ...proposal, routes: proposal.routes.map(route => ({ ...route, steps: route.steps.map(step => ({ ...step, prompt: step.prompt.slice(0, 1500) })) })) }
    : { id: proposal.id, createdAt: proposal.createdAt, goal: proposal.brief.goal, selectedRouteIds: proposal.selectedRouteIds });
  const environment = graph.environment && { ...graph.environment, files: graph.environment.files.map(({ content, ...file }) => file) };
  return { ...graph, policy: normalizeExperimentPolicy(graph.policy), proposals, environment, assetReferences: graph.assetReferences?.map(({ snapshot, environment: required, ...reference }) => ({ ...reference, environment: required && { ...required, files: required.files.map(({ content, ...file }) => file) }, example: snapshot && { id: snapshot.id, title: snapshot.title, runCount: snapshot.graph.runs?.length || 0 }, readFullWith: 'read_skill_reference' })), runCount: graph.runs?.length || 0, runs: graph.runs?.slice(-30).map(({ environment: runEnvironment, ...run }) => ({ ...run, environment: runEnvironment && { ...runEnvironment, files: runEnvironment.files.map(({ content, ...file }) => file) }, method: { ...run.method, prompt: run.method.prompt.slice(0, 1500) }, readFullWith: 'read_experiment_node' })), templates: graph.templates.map(({ nodes, ...template }) => ({ ...template, nodeCount: nodes.length })), nodes: graph.nodes.map(n => ({ ...n, content: n.content.slice(0, 6000), methods: n.methods?.map(method => ({ ...method, prompt: method.prompt.slice(0, 6000) })), ...(n.skill ? { skill: { ...n.skill, content: n.skill.content.slice(0, 3000), readFullWith: 'read_experiment_node' } } : {}) })) };
}

export const experimentRecipes = [
  { id: 'programmatic', title: '程序化视频', subtitle: '代码控制排版、动画与节奏', steps: ['参考与创作目标', '视觉与动效拆解', '动画代码实现', '可编辑动画代码', '渲染与合成', '成片与源代码'], artifacts: ['可编辑动画代码', '成片与源代码'], methods: ['', '参考分析', '程序化动画', '', '代码渲染', ''] },
  { id: 'talking-head', title: '热门口播复刻', subtitle: '保留内容结构，重做你的表达', steps: ['参考口播与素材', '钩子、脚本与节奏', '口播脚本', '人物与配音制作', '口播素材', '字幕、B-roll 与剪辑', '口播成片'], artifacts: ['口播脚本', '口播素材', '口播成片'], methods: ['', '口播结构分析', '', '口播 / 数字人', '', '剪辑合成', ''] },
  { id: 'keyframes', title: '分镜与关键帧', subtitle: '适合苹果风格产品片与叙事短片', steps: ['产品与参考素材', '场景拆分与镜头提示词', '关键帧生成', '场景关键帧', '关键帧生成视频', '场景视频', '剪辑与声音', '产品成片'], artifacts: ['场景关键帧', '场景视频', '产品成片'], methods: ['', '场景拆分', '文生图 / 参考图生图', '', '关键帧图生视频', '', '剪辑合成', ''] },
  { id: 'direct', title: '整片提示词', subtitle: '分析参考，直接调用视频模型', steps: ['参考视频与目标', '整片分析与生成提示词', '视频模型生成', '生成成片'], artifacts: ['生成成片'], methods: ['', '全片提示词分析', '文生 / 参考生视频', ''] },
  { id: 'grid', title: '九宫格分镜', subtitle: '先锁定连续画面，再生成动态', steps: ['参考与场景素材', '九宫格分镜设计与制图', '九宫格分镜图', '分镜参考生成视频', '分镜成片'], artifacts: ['九宫格分镜图', '分镜成片'], methods: ['', '九宫格规划与生图', '', '分镜参考视频', ''] },
  { id: 'character', title: '视频换人物', subtitle: '保留动作与场景，替换角色', steps: ['源视频与角色参考', '角色与保留项约束', '人物替换制作', '换人物成片'], artifacts: ['换人物成片'], methods: ['', '人物一致性规划', '人物替换', ''] },
] as const;

function assertDAG(nodes: ExperimentNode[]) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  if (byId.size !== nodes.length) throw new ExperimentError('节点 ID 重复。');
  const seen = new Set<string>(), visiting = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new ExperimentError('依赖关系不能形成循环。');
    if (seen.has(id)) return;
    const n = byId.get(id); if (!n) throw new ExperimentError(`输入节点 ${id} 不存在。`);
    visiting.add(id); n.inputs.forEach(visit); visiting.delete(id); seen.add(id);
  };
  nodes.forEach(n => visit(n.id));
}
export function layoutExperiment(nodes: ExperimentNode[], dimensions: { id: string; width: number; height: number }[] = []) {
  assertDAG(nodes);
  const depths = new Map<string, number>(), rows = new Map<number, number>();
  const byId = new Map(nodes.map(n => [n.id, n]));
  const depth = (id: string): number => {
    if (depths.has(id)) return depths.get(id)!;
    const n = byId.get(id)!;
    const d = n.inputs.length ? 1 + Math.max(...n.inputs.map(depth)) : 0;
    depths.set(id, d); return d;
  };
  const measured = new Map(dimensions.map(item => [item.id, item]));
  const columnWidths = new Map<number, number>();
  for (const node of nodes) { const col = depth(node.id); columnWidths.set(col, Math.max(columnWidths.get(col) || 266, measured.get(node.id)?.width || node.display?.width || 266)); }
  const columnX = (col: number) => Array.from({ length: col }, (_, index) => (columnWidths.get(index) || 266) + 124).reduce((sum, width) => sum + width, 0);
  return nodes.map(n => { const col = depth(n.id), y = rows.get(col) || 0; const width = n.display?.width || 266;
    rows.set(col, y + (measured.get(n.id)?.height || (n.display?.aspectRatio ? width / n.display.aspectRatio : 266)) + 74);
    return { ...n, position: { x: columnX(col), y } }; });
}
export function invalidateExperimentNodes(nodes: ExperimentNode[], roots: Set<string>) {
  const affected = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    const sources = new Set(nodes.filter(node => affected.has(node.id) && node.sourceId).map(node => node.sourceId!));
    for (const node of nodes) if (!affected.has(node.id) && (node.inputs.some(id => affected.has(id)) || activeExperimentMethod(node)?.referenceIds.some(id => sources.has(id)))) { affected.add(node.id); changed = true; }
  }
  // A run's output is historical evidence. Changing the method invalidates consumers, not the saved media.
  return nodes.map(n => affected.has(n.id) && n.status !== 'planned' && !(n.kind === 'artifact' && n.runId && !roots.has(n.id)) ? { ...n, status: 'stale' as const } : n);
}
/** Copy the reusable path, not one empty slot for every historical experiment result. */
function experimentPathNodes(nodes: ExperimentNode[], plans: ExperimentPlan[]) {
  const required = new Set(nodes.filter(node => node.kind !== 'artifact').flatMap(node => [...node.inputs, ...(node.methods?.flatMap(method => method.inputs) || [])]));
  for (const plan of plans) if (plan.selectedArtifactId) required.add(plan.selectedArtifactId);
  for (const step of nodes.filter(node => node.kind === 'step')) {
    const outputs = nodes.filter(node => node.kind === 'artifact' && node.inputs.includes(step.id));
    if (!outputs.some(node => required.has(node.id)) && outputs.length) required.add(outputs.at(-1)!.id);
  }
  const includeInputs = (id: string) => { for (const input of nodes.find(node => node.id === id)?.inputs || []) if (!required.has(input)) { required.add(input); includeInputs(input); } };
  [...required].forEach(includeInputs);
  return nodes.filter(node => node.kind !== 'artifact' || required.has(node.id) || !node.inputs.some(id => nodes.find(input => input.id === id)?.kind === 'step'));
}
export function applyExperimentOperation(graph: ExperimentGraph, operation: ExperimentOperation, uid: () => string): ExperimentGraph {
  graph = normalizeExperimentGraph(graph);
  if (operation.op === 'policy' || operation.op === 'propose-routes' || operation.op === 'select-routes') return applyExperimentPlanning(graph, operation, uid);
  let nodes = structuredClone(graph.nodes), templates = [...graph.templates], title = graph.title;
  let plans = structuredClone(graph.plans || []), runs = structuredClone(graph.runs || []);
  const find = (id: string) => { const n = nodes.find(n => n.id === id); if (!n) throw new ExperimentError('找不到这个节点，请刷新实验台。'); return n; };
  const findStep = (id: string) => { const node = find(id); if (node.kind !== 'step') throw new ExperimentError('请选择一个制作步骤。'); return node; };
  const findPlan = (id: string) => { const plan = plans.find(item => item.id === id); if (!plan) throw new ExperimentError('找不到这个方案，请刷新实验台。'); return plan; };
  const material = (n: ExperimentNodeInput) => JSON.stringify([n.title, n.description, n.prompt, n.content, n.method, n.inputs, n.sourceId, n.selectedInput, n.methods, n.activeMethodId]);
  const activate = (step: ExperimentNode, methodId: string) => {
    const method = step.methods?.find(item => item.id === methodId);
    if (!method) throw new ExperimentError('找不到这个备选方法。');
    step.activeMethodId = method.id; step.method = method.title; step.prompt = method.prompt; step.inputs = [...method.inputs];
    step.revision++; step.status = 'planned';
    const previous = [...runs].reverse().find(run => run.stepId === step.id && methodMatchesRun(step, run, nodes));
    if (previous) step.status = previous.status;
    step.error = previous?.error;
    nodes = invalidateExperimentNodes(nodes, new Set(nodes.filter(node => node.inputs.includes(step.id) && node.kind !== 'artifact').map(node => node.id)));
  };
  if (operation.op === 'review') {
    if (operation.review) {
      const review = operation.review;
      if (new Set(review.stages.map(stage => stage.planId)).size !== review.stages.length) throw new ExperimentError('过程总览中的阶段不能重复。');
      for (const stage of review.stages) {
        findPlan(stage.planId);
        for (const id of stage.stepIds) {
          const step = findStep(id);
          if (step.planId !== stage.planId) throw new ExperimentError('过程步骤与所属方案不匹配。');
        }
        stage.previewNodeIds.forEach(find);
      }
      if (find(review.finalArtifactId).kind !== 'artifact') throw new ExperimentError('最终成片需要关联真实产物节点。');
    }
    graph = { ...graph, review: operation.review || undefined };
  } else if (operation.op === 'environment') {
    if (runs.some(run => run.status === 'running')) throw new ExperimentError('有步骤正在执行，请结束后再更新环境。');
    const runtimeKey = (environment?: SkillEnvironment) => environment && JSON.stringify([environment.platform, environment.architecture, environment.workingDirectory, environment.entries, environment.files.map(file => [file.path, file.sha256]), environment.requirements, environment.unresolved]);
    const changed = runtimeKey(graph.environment) !== runtimeKey(operation.environment);
    graph = { ...graph, environment: operation.environment };
    if (changed) nodes = invalidateExperimentNodes(nodes, new Set(nodes.filter(node => node.kind === 'step').map(node => node.id)));
  } else if (operation.op === 'upsert' || operation.op === 'patch') {
    const incoming = operation.op === 'upsert' ? operation.nodes : [{ ...find(operation.id), ...operation.changes }];
    const changed = new Set<string>();
    for (const input of incoming) {
      if (input.planId && !plans.some(plan => plan.id === input.planId)) throw new ExperimentError('所属方案不存在，请先创建方案。');
      const old = nodes.find(n => n.id === input.id);
      if (old && old.kind !== input.kind) throw new ExperimentError('已有节点不能改变类型。');
      if (old?.runId && ((input.sourceId !== undefined && input.sourceId !== old.sourceId) || input.content !== old.content)) throw new ExperimentError('历史产物保留原始来源与内容，请创建独立产物记录新结果。');
      const next: ExperimentNode = { ...old, ...input, position: input.position || old?.position || { x: nodes.length * 326, y: 0 }, revision: old?.revision || 1, inputRevisions: old?.inputRevisions || {} };
      if (next.kind === 'step' && next.methods?.length) {
        const explicit = operation.op === 'patch' ? operation.changes : input;
        const method = activeExperimentMethod(next)!;
        if (!explicit.methods) {
          if (explicit.prompt !== undefined) method.prompt = next.prompt;
          if (explicit.method !== undefined) method.title = next.method || method.title;
          if (explicit.inputs !== undefined) method.inputs = [...next.inputs];
        }
        next.activeMethodId = method.id; next.prompt = method.prompt; next.method = method.title; next.inputs = [...method.inputs];
      }
      const differs = !!old && material(old) !== material(next);
      if (old?.kind === 'step' && runs.some(run => run.stepId === old.id && run.status === 'running') && JSON.stringify([old.prompt, old.inputs, old.methods, old.activeMethodId]) !== JSON.stringify([next.prompt, next.inputs, next.methods, next.activeMethodId])) throw new ExperimentError('此步骤正在执行，请等待当前结果后再修改方法或输入。');
      next.revision = (old?.revision || 0) + (differs || !old ? 1 : 0);
      if (differs) changed.add(next.id);
      if (old) nodes = nodes.map(n => n.id === input.id ? next : n); else nodes.push(next);
    }
    assertDAG(nodes);
    nodes = invalidateExperimentNodes(nodes, changed);
    // A completion is a new observation against the current input revisions.
    for (const input of incoming) if (input.status === 'completed' && (operation.op === 'upsert' || operation.changes.status === 'completed')) {
      const n = nodes.find(item => item.id === input.id)!;
      if (n.inputs.some(id => nodes.find(item => item.id === id)?.status !== 'completed')) throw new ExperimentError('上游尚未完成或已经过期，不能把此步骤标为完成。');
      if ((n.kind === 'asset' || n.kind === 'artifact') && !n.content.trim() && !n.sourceId) throw new ExperimentError('请先填写真实文本内容或连接当前创意的素材 / 产物，再确认完成。');
      if (n.kind === 'compare' && (!n.selectedInput || !n.inputs.includes(n.selectedInput))) throw new ExperimentError('请先选定一个已有方案。');
      n.status = 'completed'; n.inputRevisions = Object.fromEntries(n.inputs.map(id => [id, nodes.find(item => item.id === id)!.revision]));
    }
  } else if (operation.op === 'move') {
    nodes = nodes.map(n => ({ ...n, position: operation.positions.find(p => p.id === n.id)?.position || n.position }));
  } else if (operation.op === 'resize') {
    const node = find(operation.id);
    node.display = { ...node.display, width: operation.width, ...(operation.aspectRatio ? { aspectRatio: operation.aspectRatio } : {}) };
    if (operation.position) node.position = operation.position;
  } else if (operation.op === 'canvas-next') {
    const source = find(operation.sourceId), planId = uid(), stepId = uid(), outputId = uid(), methodId = uid();
    const media = operation.kind === 'step' ? undefined : operation.kind;
    const name = media === 'image' ? '图片创作' : media === 'video' ? '视频创作' : '继续制作';
    const goal = `基于「${source.title}」${name}`.slice(0, 120);
    const sourcePlan = plans.find(plan => plan.id === source.planId);
    const referenceIds = source.mediaType === 'image' && source.sourceId && source.status === 'completed' ? [source.sourceId] : [];
    const method: ExperimentMethod = { id: methodId, title: name, description: '', prompt: '', inputs: [source.id], referenceIds, model: operation.model, parameters: operation.aspectRatio ? { aspectRatio: operation.aspectRatio } : {} };
    plans.push({ id: planId, title: goal, goal, goalId: sourcePlan?.goalId || planId });
    const x = source.position.x + (source.display?.width || 266) + 124;
    const y = source.position.y + nodes.filter(node => node.inputs.includes(source.id)).length * 340;
    const base = { description: '', prompt: '', content: '', method: '', status: 'planned' as const, revision: 1, inputRevisions: {} };
    nodes.push({ ...base, id: stepId, planId, kind: 'step', title: goal, inputs: [source.id], methods: [method], activeMethodId: method.id, method: method.title, mediaType: media, position: { x, y } },
      { ...base, id: outputId, planId, kind: 'artifact', title: `${name} · 结果`, inputs: [stepId], mediaType: media, position: { x: x + 390, y } });
  } else if (operation.op === 'remove') {
    find(operation.id);
    if (runs.some(run => run.stepId === operation.id || run.artifactIds.includes(operation.id) || run.method.inputs.includes(operation.id))) throw new ExperimentError('这个节点已有执行记录，请保留它以追溯产物；可以创建备选方案继续。');
    nodes = invalidateExperimentNodes(nodes, new Set([operation.id])).filter(n => n.id !== operation.id).map(n => ({ ...n, selectedInput: n.selectedInput === operation.id ? undefined : n.selectedInput, inputs: n.inputs.filter(id => id !== operation.id), methods: n.methods?.map(method => ({ ...method, inputs: method.inputs.filter(id => id !== operation.id) })) }));
  } else if (operation.op === 'plan') {
    if (operation.id) { const plan = findPlan(operation.id); plans = plans.map(item => ({ ...item, ...(item.goalId === plan.goalId ? { goal: operation.goal } : {}), ...(item.id === plan.id ? { title: operation.title } : {}) })); }
    else { const id = uid(); plans.push({ id, title: operation.title, goal: operation.goal, goalId: id }); }
  } else if (operation.op === 'assign-plan') {
    findPlan(operation.planId);
    const ids = new Set(operation.nodeIds);
    operation.nodeIds.forEach(find);
    let expanded = true;
    while (expanded) { const size = ids.size; for (const node of nodes) if (node.kind === 'artifact') { if (ids.has(node.id)) node.inputs.forEach(id => { if (find(id).kind === 'step') ids.add(id); }); else if (node.inputs.some(id => ids.has(id) && find(id).kind === 'step')) ids.add(node.id); } expanded = ids.size !== size; }
    for (const node of nodes) if (ids.has(node.id)) node.planId = operation.planId;
    runs = runs.map(run => ids.has(run.stepId) ? { ...run, planId: operation.planId } : run);
    plans = plans.map(plan => plan.id !== operation.planId && plan.selectedArtifactId && ids.has(plan.selectedArtifactId) ? { ...plan, adopted: false, selectedArtifactId: undefined } : plan);
  } else if (operation.op === 'branch' || operation.op === 'branch-plan') {
    const original = findPlan(operation.op === 'branch' ? findStep(operation.id).planId! : operation.planId);
    const members = experimentPathNodes(nodes.filter(node => node.planId === original.id && ['step', 'artifact', 'compare'].includes(node.kind)), [original]);
    const id = uid(), ids = new Map(members.map(node => [node.id, uid()]));
    const alternative = plans.filter(plan => plan.goalId === original.goalId).length + 1;
    plans.push({ id, title: `${original.title.slice(0, 100)} · 备选 ${alternative}`, goal: original.goal, goalId: original.goalId, basedOn: original.id, proposalId: original.proposalId, routeId: original.routeId });
    const offset = members.length ? Math.max(...members.map(node => node.position.y)) - Math.min(...members.map(node => node.position.y)) + 330 : 330;
    for (const node of members) {
      const methodIds = new Map(node.methods?.map(method => [method.id, uid()]));
      const methods = node.methods?.map(method => ({ ...structuredClone(method), id: methodIds.get(method.id)!, inputs: method.inputs.map(input => ids.get(input) || input), referenceIds: method.referenceIds.filter(source => !members.some(item => item.sourceId === source)) }));
      nodes.push({ ...structuredClone(node), id: ids.get(node.id)!, planId: id, inputs: node.inputs.map(input => ids.get(input) || input), methods, activeMethodId: node.activeMethodId ? methodIds.get(node.activeMethodId) : undefined, status: 'planned', content: '', sourceId: undefined, url: undefined, mediaType: undefined, runId: undefined, error: undefined, selectedInput: undefined, revision: 1, inputRevisions: {}, position: { x: node.position.x, y: node.position.y + offset } });
    }
  } else if (operation.op === 'method' || operation.op === 'branch-method' || operation.op === 'select-method' || operation.op === 'remove-method') {
    const step = findStep(operation.stepId);
    if (runs.some(run => run.stepId === step.id && run.status === 'running')) throw new ExperimentError('此步骤正在执行，请等待当前结果后再切换或修改方法。');
    if (operation.op === 'method') {
      const existing = step.methods!.find(method => method.id === operation.method.id);
      if (!existing && step.methods!.length >= 16) throw new ExperimentError('一个步骤最多保留 16 种方法。');
      step.methods = [...step.methods!.filter(method => method.id !== operation.method.id), structuredClone(operation.method)];
      activate(step, operation.method.id);
    } else if (operation.op === 'branch-method') {
      if (step.methods!.length >= 16) throw new ExperimentError('一个步骤最多保留 16 种方法。');
      const method = { ...structuredClone(activeExperimentMethod(step)!), id: uid(), title: `备选方法 ${step.methods!.length + 1}` };
      step.methods!.push(method); activate(step, method.id);
    } else if (operation.op === 'select-method') activate(step, operation.methodId);
    else {
      if (step.methods!.length === 1) throw new ExperimentError('步骤至少需要保留一种方法。');
      if (!step.methods!.some(method => method.id === operation.methodId)) throw new ExperimentError('找不到这个方法。');
      step.methods = step.methods!.filter(method => method.id !== operation.methodId);
      activate(step, step.activeMethodId === operation.methodId ? step.methods[0].id : step.activeMethodId!);
    }
    nodes = invalidateExperimentNodes(nodes, new Set([step.id])).map(node => node.id === step.id ? step : node);
  } else if (operation.op === 'adopt-artifact') {
    const plan = findPlan(operation.planId), artifact = find(operation.artifactId);
    if (artifact.kind !== 'artifact' || artifact.planId !== plan.id || artifact.status !== 'completed' || (!artifact.sourceId && !artifact.content.trim())) throw new ExperimentError('只能采用这个方案中已完成的真实产物。');
    const previous = plans.filter(item => item.goalId === plan.goalId && item.adopted).map(item => item.selectedArtifactId).filter((id): id is string => !!id && id !== artifact.id);
    const previousSources = nodes.filter(node => previous.includes(node.id) && node.sourceId).map(node => node.sourceId!);
    nodes = invalidateExperimentNodes(nodes, new Set(nodes.filter(node => node.inputs.some(id => previous.includes(id)) || activeExperimentMethod(node)?.referenceIds.some(id => previousSources.includes(id))).map(node => node.id)));
    plans = plans.map(item => item.goalId === plan.goalId ? { ...item, adopted: item.id === plan.id, ...(item.id === plan.id ? { selectedArtifactId: artifact.id } : {}) } : item);
  } else if (operation.op === 'start-run') {
    assertExperimentRouteExecution(graph, operation.stepId);
    const step = findStep(operation.stepId);
    if (runs.some(run => run.stepId === step.id && run.status === 'running')) throw new ExperimentError('此步骤已有任务正在执行，请查询原任务。');
    if (runs.length >= 1000) throw new ExperimentError('当前实验台已达到 1000 次执行记录上限。');
    if (operation.methodId && operation.methodId !== step.activeMethodId) activate(step, operation.methodId);
    const method = activeExperimentMethod(step)!;
    if ((step.assetReferenceId || method.inputs.some(id => find(id).kind === 'skill' && find(id).assetReferenceId)) && !graph.environment) throw new ExperimentError('采用平台 Skill 后，请先检查依赖并记录当前实际环境，再开始执行。');
    if (operation.prompt !== undefined) method.prompt = operation.prompt;
    if (operation.referenceIds !== undefined) method.referenceIds = operation.referenceIds;
    if (operation.model !== undefined) method.model = operation.model;
    if (operation.parameters !== undefined) method.parameters = operation.parameters;
    if (method.inputs.some(id => find(id).status !== 'completed')) throw new ExperimentError('请先完成这个方法的上游输入。');
    step.prompt = method.prompt; step.method = method.title; step.inputs = [...method.inputs]; step.status = 'running'; step.error = undefined; step.revision++;
    const owner = plans.find(plan => plan.id === step.planId), proposal = graph.proposals?.find(item => item.id === owner?.proposalId);
    runs.push({ id: uid(), stepId: step.id, planId: step.planId!, method: structuredClone(method), inputRevisions: Object.fromEntries(method.inputs.map(id => [id, find(id).revision])), artifactIds: [], status: 'running', startedAt: new Date().toISOString(), policy: structuredClone(proposal?.policy || graph.policy || defaultExperimentPolicy()), proposalId: owner?.proposalId, routeId: owner?.routeId, ...(graph.environment ? { environment: structuredClone(graph.environment) } : {}) });
  } else if (operation.op === 'fail-run') {
    const run = runs.find(item => item.id === operation.runId);
    if (!run) throw new ExperimentError('找不到这次执行记录。');
    if (run.status !== 'running') throw new ExperimentError('这次执行已经结束。');
    if (run.artifactIds.some(id => find(id).status === 'running')) throw new ExperimentError('真实任务仍在运行，请查询或恢复原任务。');
    run.status = 'failed'; run.error = operation.error; run.finishedAt = new Date().toISOString();
    const step = findStep(run.stepId); step.status = 'failed'; step.error = operation.error;
  } else if (operation.op === 'recipe') {
    const recipe = experimentRecipes.find(r => r.id === operation.recipe)!;
    title = recipe.title;
    const planId = uid(); plans.push({ id: planId, title: recipe.title, goal: recipe.subtitle, goalId: planId });
    const ids = recipe.steps.map(() => uid()), offset = nodes.length ? Math.max(...nodes.map(n => n.position.y)) + 320 : 0;
    const added = recipe.steps.map((name, index): ExperimentNode => {
      const kind = index === 0 ? 'asset' : (recipe.artifacts as readonly string[]).includes(name) ? 'artifact' : 'step';
      return { ...experimentNodeInput.parse({ id: ids[index], planId, kind, title: name, description: index === 0 ? '连接当前创意里的真实素材，或在对话中说明创作目标。' : '', method: kind === 'step' ? recipe.methods[index] || '' : '', inputs: index ? [ids[index - 1]] : [] }), revision: 1, inputRevisions: {}, position: { x: index * 326, y: offset } };
    });
    nodes.push(...added);
  } else if (operation.op === 'freeze') {
    if (!nodes.length) throw new ExperimentError('先添加制作步骤，再保存流程。');
    if (templates.length >= 30) throw new ExperimentError('当前创意最多保存 30 个流程配方。');
    if (operation.planId) findPlan(operation.planId);
    const included = new Set(nodes.filter(node => !operation.planId || node.planId === operation.planId).map(node => node.id));
    const includeInputs = (id: string) => { const node = find(id); for (const input of [...node.inputs, ...(node.methods?.flatMap(method => method.inputs) || [])]) if (!included.has(input)) { included.add(input); includeInputs(input); } };
    [...included].forEach(includeInputs);
    const savedNodes = nodes.filter(node => included.has(node.id));
    if (!savedNodes.length) throw new ExperimentError('这个方案还没有步骤，请先添加步骤再保存配方。');
    const savedPlans = plans.filter(plan => savedNodes.some(node => node.planId === plan.id));
    const verified = savedNodes.some(n => n.kind === 'artifact' && n.status === 'completed' && (!!n.sourceId || !!n.content.trim())) && savedNodes.filter(n => n.kind !== 'artifact').every(n => n.status === 'completed' && (n.kind !== 'skill' || !!n.skill?.commit));
    templates.push({ id: uid(), title: operation.title, createdAt: new Date().toISOString(), verified, nodes: structuredClone(savedNodes), plans: structuredClone(savedPlans) });
  } else if (operation.op === 'instantiate') {
    const template = templates.find(t => t.id === operation.templateId);
    if (!template) throw new ExperimentError('找不到保存的流程。');
    const reusable = experimentPathNodes(template.nodes, template.plans || []);
    const ids = new Map(reusable.map(n => [n.id, uid()]));
    const planIds = new Map((template.plans || []).map(plan => [plan.id, uid()]));
    const goalIds = new Map((template.plans || []).map(plan => [plan.goalId, uid()]));
    plans.push(...(template.plans || []).map(plan => ({ ...plan, id: planIds.get(plan.id)!, goalId: goalIds.get(plan.goalId)!, basedOn: plan.basedOn ? planIds.get(plan.basedOn) : undefined, adopted: false, selectedArtifactId: undefined, proposalId: undefined, routeId: undefined })));
    const offset = nodes.length ? Math.max(...nodes.map(n => n.position.y)) + 320 : 0;
    nodes.push(...reusable.map(n => {
      const methodIds = new Map(n.methods?.map(method => [method.id, uid()]));
      return { ...structuredClone(n), id: ids.get(n.id)!, planId: n.planId ? planIds.get(n.planId) : undefined, inputs: n.inputs.map(id => ids.get(id)!), methods: n.methods?.map(method => ({ ...structuredClone(method), id: methodIds.get(method.id)!, inputs: method.inputs.map(id => ids.get(id)!), referenceIds: [] })), activeMethodId: n.activeMethodId ? methodIds.get(n.activeMethodId) : undefined, selectedInput: undefined, runId: undefined, error: undefined, mediaType: undefined, position: { x: n.position.x, y: n.position.y + offset }, status: n.kind === 'skill' ? 'completed' as const : 'planned' as const, sourceId: undefined, url: undefined, content: n.kind === 'skill' ? n.content : '', revision: 1, inputRevisions: {} };
    }));
    title = template.title;
  } else if (operation.op === 'layout') nodes = layoutExperiment(nodes, operation.dimensions);
  if (nodes.length > 160) throw new ExperimentError('当前实验台最多容纳 160 个节点。');
  if (plans.length > 80) throw new ExperimentError('当前实验台最多保留 80 个方案。');
  assertDAG(nodes);
  const updated = normalizeExperimentGraph({ ...graph, title, nodes, plans, runs, templates, revision: graph.revision + 1, updatedAt: new Date().toISOString() });
  if (updated.plans!.length > 80) throw new ExperimentError('当前实验台最多保留 80 个方案。');
  for (const node of updated.nodes) if (node.methods) {
    if (new Set(node.methods.map(method => method.id)).size !== node.methods.length) throw new ExperimentError('方法 ID 不能重复。');
    for (const method of node.methods) {
      if (method.inputs.includes(node.id) || method.inputs.some(id => !updated.nodes.some(input => input.id === id))) throw new ExperimentError('方法的输入节点不存在或引用了自身。');
      assertDAG(updated.nodes.map(item => item.id === node.id ? { ...item, inputs: method.inputs } : item));
    }
  }
  return updated;
}
