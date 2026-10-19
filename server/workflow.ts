import { randomUUID } from 'node:crypto';
import type { Project, WorkflowMode, WorkflowTarget } from '../shared/domain';
import { buildVeoPlan } from '../shared/veo-plan';
import { editableUnitPrompt, nextWorkflowAction, workflowBusy, workflowRequirements } from '../shared/workflow';
import { getProject, saveProject } from './store';
import { launchTask, TaskError, type TaskSpec } from './tasks';
import { configured } from './gemini';
import { generationConfigured } from './veo';
import { TimingConfirmationRequired } from './compose';
import { keyframeStorageStatus } from './keyframe-storage';
import { imageGenerationStatus } from './image-generation';

const runners = new Set<string>();
const save = (id: string, change: (p: Project) => Project) => saveProject(change(getProject(id)!));

export function setWorkflowMode(id: string, mode: WorkflowMode) {
  const p = getProject(id)!;
  if (mode === 'manual' && workflowBusy(p)) return saveProject({ ...p, workflowMode: mode, workflow: { ...p.workflow!, status: 'pausing', message: '正在接管：当前任务完成后停止后续步骤。' } });
  if (mode === 'automatic' && workflowBusy(p)) return p;
  return saveProject({ ...p, workflowMode: mode });
}

export function startWorkflow(id: string, maxNewClips: number, target: WorkflowTarget = 'keyframes') {
  const p = getProject(id)!;
  if (runners.has(id) || workflowBusy(p) || p.job?.status === 'running') throw new TaskError(409, '当前任务正在处理，请等待完成。');
  const continuing = p.workflow && p.workflow.status !== 'completed';
  const missing = workflowRequirements(p, target);
  const next = nextWorkflowAction(p, target);
  if (!configured() && (next.kind === 'analysis' || next.kind === 'rewrite' && p.promptFlow !== 'direct-analysis')) missing.push('连接 Gemini 分析服务');
  if (!imageGenerationStatus().configured && (next.kind === 'keyframe' || next.kind === 'rewrite' && p.promptFlow !== 'direct-analysis')) missing.push('连接图片生成服务');
  if (target === 'video' && !generationConfigured() && next.kind !== 'compose' && next.kind !== 'completed') missing.push('连接 Veo');
  if (target === 'video' && p.promptFlow !== 'direct-analysis' && !keyframeStorageStatus().configured && next.kind !== 'compose' && next.kind !== 'completed') missing.push('连接 Supabase 私有图片存储');
  const now = new Date().toISOString();
  const saved = saveProject({ ...p, workflowMode: 'automatic', workflow: {
    id: continuing ? p.workflow!.id : randomUUID(), target, status: missing.length ? 'needs-input' : 'running',
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
        save(id, current => ({ ...current, workflow: { ...current.workflow!, status: 'completed', stage: 'completed', message: current.workflow?.target === 'video' ? '视频制作完成，可以预览和下载。' : '逐镜头复刻关键帧已生成，请检查图片与描述；当前流程在此完成。', finishedAt: new Date().toISOString() } }));
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
          unitId: unit.id, prompt: editableUnitPrompt(p, unit), mode: p.promptFlow === 'direct-analysis' ? 't2v' : 'i2v', images: [],
          keyframeShotId: p.promptFlow === 'direct-analysis' ? undefined : unit.sourceShotIds[0], ...settings,
        } };
      } else task = action.kind === 'compose' ? { kind: 'compose' } : action.kind === 'keyframe' ? action : { kind: action.kind };
      const stage = action.kind === 'compose' ? 'composition' : action.kind;
      save(id, current => ({ ...current, workflow: { ...current.workflow!, stage, unitId: action.kind === 'generation' ? action.unitId : undefined, message: action.kind === 'generation' ? `正在制作 ${action.unitId}` : action.kind === 'analysis' ? '正在理解参考视频' : action.kind === 'keyframe' ? '正在补全复刻关键帧' : action.kind === 'rewrite' ? current.promptFlow === 'direct-analysis' ? '正在整理原片分析为可编辑 Prompt' : '正在逐镜头改写并生成关键帧' : '正在完成最终视频' } }));
      await launchTask(id, task);
      p = getProject(id)!;
      if (action.kind === 'rewrite' && p.promptFlow !== 'direct-analysis' && p.rewrite?.shots.some(shot => shot.keyframe?.status === 'failed')) throw new TaskError(409, '分镜描述已保存，关键帧生成失败。请检查模型连接或在镜头卡中重试后继续。');
      if (p.workflow?.status !== 'running') break;
    }
    save(id, p => ({ ...p, workflow: { ...p.workflow!, status: 'paused', message: '已停止自动推进，当前结果可在手动工作台查看和编辑。' } }));
  } catch (error) {
    save(id, p => ({ ...p, workflow: { ...p.workflow!, status: p.workflow?.status === 'pausing' ? 'paused' : error instanceof TimingConfirmationRequired || error instanceof TaskError && error.status < 500 ? 'needs-input' : 'failed',
      stage: error instanceof TimingConfirmationRequired ? 'composition' : p.workflow!.stage,
      message: error instanceof Error ? error.message : '制作暂停，请检查当前阶段后继续。' } }));
  }
}
