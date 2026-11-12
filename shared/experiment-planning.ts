import { z } from 'zod';
import type { ExperimentGraph, ExperimentMethod, ExperimentNode, ExperimentPlan } from './experiment';

const id = z.string().regex(/^[\w-]{1,100}$/);
const text = (max: number) => z.string().trim().min(1).max(max);
export const experimentLevels = [
  { level: 0, name: 'Native', title: '自主完成', description: '用现有能力选一条合适路线，直接开始。', candidateLimit: 3, maxRoutes: 1 },
  { level: 1, name: '探索', title: '比较做法', description: '比较不同做法、提示词和素材，再选路线。', candidateLimit: 8, maxRoutes: 4 },
  { level: 3, name: '研究', title: '深入研究', description: '查阅相关 Skill、开源项目与专业方法，深入研究路线。', candidateLimit: 12, maxRoutes: 6 },
] as const;
// Keep persisted research ID 3; the retired experiment ID 2 aliases exploration.
export function experimentLevel(level: number) {
  return experimentLevels.find(preset => preset.level === (level === 2 ? 1 : level)) || experimentLevels[0];
}
export const experimentPolicySchema = z.object({
  level: z.number().int().min(0).max(3), decision: z.enum(['auto', 'choose']), maxRoutes: z.number().int().min(1).max(6),
});
export type ExperimentPolicy = z.infer<typeof experimentPolicySchema>;
export function defaultExperimentPolicy(level = 0): ExperimentPolicy {
  const preset = experimentLevel(level);
  return { level: preset.level, decision: preset.level === 0 ? 'auto' : 'choose', maxRoutes: preset.maxRoutes };
}
export function normalizeExperimentPolicy(policy?: ExperimentPolicy): ExperimentPolicy {
  return policy ? { ...policy, level: experimentLevel(policy.level).level } : defaultExperimentPolicy();
}
export const routeReadinessLabels = { ready: '可开始', 'needs-input': '待补素材', 'needs-setup': '待准备环境', unverified: '待核实', unavailable: '暂不可用' } as const;
export const routeToolSchema = z.enum(['generate_image', 'generate_video', 'generate_minimax_video', 'generate_first_last_frame_video', 'generate_grid_video', 'programmatic', 'agent', 'manual']);
export const routeStepSchema = z.object({
  title: text(120), description: z.string().max(2000).default(''), prompt: z.string().max(16000).default(''),
  tool: routeToolSchema, model: z.string().max(120).default(''), referenceIds: z.array(id).max(20).default([]),
  parameters: z.record(z.string().max(120), z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()])).default({}),
});
export const experimentRouteSchema = z.object({
  id, familyId: id, title: text(120), description: text(2000), expectedOutcome: text(2000), tradeoff: z.string().max(2000).default(''),
  recommended: z.boolean().default(false), readiness: z.enum(['ready', 'needs-input', 'needs-setup', 'unverified', 'unavailable']),
  readinessReason: text(2000), requirements: z.array(text(500)).max(20).default([]),
  costNote: z.string().max(500).default('费用与耗时以实际执行为准'),
  sources: z.array(z.object({ kind: z.enum(['agent', 'space-skill', 'platform-skill', 'github-skill', 'repository', 'documentation']), title: text(160), url: z.string().url().startsWith('https://').max(2000).optional(), referenceId: id.optional() })).max(12).default([]),
  steps: z.array(routeStepSchema).min(1).max(8),
});
export type ExperimentRoute = z.infer<typeof experimentRouteSchema>;
export const experimentBriefSchema = z.object({
  originalPrompt: text(12000), goal: text(2000), assumptions: z.array(text(500)).max(12).default([]), constraints: z.array(text(500)).max(12).default([]),
});
const proposeRoutes = z.object({
  op: z.literal('propose-routes'), brief: experimentBriefSchema,
  families: z.array(z.object({ id, title: text(120), description: z.string().max(1000).default('') })).min(1).max(8),
  routes: z.array(experimentRouteSchema).min(1).max(12),
});
const selectRoutes = z.object({ op: z.literal('select-routes'), proposalId: id, routeIds: z.array(id).min(1).max(6) });
export const experimentPlanningOperations = [
  z.object({ op: z.literal('policy'), policy: experimentPolicySchema }), proposeRoutes, selectRoutes,
] as const;
export type PlanningOperation = z.infer<typeof experimentPlanningOperations[number]>;
export type ExperimentProposal = Omit<z.infer<typeof proposeRoutes>, 'op'> & {
  id: string; createdAt: string; policy: ExperimentPolicy; selectedRouteIds: string[];
};
export class ExperimentPlanningError extends Error { status = 400; }
export function activeExperimentProposal(graph: ExperimentGraph) {
  return graph.proposals?.find(proposal => proposal.id === graph.activeProposalId);
}

