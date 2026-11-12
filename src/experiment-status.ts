import { activeExperimentMethod, experimentStatusLabels, type ExperimentGraph, type ExperimentNode } from '../shared/experiment';

export type ExperimentNodePresentation = { label: string; hint?: string; completedArtifactId?: string };

export function completedPlanArtifact(graph: ExperimentGraph, planId?: string, includeOriginal = false): ExperimentNode | undefined {
  const seen = new Set<string>();
  while (planId && !seen.has(planId)) {
    seen.add(planId);
    const artifact = graph.nodes.filter(node => node.planId === planId && node.kind === 'artifact' && node.status === 'completed' && (node.sourceId || node.content.trim())).at(-1);
    if (artifact) return artifact;
    planId = includeOriginal ? graph.plans?.find(plan => plan.id === planId)?.basedOn : undefined;
  }
  return undefined;
}

/** Describe the selected method and empty alternatives without changing execution evidence. */
export function experimentNodePresentation(node: ExperimentNode, graph: ExperimentGraph): ExperimentNodePresentation {
  const label = experimentStatusLabels[node.status];
  if (node.status !== 'planned') return { label };
  const plan = graph.plans?.find(item => item.id === node.planId);
  const untouchedAlternative = !!plan?.basedOn && !graph.runs?.some(run => run.planId === plan.id);
  const originalOutput = untouchedAlternative ? completedPlanArtifact(graph, plan?.basedOn, true) : undefined;
  if (node.kind === 'artifact' && !node.runId && !node.sourceId && !node.content.trim()) return {
    label: '尚无产物', hint: untouchedAlternative ? '这条备选尚未执行，执行后将在这里显示结果。' : '执行后将在这里显示这一步的真实结果。', completedArtifactId: originalOutput?.id,
  };
  if (node.kind !== 'step') return { label };
  if (untouchedAlternative) return { label: '备选未执行', hint: originalOutput ? '原方案已有完成结果，这条备选尚未运行。' : '这是一条独立备选，尚未产生执行记录。', completedArtifactId: originalOutput?.id };
  const method = activeExperimentMethod(node);
  const runs = graph.runs?.filter(run => run.stepId === node.id) || [];
  if (runs.length && !runs.some(run => run.method.id === method?.id)) {
    const outputIds = new Set(runs.filter(run => run.status === 'completed').flatMap(run => run.artifactIds));
    const completed = graph.nodes.filter(item => outputIds.has(item.id) && item.status === 'completed').at(-1);
    return { label: '当前方法未执行', hint: completed ? `已有其他方法的完成结果；当前选择的是「${method?.title || '备选方法'}」。` : `当前选择的「${method?.title || '备选方法'}」尚未执行，其他方法的记录仍然保留。`, completedArtifactId: completed?.id };
  }
  return { label };
}
