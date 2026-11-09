import type { ExperimentGraph, ExperimentMethod, ExperimentNode, ExperimentPlan, ExperimentRun } from './experiment';

export function activeExperimentMethod(node: ExperimentNode): ExperimentMethod | undefined {
  return node.methods?.find(method => method.id === node.activeMethodId) || node.methods?.[0];
}

export function methodMatchesRun(node: ExperimentNode, run: ExperimentRun, nodes: ExperimentNode[]) {
  const method = activeExperimentMethod(node);
  return !!method && run.method.id === method.id &&
    JSON.stringify([method.prompt, method.inputs, method.referenceIds, method.model, method.parameters]) ===
    JSON.stringify([run.method.prompt, run.method.inputs, run.method.referenceIds, run.method.model, run.method.parameters]) &&
    method.inputs.every(id => { const input = nodes.find(item => item.id === id); return input?.status === 'completed' && input.revision === run.inputRevisions[id]; });
}

/** Add logical ownership without moving nodes or replacing any existing media. IDs are deterministic for old sessions. */
export function normalizeExperimentGraph(graph: ExperimentGraph): ExperimentGraph {
  if (graph.organizationVersion === 1 && graph.plans && graph.runs && graph.nodes.every(node => {
    if (node.kind === 'step') { const method = activeExperimentMethod(node); return !!method && method.id === node.activeMethodId && graph.plans!.some(plan => plan.id === node.planId) && node.prompt === method.prompt && node.method === method.title && JSON.stringify(node.inputs) === JSON.stringify(method.inputs); }
    if (node.kind === 'artifact') { const step = graph.nodes.find(item => item.kind === 'step' && node.inputs.includes(item.id)); return !step || (node.planId === step.planId && ((!node.sourceId && !node.content.trim()) || !!node.runId)); }
    return true;
  })) return graph;
  const plans = (graph.plans || []).map(plan => ({ ...plan }));
  const nodes = graph.nodes.map(node => ({ ...node }));
  const runs = [...(graph.runs || [])];
  const byId = new Map(nodes.map(node => [node.id, node]));
  const visiting = new Set<string>();
  const owner = (node: ExperimentNode): string | undefined => {
    if (node.planId && plans.some(plan => plan.id === node.planId)) return node.planId;
    if (visiting.has(node.id)) return undefined;
    visiting.add(node.id);
    const upstream = node.inputs.map(id => byId.get(id)).find(input => input && ['step', 'artifact'].includes(input.kind));
    let planId = upstream && owner(upstream);
    if (!planId && node.kind === 'step') {
      planId = `plan-${node.id}`.slice(0, 100);
      if (!plans.some(plan => plan.id === planId)) plans.push({ id: planId, title: node.title.slice(0, 120), goal: node.description || node.title, goalId: planId });
    }
    visiting.delete(node.id);
    if (planId) node.planId = planId;
    return planId;
  };
  for (const node of nodes) if (node.kind === 'step' || node.kind === 'artifact') owner(node);
  for (const node of nodes) if (node.kind === 'step') {
    if (!node.methods?.length) {
      const output = nodes.find(item => item.kind === 'artifact' && item.inputs.includes(node.id) && item.title.length > 48);
      node.methods = [{ id: `method-${node.id}`.slice(0, 100), title: node.method || '方法 A', description: '', prompt: node.prompt || output?.title || '', inputs: [...node.inputs], referenceIds: [], model: '', parameters: {} }];
    }
    node.activeMethodId = activeExperimentMethod(node)!.id;
    const method = activeExperimentMethod(node)!;
    node.prompt = method.prompt; node.method = method.title; node.inputs = [...method.inputs];
  }
  for (const node of nodes) if (node.kind === 'artifact') {
    const step = node.inputs.map(id => byId.get(id)).find(input => input?.kind === 'step');
    if (!step?.planId) continue;
    node.planId = step.planId;
    if (node.runId || (!node.sourceId && !node.content.trim())) continue;
    const method = activeExperimentMethod(step)!;
    const id = `run-${node.id}`.slice(0, 100);
    node.runId = id; node.planId = step.planId;
    if (node.title.length > 48 && !node.content) node.title = `${step.title} · 产物`.slice(0, 120);
    if (!runs.some(run => run.id === id)) runs.push({ id, stepId: step.id, planId: step.planId, method: structuredClone(method), inputRevisions: Object.fromEntries(method.inputs.map(inputId => [inputId, byId.get(inputId)?.revision || 0])), artifactIds: [node.id], status: node.status === 'failed' ? 'failed' : node.status === 'running' ? 'running' : 'completed', startedAt: graph.updatedAt });
  }
  // Old comparison nodes represented alternative steps; retain them and join their plans under the same goal.
  if (graph.organizationVersion !== 1) for (const comparison of nodes.filter(node => node.kind === 'compare')) {
    const alternatives = comparison.inputs.map(id => plans.find(plan => plan.id === byId.get(id)?.planId)).filter((plan): plan is ExperimentPlan => !!plan);
    if (alternatives.length > 1) for (const plan of alternatives.slice(1)) { plan.goalId = alternatives[0].goalId; plan.basedOn ||= alternatives[0].id; }
  }
  if (graph.organizationVersion === 1 && JSON.stringify([nodes, plans, runs]) === JSON.stringify([graph.nodes, graph.plans, graph.runs])) return graph;
  return { ...graph, organizationVersion: 1, nodes, plans, runs };
}