function selectProposalRoutes(graph: ExperimentGraph, proposal: ExperimentProposal, routeIds: string[], uid: () => string): ExperimentGraph {
  if (new Set(routeIds).size !== routeIds.length) throw new ExperimentPlanningError('路线不能重复选择。');
  if (routeIds.length > proposal.policy.maxRoutes) throw new ExperimentPlanningError(`本次最多选择 ${proposal.policy.maxRoutes} 条路线。`);
  const routes = routeIds.map(routeId => {
    const route = proposal.routes.find(item => item.id === routeId);
    if (!route || route.readiness !== 'ready') throw new ExperimentPlanningError('请先补齐所选路线的素材、环境或能力条件。');
    return route;
  });
  if (graph.runs?.some(run => run.status === 'running')) throw new ExperimentPlanningError('有步骤正在执行，请结束后再调整路线。');
  const nodes = [...graph.nodes], plans = [...(graph.plans || [])];
  let offset = nodes.length ? Math.max(...nodes.map(node => node.position.y)) + 300 : 0;
  for (const route of routes) {
    if (plans.some(plan => plan.proposalId === proposal.id && plan.routeId === route.id)) continue;
    const planId = uid();
    const plan: ExperimentPlan = { id: planId, title: route.title, goal: proposal.brief.goal, goalId: proposal.id, proposalId: proposal.id, routeId: route.id };
    plans.push(plan);
    let previousOutput: string | undefined;
    for (const [index, step] of route.steps.entries()) {
      const inputs: string[] = previousOutput ? [previousOutput] : [];
      for (const sourceId of step.referenceIds) {
        let asset = nodes.find(node => node.kind === 'asset' && node.sourceId === sourceId && node.status === 'completed');
        if (!asset) {
          asset = { id: uid(), kind: 'asset', title: '参考素材', description: '', prompt: '', content: '', method: '', sourceId, status: 'completed', inputs: [], revision: 1, inputRevisions: {}, position: { x: -326, y: offset } };
          nodes.push(asset);
        }
        if (!inputs.includes(asset.id)) inputs.push(asset.id);
      }
      const stepId = uid(), outputId = uid(), methodId = uid();
      const method: ExperimentMethod = { id: methodId, title: step.model || step.title, description: step.description, prompt: step.prompt, inputs, referenceIds: [...step.referenceIds], model: step.model, parameters: { ...step.parameters } };
      const node: ExperimentNode = { id: stepId, planId, kind: 'step', title: step.title, description: step.description, method: method.title, prompt: step.prompt, content: '', status: 'planned', inputs, methods: [method], activeMethodId: methodId, revision: 1, inputRevisions: {}, position: { x: index * 652, y: offset }, routeStepIndex: index };
      nodes.push(node, { id: outputId, planId, kind: 'artifact', title: `${step.title} · 产物`.slice(0, 120), description: route.expectedOutcome, prompt: '', method: '', content: '', status: 'planned', inputs: [stepId], revision: 1, inputRevisions: {}, position: { x: index * 652 + 326, y: offset } });
      previousOutput = outputId;
    }
    offset += 300;
  }
  if (nodes.length > 160 || plans.length > 80) throw new ExperimentPlanningError('实验台已达到容量上限，请减少本次路线或步骤数量。');
  return { ...graph, nodes, plans, activeProposalId: proposal.id, proposals: graph.proposals!.map(item => item.id === proposal.id ? { ...item, selectedRouteIds: [...routeIds] } : item) };
}

