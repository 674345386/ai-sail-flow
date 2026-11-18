import path from 'node:path';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import type { GeneratedVideo, Job, Project } from '../shared/domain';
import { MINIMAX_MODELS, MINIMAX_RATIOS, MINIMAX_RESOLUTIONS, minimaxVideoInput, minimaxVideoNeedsReconciliation, type MinimaxAssetInput, type MinimaxVideoInput, type MinimaxGenerationDetails } from '../shared/minimax-video';
import { MinimaxError, MinimaxTaskError, MinimaxH3Client, minimaxStatus, type MinimaxTask } from './minimax-h3';
import { getProject, listProjects, saveProject } from './store';
import { accountWorkspacesEnabled, withWorkspaceAccount, workspaceAccounts, workspaceUploadPath } from './workspace-storage';
import { inspectMedia } from './media';
import { workflowBusy } from '../shared/workflow';

type ImageReference = { id: string; filename?: string; mime?: string; name?: string };
type WorkflowUnit = Pick<GeneratedVideo, 'shotId' | 'productionMode' | 'sourceShotIds' | 'targetStart' | 'targetEnd' |
  'defaultPrompt' | 'keyframeShotId' | 'keyframeFilename' | 'keyframeBasis' | 'keyframeUrl'> & { unitId: string };
const active = new Map<string, Promise<void>>();
let onVideoStatusChange: ((projectId: string) => void) | undefined;
function notifyStatusChange(projectId: string) {
  queueMicrotask(() => {
    try { onVideoStatusChange?.(projectId); }
    catch { /* Media state is already saved; a later Agent read restores its graph. */ }
  });
}
export function minimaxTaskDetails(task: MinimaxTask): MinimaxGenerationDetails {
  const elapsed = Date.parse(task.completed_at || '') - Date.parse(task.created_at || '');
  const duration = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
  return { recordedAt: new Date().toISOString(), createdAt: task.created_at, completedAt: task.completed_at,
    outputCount: task.parameters?.output_count ?? task.results?.requested ?? (task.outputs?.length || undefined),
    generateAudio: task.parameters?.generate_audio, muteReferenceVideo: task.parameters?.mute_reference_video, optimizePrompt: task.optimize_prompt,
    modelRunMs: duration(task.model_run_ms), totalTimeMs: duration(task.total_time_ms) ?? duration(elapsed) };
}

