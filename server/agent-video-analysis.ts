import type { Analysis, AnalysisMeta, Project, ShotSuggestion } from '../shared/domain';
import type { ReferenceScene } from '../shared/agent-video-analysis';
import type { VideoMasterPrompt } from '../shared/video-production';
import { getAgentState, startAgentTurn, subscribeAgent } from './creative-agent';
import { workspacePath } from './workspace-storage';

export type FullReferenceAnalysis = {
  result: Analysis;
  meta: AnalysisMeta;
  scenes: ReferenceScene[];
  masterPrompt?: VideoMasterPrompt;
};
type ShotReview = {
  suggestions: Record<string, ShotSuggestion>;
  globalFocusSuggestion?: Analysis['focusPoints'];
};
type AnalysisJob =
  | { kind: 'analysis'; save: (result: FullReferenceAnalysis) => Promise<void> }
  | { kind: 'analysis-refine'; save: (result: ShotReview) => Promise<void> };
type PendingAnalysis = AnalysisJob & { jobId: string; revision: number };

const pending = new Map<string, PendingAnalysis>();

export function pendingReferenceAnalysis(project: Project) {
  const task = pending.get(workspacePath('agent-sessions', project.id));
  return project.job?.status === 'running' && project.job.id === task?.jobId ? task : undefined;
}

export async function runReferenceAnalysis(project: Project, analysis: AnalysisJob) {
  const { id, job, revision } = project;
  const key = workspacePath('agent-sessions', id);
  const current = getAgentState(id);
  if (current.status === 'running') throw new Error('创作 Agent 正在执行，请等待当前任务完成。');
  const prompt = analysis.kind === 'analysis'
    ? '请拆解当前创意的参考视频。先用 get_creative 确认素材，再用 analyze_reference 读取原片画面，最后调用 save_reference_analysis 保存逐镜头分析和场景表。只做分析。'
    : '请重新分析 get_creative 中 analysis.pendingShotIds 指定的镜头。按各镜头原片起止时间调用 analyze_reference，保留现有边界，最后用 save_reference_shot_review 一次保存全部待分析镜头的建议。只做分析。';

  let unsubscribe: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      let submitted = false;
      let started = false;
      const submit = <T>(save: (result: T) => Promise<void>) => async (result: T) => {
        if (submitted) throw new Error('该分析任务已提交结果。');
        submitted = true;
        try {
          await save(result);
          resolve();
        } catch (error) {
          reject(error);
          throw error;
        }
      };
      const jobRef = { jobId: job!.id, revision };
      if (analysis.kind === 'analysis') pending.set(key, { ...jobRef, kind: analysis.kind, save: submit(analysis.save) });
      else pending.set(key, { ...jobRef, kind: analysis.kind, save: submit(analysis.save) });
      unsubscribe = subscribeAgent(id, state => {
        if (state.status === 'running') started = true;
        else if (started && !submitted) reject(new Error(state.error || '创作 Agent 已结束，未保存视频分析结果。'));
      });
      void startAgentTurn(id, prompt, [], [], [], []).catch(error => {
        if (!submitted) reject(error);
      });
    });
  } finally {
    unsubscribe?.();
    pending.delete(key);
  }
}
