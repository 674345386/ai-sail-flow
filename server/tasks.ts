import { randomUUID } from 'node:crypto';
import type { GeneratedVideo, Job, Project, Rewrite } from '../shared/domain';
import { validateMarket } from '../shared/domain';
import { buildVeoUnitPrompt } from '../shared/export';
import { buildVeoPlan } from '../shared/veo-plan';
import { finalVideo, productionSources } from '../shared/workflow';
import { analyze, rewrite, configured } from './gemini';
import { VEO_MODELS, VEO_DURATION, generateVideo, resumeVideo, generationConfigured, saveGeneratedVideo, requestBody, type GenerationInput } from './veo';
import { composeVideo, composeUnitVideo, composeNativeVideo, TimingConfirmationRequired } from './compose';
import { getProject, saveProject } from './store';
import { shotReconstructionPrompt } from '../shared/shot-evidence';

export class TaskError extends Error { constructor(public status: number, message: string) { super(message); } }
export type TaskSpec = { kind: 'analysis' } | { kind: 'rewrite' } | { kind: 'generation'; input: GenerationInput } |
  { kind: 'recover'; videoId: string } | { kind: 'compose'; voice?: string; videoId?: string; timingApproval?: string };
const activeProjects = new Set<string>();
let occupied = 0;
const queue: (() => void)[] = [];
async function acquire() { if (occupied < 2) { occupied++; return; } await new Promise<void>(resolve => queue.push(resolve)); }
function release() { const next = queue.shift(); if (next) next(); else occupied--; }

function update(id: string, change: (project: Project) => Project) { return saveProject(change(getProject(id)!)); }
function sources(project: Project) { const videos = productionSources(project); if (!videos.length || videos.some(video => !video)) throw new TaskError(409, '请先完成当前模式的全部视频片段。'); return videos as GeneratedVideo[]; }

function directAnalysisStoryboard(project: Project): Rewrite {
  const analysis = project.analysis!;
  return {
    angle: '直接沿用 Gemini 对参考视频的分析，不进行市场或创意改写。',
    audienceInsight: '',
    hookVariants: [{ label: '原片开头', text: analysis.shots[0]?.narration || analysis.shots[0]?.visual || '沿用原片开场' }],
    localizationNotes: [],
    productionNotes: ['分镜内容直接来自 Gemini 原片分析；生成前可在 Veo Prompt 中编辑。', '保留原片时间线、语言、画面动作、运镜、口播、屏幕文字和声音描述。'],
    globalPrompt: `Recreate the analyzed reference video faithfully. Preserve its original style, shot order, pacing, camera work, actions, language, narration, on-screen text, and sound. Apply only the user's explicitly allowed changes. Source summary: ${analysis.summary}`,
    negativePrompt: '',
    shots: analysis.shots.map(shot => ({ ...shot, generationPrompt: shotReconstructionPrompt(shot) })),
  };
}

async function saveSource(id: string, videoId: string, local: Awaited<ReturnType<typeof saveGeneratedVideo>>, progress: (n: number, message: string) => void) {
  let project = update(id, p => ({ ...p, generatedVideos: p.generatedVideos.map(video => video.id === videoId ? { ...video, status: 'completed', finishedAt: new Date().toISOString(), stale: false, ...local } : video) }));
  if (project.productionMode !== 'tts-subtitles') return;
  const source = project.generatedVideos.find(video => video.id === videoId)!;
  const rendered = await composeUnitVideo(project, source, project.ttsVoice || '', progress);
  project = update(id, p => ({ ...p, composedVideos: [...(p.composedVideos || []), rendered] }));
  if (productionSources(project).every(video => video?.filename) && !finalVideo(project)) {
    const final = await composeVideo(project, sources(project), project.ttsVoice || '', progress);
    update(id, p => ({ ...p, composedVideos: [...(p.composedVideos || []), final] }));
  }
}