export function applyExperimentPlanning(graph: ExperimentGraph, operation: PlanningOperation, uid: () => string): ExperimentGraph {
  let updated = graph;
  if (graph.runs?.some(run => run.status === 'running')) throw new ExperimentPlanningError('有步骤正在执行，请结束后再调整实验设置或路线。');
  if (operation.op === 'policy') updated = { ...graph, policy: normalizeExperimentPolicy(operation.policy) };
  if (operation.op === 'propose-routes') {
    const policy = normalizeExperimentPolicy(graph.policy);
    if (operation.routes.length > experimentLevel(policy.level).candidateLimit) throw new ExperimentPlanningError('候选路线超出当前实验深度，请合并相近做法。');
    if (new Set(operation.families.map(family => family.id)).size !== operation.families.length || new Set(operation.routes.map(route => route.id)).size !== operation.routes.length) throw new ExperimentPlanningError('方法类别或路线 ID 重复。');
    if (operation.routes.some(route => !operation.families.some(family => family.id === route.familyId))) throw new ExperimentPlanningError('候选路线缺少对应的方法类别。');
    if ((graph.proposals?.length || 0) >= 40) throw new ExperimentPlanningError('当前创意已保留 40 次路线提案，请新建创意继续。');
    const proposal: ExperimentProposal = { id: uid(), brief: structuredClone(operation.brief), families: structuredClone(operation.families), routes: structuredClone(operation.routes), policy: { ...policy }, selectedRouteIds: [], createdAt: new Date().toISOString() };
    updated = { ...graph, policy, activeProposalId: proposal.id, proposals: [...(graph.proposals || []), proposal] };
    if (policy.decision === 'auto') {
      const route = proposal.routes.find(item => item.recommended && item.readiness === 'ready') || proposal.routes.find(item => item.readiness === 'ready');
      if (route) updated = selectProposalRoutes(updated, proposal, [route.id], uid);
    }
  }
  if (operation.op === 'select-routes') {
    const proposal = graph.proposals?.find(item => item.id === operation.proposalId);
    if (!proposal) throw new ExperimentPlanningError('找不到这份路线提案，请刷新后重试。');
    updated = selectProposalRoutes(graph, proposal, operation.routeIds, uid);
  }
  return { ...updated, revision: graph.revision + 1, updatedAt: new Date().toISOString() };
}

/** A saved proposal is a decision boundary; a graph step alone does not select a route. */
export function assertExperimentRouteExecution(graph: ExperimentGraph, stepId?: string, tool?: string) {
  const proposal = activeExperimentProposal(graph);
  if (!proposal) {
    if ((graph.policy || defaultExperimentPolicy()).decision === 'choose') throw new ExperimentPlanningError('请先让 Agent 提出路线，并在实验台选择后再执行。');
    return;
  }
  const step = graph.nodes.find(node => node.id === stepId && node.kind === 'step');
  const plan = graph.plans?.find(item => item.id === step?.planId && item.proposalId === proposal.id);
  const route = proposal.routes.find(item => item.id === plan?.routeId);
  if (!step || !plan || !route || !proposal.selectedRouteIds.includes(route.id)) throw new ExperimentPlanningError('这一步不在当前选定路线中，请先在实验台选择路线。');
  if (route.readiness !== 'ready') throw new ExperimentPlanningError('这条路线的执行条件尚未补齐。');
  if (tool) {
    const expected = step.routeStepIndex === undefined ? undefined : route.steps[step.routeStepIndex]?.tool;
    if (expected ? expected !== tool : !route.steps.some(item => item.tool === tool)) throw new ExperimentPlanningError('执行工具与选定路线不一致，请调整路线后再开始。');
  }
}

export function experimentRoutePrompt(proposal: ExperimentProposal, plans: ExperimentPlan[]) {
  const selected = proposal.routes.filter(route => proposal.selectedRouteIds.includes(route.id));
  return `请执行我在实验台选定的路线（proposalId：${proposal.id}）。\n原始要求：${proposal.brief.originalPrompt}\n目标：${proposal.brief.goal}\n${selected.map(route => `- ${route.title}（routeId：${route.id}，planId：${plans.find(plan => plan.proposalId === proposal.id && plan.routeId === route.id)?.id || ''}）：${route.expectedOutcome}`).join('\n')}\n先读取 get_creative，使用已创建的方案与保存的方法，按依赖顺序执行所选路线。每次生成传 stepId，保留各自的真实产物；已完成步骤优先复用。不要扩大到未选路线；缺少条件时说明，并保留当前状态。最后比较实际结果，等待我选择采用。`;
}
