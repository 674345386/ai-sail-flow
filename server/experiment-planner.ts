import type { ExperimentGraph, ExperimentOperation } from '../shared/experiment';
import { ExperimentPlanningError } from '../shared/experiment-planning';
import { H3_MIN_SECONDS } from '../shared/video-production';
import { getCapabilityRegistry } from './capability-registry';

type ProposalOperation = Extract<ExperimentOperation, { op: 'propose-routes' }>;
export type PlanningCapabilities = { programmatic: boolean; ffmpegSkill?: boolean; image: boolean; omni: boolean; minimax: boolean; referenceStorage: boolean; videoDurations?: Record<string, number> };

const LOCAL_ROUTE_TOOLS = new Set(['agent', 'build_video_storyboard', 'build_animatic_preview', 'inspect_artifact_quality', 'compose_video', 'ffmpeg_skill']);
const VIDEO_ROUTE_TOOLS = new Set(['generate_video', 'generate_minimax_video', 'generate_first_last_frame_video', 'generate_grid_video']);

function needsOmni(step: ExperimentRouteStep, capabilities: PlanningCapabilities) {
  if (!['generate_video', 'generate_first_last_frame_video'].includes(step.tool)) return false;
  const { sourceVideoId, start, end } = step.parameters;
  if (typeof sourceVideoId === 'string') {
    const finish = typeof end === 'number' ? end : capabilities.videoDurations?.[sourceVideoId];
    return finish !== undefined && finish - (typeof start === 'number' ? start : 0) >= H3_MIN_SECONDS - 1e-6;
  }
  return step.model.startsWith('omni_flash');
}
type ExperimentRouteStep = ProposalOperation['routes'][number]['steps'][number];

/** Check claims against this creative's real inputs and currently connected capabilities. */
export function prepareExperimentProposal(operation: ProposalOperation, graph: ExperimentGraph, capabilities: PlanningCapabilities, referenceIds: Set<string>): ProposalOperation {
  if (JSON.stringify(operation).length > 180_000) throw new ExperimentPlanningError('路线提案过长，请精简步骤与提示词。');
  const adoptedIds = new Set(graph.assetReferences?.map(reference => reference.id));
  const pluginTools = new Set(getCapabilityRegistry().tools.filter(item => item.source === 'plugin').map(item => item.id));
  const routes = operation.routes.map(route => {
    for (const source of route.sources) if (source.referenceId && ['space-skill', 'platform-skill'].includes(source.kind) && !adoptedIds.has(source.referenceId)) throw new ExperimentPlanningError('Skill 引用不在当前空间中，请先读取或采用真实方法。');
    for (const step of route.steps) {
      if (new Set(step.referenceIds).size !== step.referenceIds.length || step.referenceIds.some(referenceId => !referenceIds.has(referenceId))) throw new ExperimentPlanningError('路线包含重复或不属于当前创意的参考图，请先核对 get_creative.imageReferences。');
    }
    if (route.readiness !== 'ready') return route;
    if (!capabilities.ffmpegSkill && route.steps.some(step => step.tool === 'ffmpeg_skill')) return { ...route, readiness: 'needs-setup' as const, readinessReason: 'FFmpeg Skill 需要 Python 3.10+ 和 FFmpeg / ffprobe 6.1+。' };
    const unavailable = route.steps.find(step =>
      step.tool === 'programmatic' ? !capabilities.programmatic
        : step.tool === 'generate_image' ? !capabilities.image
          : step.tool === 'manual' ? true
            : LOCAL_ROUTE_TOOLS.has(step.tool) || pluginTools.has(step.tool) ? false
              : VIDEO_ROUTE_TOOLS.has(step.tool) ? (needsOmni(step, capabilities) ? !capabilities.omni : !capabilities.minimax)
                : false);
    if (unavailable) return { ...route, readiness: unavailable.tool === 'programmatic' || unavailable.tool === 'manual' ? 'needs-setup' as const : 'unavailable' as const,
      readinessReason: unavailable.tool === 'programmatic' ? '当前空间未开放程序化执行，需要可用的执行环境。' : unavailable.tool === 'manual' ? '这条路线需要人工操作，完成准备后再更新提案。' : '当前空间尚未连接这条路线需要的生成服务。' };
    if (!capabilities.referenceStorage && route.steps.some(step => needsOmni(step, capabilities) && (step.referenceIds.length || step.parameters.sourceVideoId))) return { ...route, readiness: 'needs-setup' as const, readinessReason: '此 Omni 路线需要配置 Supabase 私有素材存储。' };
    return route;
  });
  return { ...operation, routes };
}