// Manual controls and the automatic runner both use this executor. Every launch
// persists its input before provider submission, and its result before returning.
export function launchTask(id: string, spec: TaskSpec): Promise<void> {
  const p = getProject(id);
  if (!p) throw new TaskError(404, '找不到这个项目。');
  if (activeProjects.has(id) || p.job?.status === 'running') throw new TaskError(409, '当前任务正在处理，请等待完成。');
  const marketError = validateMarket(p.market); if (marketError) throw new TaskError(400, marketError);
  if ((spec.kind === 'analysis' || spec.kind === 'rewrite' && (p.promptFlow || 'localized') === 'localized') && !configured()) throw new TaskError(503, '请先连接 Gemini。');
  if (spec.kind === 'analysis' && !p.assets.some(asset => asset.kind === 'video')) throw new TaskError(400, '请先上传参考视频。');
  if (spec.kind === 'rewrite' && (!p.analysis || (p.promptFlow !== 'direct-analysis' && (!p.product.name.trim() || !p.product.facts.trim())))) throw new TaskError(400, '请先完成视频拆解，并填写产品名称与已确认卖点。');
  if (['generation', 'recover'].includes(spec.kind) && !generationConfigured()) throw new TaskError(503, '请先连接 Veo 3.1。');
  if (['generation', 'compose'].includes(spec.kind) && (!p.rewrite || p.rewriteStale)) throw new TaskError(409, '请先生成与当前资料一致的分镜。');
  let video: GeneratedVideo | undefined;
  const now = new Date().toISOString();
  if (spec.kind === 'generation') {
    const unit = buildVeoPlan(p.rewrite!.shots).find(unit => unit.id === spec.input.unitId);
    if (!unit) throw new TaskError(404, '找不到该视频生产单元。');
    video = { id: randomUUID(), provider: 'veo-3.1', model: VEO_MODELS[spec.input.mode], mode: spec.input.mode,
      productionMode: p.productionMode || 'veo-native', imageUrls: spec.input.mode === 't2v' ? [] : spec.input.images,
      resolution: spec.input.resolution, shotId: unit.sourceShotIds[0] || unit.id, unitId: unit.id, sourceShotIds: unit.sourceShotIds,
      targetStart: unit.start, targetEnd: unit.end, targetDuration: unit.targetDuration, status: 'running', prompt: spec.input.prompt,
      defaultPrompt: buildVeoUnitPrompt(p, unit), providerRequest: requestBody(spec.input, spec.input.prompt),
      duration: VEO_DURATION, aspectRatio: spec.input.aspectRatio, startedAt: now };
  } else if (spec.kind === 'recover' || (spec.kind === 'compose' && spec.videoId)) {
    video = p.generatedVideos.find(video => video.id === spec.videoId);
    if (!video || video.stale) throw new TaskError(409, '找不到当前方案的可用源片。');
    if (spec.kind === 'recover' && (!video.requestId || video.status !== 'failed')) throw new TaskError(409, '没有可恢复的上游视频任务。');
    if (spec.kind === 'compose' && (p.productionMode !== 'tts-subtitles' || video.productionMode !== 'tts-subtitles' || video.status !== 'completed' || !video.filename)) throw new TaskError(409, '没有可本地配音的已完成画面源片。');
  } else if (spec.kind === 'compose') sources(p);
  const job: Job = { id: randomUUID(), kind: spec.kind === 'recover' ? 'generation' : spec.kind === 'compose' ? 'composition' : spec.kind,
    status: 'running', progress: 2, message: '正在准备任务…', startedAt: now, videoId: video?.id, unitId: video?.unitId };
  const saved = saveProject({ ...p, job, generatedVideos: spec.kind === 'generation' ? [...p.generatedVideos, video!] : spec.kind === 'recover' ? p.generatedVideos.map(item => item.id === video!.id ? { ...item, status: 'running', error: undefined } : item) : p.generatedVideos });
  activeProjects.add(id);
  const progress = (n: number, message: string) => update(id, current => ({ ...current, job: { ...current.job!, progress: n, message } }));
  return (async () => {
    await acquire();
    let message = '制作完成';
    try {
      if (spec.kind === 'analysis' || spec.kind === 'rewrite') {
        const snapshot = (request: NonNullable<Project['analysisRequest']>) => update(id, current => ({ ...current, [spec.kind === 'analysis' ? 'analysisRequest' : 'rewriteRequest']: request }));
        const direct = spec.kind === 'rewrite' && saved.promptFlow === 'direct-analysis';
        const result = spec.kind === 'analysis' ? await analyze(saved, progress, snapshot) : direct
          ? { result: directAnalysisStoryboard(saved), usage: { input: 0, output: 0 } }
          : await rewrite(saved, progress, snapshot);
        update(id, current => ({ ...current, isDemo: false, ttsTimingNotice: undefined,
          ...(spec.kind === 'analysis' ? { analysis: result.result as Project['analysis'], analysisMeta: 'meta' in result ? result.meta : null, rewriteStale: !!current.rewrite } : { rewrite: result.result as Project['rewrite'], rewriteStale: false }),
          generatedVideos: current.generatedVideos.map(video => ({ ...video, stale: true })), composedVideos: current.composedVideos?.map(video => ({ ...video, stale: true })),
          usage: { input: current.usage.input + result.usage.input, output: current.usage.output + result.usage.output } }));
        message = spec.kind === 'analysis' ? '参考视频拆解完成' : direct ? '原片分析已整理为可编辑 Veo Prompt' : '本地化分镜完成';
      } else if (spec.kind === 'generation' || spec.kind === 'recover') {
        if (spec.kind === 'generation') update(id, current => ({ ...current, workflow: current.workflow && ['running', 'pausing'].includes(current.workflow.status) ? { ...current.workflow, newClipCount: current.workflow.newClipCount + 1 } : current.workflow }));
        const remote = spec.kind === 'recover' ? await resumeVideo(video!.requestId!, progress) : await generateVideo(spec.input, spec.input.prompt, progress, requestId => {
          update(id, current => ({ ...current, generatedVideos: current.generatedVideos.map(item => item.id === video!.id ? { ...item, requestId } : item) }));
        });
        const local = await saveGeneratedVideo(remote.url, video!.id, progress);
        await saveSource(id, video!.id, local, progress);
        message = saved.productionMode === 'tts-subtitles' ? '画面、配音与字幕已完成' : 'Veo 视频片段已保存到本机';
      } else {
        let current = getProject(id)!;
        if (!spec.videoId && current.productionMode === 'tts-subtitles') {
          for (const source of sources(current)) {
            const requestedVoice = spec.voice ?? current.ttsVoice;
            if (current.composedVideos?.some(rendered => !rendered.stale && rendered.renderTrace?.timingVersion === 'continuous-v1' && rendered.unitId === source.unitId && rendered.sourceVideoIds[0] === source.id && (!requestedVoice || rendered.voice === requestedVoice))) continue;
            const unit = await composeUnitVideo(current, source, spec.voice ?? current.ttsVoice ?? '', progress);
            current = update(id, project => ({ ...project, composedVideos: [...(project.composedVideos || []), unit] }));
          }
        }
        const rendered = spec.videoId ? await composeUnitVideo(current, video!, spec.voice ?? current.ttsVoice ?? '', progress) :
          current.productionMode === 'tts-subtitles' ? await composeVideo(current, sources(current), spec.voice ?? current.ttsVoice ?? '', progress, spec.timingApproval) : await composeNativeVideo(current, sources(current), progress);
        update(id, p => ({ ...p, composedVideos: [...(p.composedVideos || []), rendered] }));
        message = spec.videoId ? '本地配音与字幕片段已完成' : '最终视频已完成';
      }
      update(id, current => {
        const completed: Job = { ...current.job!, status: 'completed', progress: 100, message, finishedAt: new Date().toISOString() };
        const finished = !!finalVideo(current);
        return { ...current, job: completed, ttsTimingNotice: finished ? undefined : current.ttsTimingNotice,
          workflow: finished && spec.kind === 'compose' && !spec.videoId && current.workflowMode === 'automatic' && current.workflow && !['running', 'pausing'].includes(current.workflow.status) ?
            { ...current.workflow, status: 'completed', stage: 'completed', message: '视频制作完成，可以预览和下载。', finishedAt: completed.finishedAt } : current.workflow,
          jobHistory: [...(current.jobHistory || []), completed].slice(-200) };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '任务未完成，请重试。';
      update(id, current => {
        const failed: Job = { ...current.job!, kind: error instanceof TimingConfirmationRequired ? 'composition' : current.job!.kind,
          status: error instanceof TimingConfirmationRequired ? 'needs-input' : 'failed', message, finishedAt: new Date().toISOString() };
        return { ...current, job: failed, ttsTimingNotice: error instanceof TimingConfirmationRequired ? error.notice : current.ttsTimingNotice,
          jobHistory: [...(current.jobHistory || []), failed].slice(-200),
          generatedVideos: current.generatedVideos.map(item => item.id === video?.id && item.status !== 'completed' ? { ...item, status: 'failed', error: message, finishedAt: failed.finishedAt } : item) };
      });
      throw error;
    } finally { activeProjects.delete(id); release(); }
  })();
}