/** Read-only provider query for older records; never submits, recovers or downloads. */
export async function getMinimaxVideoDetails(project: Project, videoId: string): Promise<GeneratedVideo> {
  const video = (getProject(project.id) || project).generatedVideos.find(video => video.id === videoId);
  if (!video) throw new MinimaxError(404, '找不到这份视频产物。');
  if (video.provider !== 'minimax-h3' || !video.requestId || !video.minimax || video.minimax.details?.completedAt || video.status === 'running') return video;
  const task = await new MinimaxH3Client().query(video.requestId);
  const latest = getProject(project.id)?.generatedVideos.find(item => item.id === videoId) || video;
  const updated = updateVideo(project.id, videoId, { minimax: { ...latest.minimax!, upstreamStatus: task.status, details: minimaxTaskDetails(task), credits: task.credits || latest.minimax?.credits } });
  return updated.generatedVideos.find(item => item.id === videoId)!;
}
export function minimaxVideoStatus() {
  return { ...minimaxStatus(), tool: 'generate_minimax_video', models: MINIMAX_MODELS, supportedAspectRatios: MINIMAX_RATIOS, supportedResolutions: MINIMAX_RESOLUTIONS, defaultDuration: 6, defaultResolution: '768p', maxReferenceImages: 9 };
}
function available(project: Project, recoveringVideoId?: string, workflowUnitId?: string) {
  if (project.archivedAt) throw new MinimaxError(409, '请先恢复已归档创意。');
  if (!minimaxStatus().configured) throw new MinimaxError(503, '请配置服务端 SOP_MINIMAX_API_KEY。');
  const workflow = project.workflow;
  const ownsUnit = project.workflowMode === 'automatic' && workflow?.status === 'running' && workflow.target === 'video' && workflow.stage === 'generation' && workflow.unitId === workflowUnitId;
  if (active.has(project.id) || project.job?.status === 'running' && (!recoveringVideoId || project.job.videoId !== recoveringVideoId) || (workflowUnitId ? !ownsUnit : workflowBusy(project))) throw new MinimaxError(409, '当前任务正在处理，请等待完成。');
}
function updateVideo(projectId: string, videoId: string, patch: Partial<GeneratedVideo>, jobPatch?: Partial<Job>, countWorkflowClip = false) {
  const current = getProject(projectId);
  if (!current) throw new MinimaxError(404, '找不到这个创意。');
  const job = current.job?.videoId === videoId && jobPatch ? { ...current.job, ...jobPatch } : current.job;
  const workflow = countWorkflowClip && current.workflow ? { ...current.workflow, newClipCount: current.workflow.newClipCount + 1 } : current.workflow;
  const updated = saveProject({ ...current, generatedVideos: current.generatedVideos.map(video => video.id === videoId ? { ...video, ...patch } : video), job, workflow,
    ...(job && job !== current.job && job.status !== 'running' ? { jobHistory: [...(current.jobHistory || []), job].slice(-200) } : {}) });
  if (patch.status) notifyStatusChange(projectId);
  return updated;
}
function run(projectId: string, video: GeneratedVideo, references: { filename: string; mime: string; role: MinimaxAssetInput['role'] }[] = [], input?: MinimaxVideoInput, countWorkflowClip = false) {
  const completion = Promise.resolve().then(async () => {
    const progress = (value: number, message: string, task?: MinimaxTask) => {
      if (task) video = { ...video, minimax: { ...video.minimax!, upstreamStatus: task.status, details: minimaxTaskDetails(task), credits: task.credits || video.minimax?.credits } };
      updateVideo(projectId, video.id, task ? { minimax: video.minimax } : {}, { progress: value, message });
    };
    let upstreamSucceeded = false;
    try {
      const client = new MinimaxH3Client();
      let request = video.minimax!.request;
      if (!video.requestId && !request) {
        const inputs: MinimaxAssetInput[] = [];
        for (const reference of references) {
          progress(10, '正在上传 MiniMax 参考素材…');
          const asset_id = await client.uploadReference(reference.filename, reference.mime, await fs.promises.readFile(workspaceUploadPath(reference.filename)));
          inputs.push({ asset_id, role: reference.role });
        }
        request = { model: input!.model, prompt: input!.prompt, inputs, parameters: {
          duration: input!.duration, resolution: input!.resolution, aspect_ratio: input!.aspectRatio!, generate_audio: input!.generateAudio,
        }, optimize_prompt: input!.optimizePrompt };
        // Persist before the billable POST. Recovery replays this exact body/key if the response is lost.
        video = { ...video, minimax: { ...video.minimax!, request } };
        updateVideo(projectId, video.id, { minimax: video.minimax }, undefined, countWorkflowClip);
      }
      let requestId = video.requestId;
      if (!requestId) {
        progress(20, '正在提交 MiniMax H3 视频任务…');
        const submitted = await client.submit(request!, video.minimax!.idempotencyKey);
        requestId = submitted.id;
        video = { ...video, requestId, minimax: { ...video.minimax!, upstreamStatus: submitted.status, details: minimaxTaskDetails(submitted), credits: submitted.credits } };
        updateVideo(projectId, video.id, { requestId, minimax: video.minimax });
      }
      const task = await client.wait(requestId, progress);
      upstreamSucceeded = true;
      video = { ...video, minimax: { ...video.minimax!, upstreamStatus: 'succeeded', recoveryPending: false, nextRecoveryAt: undefined, details: minimaxTaskDetails(task), optimizedPrompt: task.optimized_prompt || undefined, credits: task.credits } };
      updateVideo(projectId, video.id, { minimax: video.minimax });
      const output = task.outputs?.find(item => item.media_type === 'video' && item.download_url);
      if (!output) throw new MinimaxError(502, 'MiniMax 已完成但尚无视频下载地址；请恢复查询。');
      progress(80, '正在保存 MiniMax H3 视频…');
      const filename = `minimax-${video.id}.mp4`;
      const size = await client.download(output, workspaceUploadPath(filename));
      const metadata = await inspectMedia(filename, 'video');
      updateVideo(projectId, video.id, { ...metadata, filename, url: `/media/${filename}`, size, requestId, status: 'completed', stale: false, error: undefined, finishedAt: new Date().toISOString(),
        minimax: { ...video.minimax!, outputAssetId: output.asset_id },
      }, { status: 'completed', progress: 100, message: 'MiniMax H3 视频已保存，可以预览和下载。', finishedAt: new Date().toISOString() });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'MiniMax 视频任务失败。';
      const terminal = error instanceof MinimaxTaskError;
      const retryQuery = !terminal && !!video.requestId && (upstreamSucceeded || !(error instanceof MinimaxError) || error.status === 429 || error.status >= 500);
      const uncertain = !terminal && !!(video.requestId || video.minimax?.request);
      const message = upstreamSucceeded ? `MiniMax 远端生成已成功，本地保存暂未完成：${detail} 将继续查询原任务并保存结果。`
        : retryQuery ? `本地查询暂时中断，上游任务状态待核对，将继续查询原任务：${detail}` : detail;
      const finishedAt = uncertain ? undefined : new Date().toISOString();
      updateVideo(projectId, video.id, { status: 'failed', error: message, finishedAt,
        minimax: { ...video.minimax!, ...(terminal ? { upstreamStatus: error.taskStatus } : {}), recoveryPending: retryQuery, nextRecoveryAt: retryQuery ? new Date(Date.now() + 60_000).toISOString() : undefined },
      }, { status: 'failed', message, finishedAt });
    }
  }).finally(() => active.delete(projectId));
  active.set(projectId, completion);
  void completion.catch(() => console.warn('MiniMax video task could not save its state.'));
}
export async function waitForMinimaxVideo(projectId: string, videoId: string) {
  await active.get(projectId);
  const video = getProject(projectId)?.generatedVideos.find(item => item.id === videoId);
  if (video?.status !== 'completed' || !video.filename) throw new MinimaxError(502, video?.error || 'MiniMax 视频未保存完成。');
}

