import type { ExperimentGraph, ExperimentOperation } from '../shared/experiment';
import { ExperimentPlanningError } from '../shared/experiment-planning';

type ProposalOperation = Extract<ExperimentOperation, { op: 'propose-routes' }>;
export type PlanningCapabilities = { programmatic: boolean; image: boolean; omni: boolean; minimax: boolean; referenceStorage: boolean };

/** Check claims against this creative's real inputs and currently connected capabilities. */
export function prepareExperimentProposal(operation: ProposalOperation, graph: ExperimentGraph, capabilities: PlanningCapabilities, referenceIds: Set<string>): ProposalOperation {
  if (JSON.stringify(operation).length > 180_000) throw new ExperimentPlanningError('路线提案过长，请精简步骤与提示词。');
  const adoptedIds = new Set(graph.assetReferences?.map(reference => reference.id));
  const routes = operation.routes.map(route => {
    for (const source of route.sources) if (source.referenceId && ['space-skill', 'platform-skill'].includes(source.kind) && !adoptedIds.has(source.referenceId)) throw new ExperimentPlanningError('Skill 引用不在当前空间中，请先读取或采用真实方法。');
    for (const step of route.steps) {
      if (new Set(step.referenceIds).size !== step.referenceIds.length || step.referenceIds.some(referenceId => !referenceIds.has(referenceId))) throw new ExperimentPlanningError('路线包含重复或不属于当前创意的参考图，请先核对 get_creative.imageReferences。');
    }
    if (route.readiness !== 'ready') return route;
    const unavailable = route.steps.find(step =>
      step.tool === 'programmatic' ? !capabilities.programmatic
        : step.tool === 'generate_image' ? !capabilities.image
          : step.tool === 'generate_minimax_video' ? !capabilities.minimax
            : step.tool === 'manual' ? true : step.tool === 'agent' ? false : !capabilities.omni);
    if (unavailable) return { ...route, readiness: unavailable.tool === 'programmatic' || unavailable.tool === 'manual' ? 'needs-setup' as const : 'unavailable' as const,
      readinessReason: unavailable.tool === 'programmatic' ? '当前空间未开放程序化执行，需要可用的执行环境。' : unavailable.tool === 'manual' ? '这条路线需要人工操作，完成准备后再更新提案。' : '当前空间尚未连接这条路线需要的生成服务。' };
    if (!capabilities.referenceStorage && route.steps.some(step => ['generate_video', 'generate_first_last_frame_video', 'generate_grid_video'].includes(step.tool) && step.referenceIds.length)) return { ...route, readiness: 'needs-setup' as const, readinessReason: '这条参考图生成路线需要先连接图片存储。' };
    return route;
  });
  return { ...operation, routes };
}
