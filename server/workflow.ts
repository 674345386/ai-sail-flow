import { randomUUID } from 'node:crypto';
import type { Project, WorkflowMode } from '../shared/domain';
import { buildVeoPlan } from '../shared/veo-plan';
import { editableUnitPrompt, nextWorkflowAction, workflowBusy, workflowRequirements } from '../shared/workflow';
import { getProject, saveProject } from './store';
import { launchTask, TaskError, type TaskSpec } from './tasks';
import { configured } from './gemini';
import { generationConfigured } from './veo';
import { TimingConfirmationRequired } from './compose';

const runners = new Set<string>();
const save = (id: string, change: (p: Project) => Project) => saveProject(change(getProject(id)!));

export function setWorkflowMode(id: string, mode: WorkflowMode) {
  const p = getProject(id)!;
  if (mode === 'manual' && workflowBusy(p)) return saveProject({ ...p, workflowMode: mode, workflow: { ...p.workflow!, status: 'pausing', message: '正在接管：当前任务完成后停止后续步骤。' } });
  if (mode === 'automatic' && workflowBusy(p)) return p;
  return saveProject({ ...p, workflowMode: mode });
}

export function startWorkflow(id: string, maxNewClips: number) {
  const p = getProject(id)!;
  if (runners.has(id) || workflowBusy(p) || p.job?.status === 'running') throw new TaskError(409, '当前任务正在处理，请等待完成。');
  const continuing = p.workflow && p.workflow.status !== 'completed';
  const missing = workflowRequirements(p);
  if (!configured() && (!p.analysis || (p.promptFlow !== 'direct-analysis' && (!p.rewrite || p.rewriteStale)))) missing.push('连接 Gemini');
  const next = nextWorkflowAction(p);
  if (!generationConfigured() && next.kind !== 'compose' && next.kind !== 'completed') missing.push('连接 Veo');
  const now = new Date().toISOString();
  const saved = saveProject({ ...p, workflowMode: 'automatic', workflow: {
    id: continuing ? p.workflow!.id : randomUUID(), status: missing.length ? 'needs-input' : 'running',
    stage: continuing ? p.workflow!.stage : 'analysis', message: missing.length ? missing.join('；') : '正在准备自动制作…',
    startedAt: continuing ? p.workflow!.startedAt : now, maxNewClips, newClipCount: continuing ? p.workflow!.newClipCount : 0,
  } });
  if (!missing.length) {
    runners.add(id);
    void run(id).finally(() => runners.delete(id));
  }
  return saved;
}

async function run(id: string) {
  try {
    while (true) {
      let p = getProject(id)!;
      if (p.workflow?.status !== 'running' || p.workflowMode !== 'automatic') break;
      const action = nextWorkflowAction(p);
      if (action.kind === 'completed') {
        save(id, current => ({ ...current, workflow: { ...current.workflow!, status: 'completed', stage: 'completed', message: '视频制作完成，可以预览和下载。', finishedAt: new Date().toISOString() } }));
        return;
      }
      let task: TaskSpec;
      if (action.kind === 'generation') {
        if (!action.recoverId && p.workflow!.newClipCount >= p.workflow!.maxNewClips) {
          save(id, current => ({ ...current, workflow: { ...current.workflow!, status: 'needs-input', stage: 'generation', message: '已达到本次新生成片段上限。请提高上限后继续，或接管制作。' } }));
          return;
        }
        const unit = buildVeoPlan(p.rewrite!.shots).find(unit => unit.id === action.unitId)!;
        const settings = { resolution: p.automaticSettings?.resolution || '720p' as const, aspectRatio: p.market.aspectRatio === '16:9' ? '16:9' as const : '9:16' as const };
        task = action.recoverId ? { kind: 'recover', videoId: action.recoverId } : { kind: 'generation', input: {
          unitId: unit.id, prompt: editableUnitPrompt(p, unit), mode: 't2v', images: [], ...settings,
        } };
      } else task = action.kind === 'compose' ? { kind: 'compose' } : { kind: action.kind };
      const stage = action.kind === 'compose' ? 'composition' : action.kind;
      save(id, current => ({ ...current, workflow: { ...current.workflow!, stage, unitId: action.kind === 'generation' ? action.unitId : undefined, message: action.kind === 'generation' ? `正在制作 ${action.unitId}` : action.kind === 'analysis' ? '正在理解参考视频' : action.kind === 'rewrite' ? current.promptFlow === 'direct-analysis' ? '正在整理原片分析为可编辑 Prompt' : '正在生成本地化分镜' : '正在完成最终视频' } }));
      await launchTask(id, task);
      p = getProject(id)!;
      if (p.workflow?.status !== 'running') break;
    }
    save(id, p => ({ ...p, workflow: { ...p.workflow!, status: 'paused', message: '已停止自动推进，当前结果可在手动工作台查看和编辑。' } }));
  } catch (error) {
    save(id, p => ({ ...p, workflow: { ...p.workflow!, status: p.workflow?.status === 'pausing' ? 'paused' : error instanceof TimingConfirmationRequired || error instanceof TaskError && error.status < 500 ? 'needs-input' : 'failed',
      stage: error instanceof TimingConfirmationRequired ? 'composition' : p.workflow!.stage,
      message: error instanceof Error ? error.message : '制作暂停，请检查当前阶段后继续。' } }));
  }
}
