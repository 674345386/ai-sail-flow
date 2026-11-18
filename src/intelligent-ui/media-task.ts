import type { Project } from '../../shared/domain';
import { activeExperimentProposal } from '../../shared/experiment-planning';
import type { AgentState } from '../../shared/intelligent-ui';

export function hasAgentMediaTask(project: Project, { messages, experiment, canvasComponents }: AgentState): boolean {
  if (project.assets.some(asset => asset.kind === 'product' || asset.kind === 'video') ||
      messages.some(message => message.images?.length || message.videos?.length)) return true;

  if (project.agentImages?.length || project.generatedVideos.length || project.composedVideos?.length ||
      project.storyboardGrids?.length || project.productionStoryboards?.length || project.videoProductionPlan || project.analysis || project.rewrite || project.job || project.workflow ||
      project.remix?.character || project.remix?.plan || project.remix?.videos.length || canvasComponents?.length) return true;

  if (!experiment) return false;
  const visualMedia = (item: { mediaType?: string }) => item.mediaType === 'image' || item.mediaType === 'video';
  return Boolean(experiment.files?.some(visualMedia) || experiment.nodes.some(visualMedia) ||
    activeExperimentProposal(experiment)?.routes.some(route => route.steps.some(step => step.tool.startsWith('generate_'))));
}