export function startMinimaxVideo(project: Project, body: unknown, extraImages: ImageReference[] = [], requestScope = project.id,
  clip?: { targetDuration: number; gridId?: string; workflowUnit?: WorkflowUnit }) {
  // A caller may hold a snapshot from before another request was accepted.
  project = getProject(project.id) || project;
  if (project.archivedAt) throw new MinimaxError(409, '请先恢复已归档创意。');
  const supplied = minimaxVideoInput.parse(body);
  const input = minimaxVideoInput.parse({ ...supplied, aspectRatio: supplied.aspectRatio || (MINIMAX_RATIOS.includes(project.market.aspectRatio as typeof MINIMAX_RATIOS[number]) ? project.market.aspectRatio : '9:16') });
  const { requestKey: suppliedKey, ...parameters } = input;
  const requestFingerprint = createHash('sha256').update(JSON.stringify(clip ? [parameters, clip] : parameters)).digest('hex');
  const requestKey = suppliedKey ? `explicit:${suppliedKey}` : `auto:${createHash('sha256').update(JSON.stringify([requestScope, requestFingerprint])).digest('hex')}`;
  const existing = project.generatedVideos.find(video => video.provider === 'minimax-h3' && video.minimax?.requestKey === requestKey);
  if (existing) {
    if (existing.minimax?.requestFingerprint !== requestFingerprint) throw new MinimaxError(409, '同一生成请求键不能使用不同参数；如需新版本，请使用新的 requestKey。');
    const job = project.job?.videoId === existing.id ? project.job : project.jobHistory?.find(item => item.videoId === existing.id);
    return { videoId: existing.id, jobId: job?.id, status: existing.status, reused: true };
  }
  const unit = clip?.workflowUnit;
  available(project, undefined, unit?.unitId);
  if (!unit && project.generatedVideos.filter(video => video.unitId?.startsWith('agent-video-')).length >= 50) throw new MinimaxError(409, '当前创意已达到 50 个独立视频上限。');
  const ids: { id: string; role: MinimaxAssetInput['role'] }[] = input.model === 'h3-video-frames'
    ? [...(input.firstFrameId ? [{ id: input.firstFrameId, role: 'first_frame' as const }] : []), ...(input.lastFrameId ? [{ id: input.lastFrameId, role: 'last_frame' as const }] : [])]
    : input.referenceIds.map(id => ({ id, role: 'reference_image' as const }));
  const sources: ImageReference[] = [...project.assets.filter(asset => asset.kind === 'product'), ...extraImages,
    ...(project.agentImages || []).filter(image => image.status === 'completed' && image.filename).map(image => ({ id: image.id, filename: image.filename! })), ...(project.storyboardGrids || [])];
  const references: (NonNullable<GeneratedVideo['referenceMedia']>[number] & { mime: string; role: MinimaxAssetInput['role'] })[] = ids.map(({ id, role }) => {
    const source = sources.find(item => item.id === id);
    const filename = source?.filename;
    const mime = source?.mime || (/\.jpe?g$/i.test(filename || '') ? 'image/jpeg' : /\.webp$/i.test(filename || '') ? 'image/webp' : 'image/png');
    if (!filename || path.basename(filename) !== filename || !['image/png', 'image/jpeg', 'image/webp'].includes(mime) || !fs.existsSync(workspaceUploadPath(filename))) throw new MinimaxError(400, `参考图 ${id} 不在当前创意中或无法读取。`);
    if (fs.statSync(workspaceUploadPath(filename)).size > 24 * 1024 * 1024) throw new MinimaxError(400, `参考图 ${id} 超过 24 MiB。`);
    return { id, name: source?.name || filename, filename, url: `/media/${filename}`, mime, role };
  });
  for (const id of input.referenceVideoIds || []) {
    const source = project.assets.find(asset => asset.id === id && asset.kind === 'video');
    if (!source || !['video/mp4', 'video/quicktime', 'video/webm'].includes(source.mime) || !fs.existsSync(workspaceUploadPath(source.filename))) throw new MinimaxError(400, `参考视频 ${id} 不在当前创意中或无法读取。`);
    if (source.size > 64 * 1024 * 1024) throw new MinimaxError(400, `参考视频 ${id} 超过 H3 的 64 MiB 上限。`);
    references.push({ id, name: source.name, filename: source.filename, url: source.url, mime: source.mime, role: 'reference_video' });
  }
  const now = new Date().toISOString(), id = randomUUID();
  const video: GeneratedVideo = { id, provider: 'minimax-h3', model: input.model, shotId: id, unitId: `agent-video-${id}`, productionMode: 'veo-native', ...unit,
    prompt: input.prompt, mode: unit && input.firstFrameId ? 'i2v' : references.length ? 'r2v' : 't2v', resolution: input.resolution, aspectRatio: input.aspectRatio!, duration: input.duration,
    referenceIds: references.map(item => item.id), referenceMedia: references, targetDuration: clip?.targetDuration, storyboardGridId: clip?.gridId, gridId: clip?.gridId,
    status: 'running', startedAt: now, minimax: { idempotencyKey: id, requestKey, requestFingerprint, generateAudio: input.generateAudio, optimizePrompt: input.optimizePrompt } };
  const job: Job = { id: randomUUID(), kind: 'generation', videoId: id, unitId: unit?.unitId, status: 'running', progress: 0, message: '正在准备 MiniMax H3 视频…', startedAt: now };
  saveProject({ ...project, generatedVideos: [...project.generatedVideos, video], job });
  run(project.id, video, references, input, !!unit);
  return { videoId: id, jobId: job.id, status: 'running' };
}
export function recoverMinimaxVideo(project: Project, videoId: string, workflowUnitId?: string) {
  project = getProject(project.id) || project;
  const video = project.generatedVideos.find(video => video.id === videoId && video.provider === 'minimax-h3');
  if (!video) throw new MinimaxError(404, '找不到这个 MiniMax 视频。');
  if (video.status === 'completed' || active.has(project.id) && project.job?.videoId === videoId) return { videoId, jobId: project.job?.videoId === videoId ? project.job.id : undefined, status: video.status, reused: true };
  if (['failed', 'cancelled'].includes(video.minimax?.upstreamStatus || '')) throw new MinimaxError(409, '上游已明确失败或取消，不能将它恢复为进行中。');
  if (workflowUnitId && video.unitId !== workflowUnitId) throw new MinimaxError(409, '视频不属于当前制作镜头。');
  available(project, videoId, workflowUnitId);
  if (!video.minimax || !video.requestId && !video.minimax.request) throw new MinimaxError(409, '尚未保存上游请求，无法恢复；请核对任务后再决定是否生成。');
  const job: Job = { id: randomUUID(), kind: 'generation', videoId, unitId: workflowUnitId, status: 'running', progress: 25, message: '正在恢复已有 MiniMax 任务…', startedAt: new Date().toISOString() };
  const resumed: GeneratedVideo = { ...video, status: 'running', error: undefined, finishedAt: undefined, minimax: { ...video.minimax, recoveryPending: false, nextRecoveryAt: undefined } };
  saveProject({ ...project, generatedVideos: project.generatedVideos.map(item => item.id === videoId ? resumed : item), job });
  notifyStatusChange(project.id);
  run(project.id, resumed);
  return { videoId, jobId: job.id, status: 'running' };
}

/** Resume known upstream IDs after a restart or temporary polling/download failure. */
export function resumePendingMinimaxVideos() {
  if (!minimaxStatus().configured) return;
  for (const entry of listProjects()) {
    if (active.size >= 3) break;
    const project = getProject(entry.id);
    if (!project || project.archivedAt || active.has(project.id) || workflowBusy(project)) continue;
    const video = project.generatedVideos.find(item => minimaxVideoNeedsReconciliation(item));
    if (!video || project.job?.status === 'running' && project.job.videoId !== video.id) continue;
    try { recoverMinimaxVideo(project, video.id); }
    catch (error) { if (!(error instanceof MinimaxError && error.status === 409)) console.warn(`MiniMax recovery: ${error instanceof Error ? error.message : 'query unavailable'}`); }
  }
}

export function startMinimaxReconciler(onStatusChange?: (projectId: string) => void) {
  onVideoStatusChange = onStatusChange;
  const reconcile = () => {
    if (!accountWorkspacesEnabled) return resumePendingMinimaxVideos();
    for (const id of workspaceAccounts()) {
      if (active.size >= 3) break;
      withWorkspaceAccount(id, resumePendingMinimaxVideos);
    }
  };
  reconcile();
  const timer = setInterval(reconcile, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
