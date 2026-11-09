import path from 'node:path';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import type { GeneratedVideo, Job, Project } from '../shared/domain';
import { MINIMAX_MODELS, MINIMAX_RATIOS, MINIMAX_RESOLUTIONS, minimaxVideoInput, type MinimaxAssetInput, type MinimaxVideoInput, type MinimaxGenerationDetails } from '../shared/minimax-video';
import { MinimaxError, MinimaxH3Client, minimaxStatus, type MinimaxTask } from './minimax-h3';
import { getProject, saveProject, uploadDir } from './store';
import { inspectMedia } from './media';
import { workflowBusy } from '../shared/workflow';

type ImageReference = { id: string; filename?: string; mime?: string; name?: string };
const active = new Set<string>();
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
  if (video.provider !== 'minimax-h3' || !video.requestId || !video.minimax || video.minimax.details || video.status === 'running') return video;
  const task = await new MinimaxH3Client().query(video.requestId);
  const latest = getProject(project.id)?.generatedVideos.find(item => item.id === videoId) || video;
  const updated = updateVideo(project.id, videoId, { minimax: { ...latest.minimax!, details: minimaxTaskDetails(task), credits: task.credits || latest.minimax?.credits } });
  return updated.generatedVideos.find(item => item.id === videoId)!;
}
export function minimaxVideoStatus() {
  return { ...minimaxStatus(), tool: 'generate_minimax_video', models: MINIMAX_MODELS, supportedAspectRatios: MINIMAX_RATIOS, supportedResolutions: MINIMAX_RESOLUTIONS, defaultDuration: 6, defaultResolution: '768p', maxReferenceImages: 9 };
}
function available(project: Project) {
  if (project.archivedAt) throw new MinimaxError(409, '请先恢复已归档创意。');
  if (!minimaxStatus().configured) throw new MinimaxError(503, '请配置服务端 SOP_MINIMAX_API_KEY。');
  if (active.has(project.id) || project.job?.status === 'running' || workflowBusy(project)) throw new MinimaxError(409, '当前任务正在处理，请等待完成。');
}
function updateVideo(projectId: string, videoId: string, patch: Partial<GeneratedVideo>, jobPatch?: Partial<Job>) {
  const current = getProject(projectId);
  if (!current) throw new MinimaxError(404, '找不到这个创意。');
  const job = current.job?.videoId === videoId && jobPatch ? { ...current.job, ...jobPatch } : current.job;
  return saveProject({ ...current, generatedVideos: current.generatedVideos.map(video => video.id === videoId ? { ...video, ...patch } : video), job,
    ...(job && job !== current.job && job.status !== 'running' ? { jobHistory: [...(current.jobHistory || []), job].slice(-200) } : {}) });
}
function run(projectId: string, video: GeneratedVideo, references: { filename: string; mime: string; role: MinimaxAssetInput['role'] }[] = [], input?: MinimaxVideoInput) {
  active.add(projectId);
  void (async () => {
    const progress = (value: number, message: string) => { updateVideo(projectId, video.id, {}, { progress: value, message }); };
    let upstreamSucceeded = false;
    try {
      const client = new MinimaxH3Client();
      let request = video.minimax!.request;
      if (!video.requestId && !request) {
        const inputs: MinimaxAssetInput[] = [];
        for (const reference of references) {
          progress(10, '正在上传 MiniMax 参考图…');
          const asset_id = await client.uploadReference(reference.filename, reference.mime, await fs.promises.readFile(path.join(uploadDir, reference.filename)));
          inputs.push({ asset_id, role: reference.role });
        }
        request = { model: input!.model, prompt: input!.prompt, inputs, parameters: {
          duration: input!.duration, resolution: input!.resolution, aspect_ratio: input!.aspectRatio!, generate_audio: input!.generateAudio,
        }, optimize_prompt: input!.optimizePrompt };
        // Persist before the billable POST. Recovery replays this exact body/key if the response is lost.
        video = { ...video, minimax: { ...video.minimax!, request } };
        updateVideo(projectId, video.id, { minimax: video.minimax });
      }
      let requestId = video.requestId;
      if (!requestId) {
        progress(20, '正在提交 MiniMax H3 视频任务…');
        const submitted = await client.submit(request!, video.minimax!.idempotencyKey);
        requestId = submitted.id;
        video = { ...video, requestId, minimax: { ...video.minimax!, details: minimaxTaskDetails(submitted), credits: submitted.credits } };
        updateVideo(projectId, video.id, { requestId, minimax: video.minimax });
      }
      const task = await client.wait(requestId, progress);
      upstreamSucceeded = true;
      video = { ...video, minimax: { ...video.minimax!, upstreamStatus: 'succeeded', details: minimaxTaskDetails(task), optimizedPrompt: task.optimized_prompt || undefined, credits: task.credits } };
      updateVideo(projectId, video.id, { minimax: video.minimax });
      const output = task.outputs?.find(item => item.media_type === 'video' && item.download_url);
      if (!output) throw new MinimaxError(502, 'MiniMax 已完成但尚无视频下载地址；请恢复查询。');
      progress(80, '正在保存 MiniMax H3 视频…');
      const filename = `minimax-${video.id}.mp4`;
      const size = await client.download(output, path.join(uploadDir, filename));
      const metadata = await inspectMedia(filename, 'video');
      updateVideo(projectId, video.id, { ...metadata, filename, url: `/media/${filename}`, size, requestId, status: 'completed', stale: false, error: undefined, finishedAt: new Date().toISOString(),
        minimax: { ...video.minimax!, outputAssetId: output.asset_id },
      }, { status: 'completed', progress: 100, message: 'MiniMax H3 视频已保存，可以预览和下载。', finishedAt: new Date().toISOString() });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'MiniMax 视频任务失败。';
      const message = upstreamSucceeded ? `MiniMax 远端生成已成功，本地保存失败：${detail} 请恢复原任务，不要重新生成。` : detail;
      updateVideo(projectId, video.id, { status: 'failed', error: message, finishedAt: new Date().toISOString() }, { status: 'failed', message, finishedAt: new Date().toISOString() });
    } finally { active.delete(projectId); }
  })();
}
export function startMinimaxVideo(project: Project, body: unknown, extraImages: ImageReference[] = [], requestScope = project.id) {
  // A caller may hold a snapshot from before another request was accepted.
  project = getProject(project.id) || project;
  if (project.archivedAt) throw new MinimaxError(409, '请先恢复已归档创意。');
  const supplied = minimaxVideoInput.parse(body);
  const input = minimaxVideoInput.parse({ ...supplied, aspectRatio: supplied.aspectRatio || (MINIMAX_RATIOS.includes(project.market.aspectRatio as typeof MINIMAX_RATIOS[number]) ? project.market.aspectRatio : '9:16') });
  const { requestKey: suppliedKey, ...parameters } = input;
  const requestFingerprint = createHash('sha256').update(JSON.stringify(parameters)).digest('hex');
  const requestKey = suppliedKey ? `explicit:${suppliedKey}` : `auto:${createHash('sha256').update(JSON.stringify([requestScope, requestFingerprint])).digest('hex')}`;
  const existing = project.generatedVideos.find(video => video.provider === 'minimax-h3' && video.minimax?.requestKey === requestKey);
  if (existing) {
    if (existing.minimax?.requestFingerprint !== requestFingerprint) throw new MinimaxError(409, '同一生成请求键不能使用不同参数；如需新版本，请使用新的 requestKey。');
    const job = project.job?.videoId === existing.id ? project.job : project.jobHistory?.find(item => item.videoId === existing.id);
    return { videoId: existing.id, jobId: job?.id, status: existing.status, reused: true };
  }
  available(project);
  if (project.generatedVideos.filter(video => video.unitId?.startsWith('agent-video-')).length >= 50) throw new MinimaxError(409, '当前创意已达到 50 个独立视频上限。');
  const ids: { id: string; role: MinimaxAssetInput['role'] }[] = input.model === 'h3-video-frames'
    ? [...(input.firstFrameId ? [{ id: input.firstFrameId, role: 'first_frame' as const }] : []), ...(input.lastFrameId ? [{ id: input.lastFrameId, role: 'last_frame' as const }] : [])]
    : input.referenceIds.map(id => ({ id, role: 'reference_image' as const }));
  const sources: ImageReference[] = [...project.assets.filter(asset => asset.kind === 'product'), ...extraImages,
    ...(project.agentImages || []).filter(image => image.status === 'completed' && image.filename).map(image => ({ id: image.id, filename: image.filename! })), ...(project.storyboardGrids || [])];
  const references = ids.map(({ id, role }) => {
    const source = sources.find(item => item.id === id);
    const filename = source?.filename;
    const mime = source?.mime || (/\.jpe?g$/i.test(filename || '') ? 'image/jpeg' : /\.webp$/i.test(filename || '') ? 'image/webp' : 'image/png');
    if (!filename || path.basename(filename) !== filename || !['image/png', 'image/jpeg', 'image/webp'].includes(mime) || !fs.existsSync(path.join(uploadDir, filename))) throw new MinimaxError(400, `参考图 ${id} 不在当前创意中或无法读取。`);
    if (fs.statSync(path.join(uploadDir, filename)).size > 24 * 1024 * 1024) throw new MinimaxError(400, `参考图 ${id} 超过 24 MiB。`);
    return { id, name: source?.name || filename, filename, url: `/media/${filename}`, mime, role };
  });
  const now = new Date().toISOString(), id = randomUUID();
  const video: GeneratedVideo = { id, provider: 'minimax-h3', model: input.model, shotId: id, unitId: `agent-video-${id}`, productionMode: 'veo-native',
    prompt: input.prompt, mode: references.length ? 'r2v' : 't2v', resolution: input.resolution, aspectRatio: input.aspectRatio!, duration: input.duration,
    referenceIds: ids.map(item => item.id), referenceMedia: references, status: 'running', startedAt: now, minimax: { idempotencyKey: id, requestKey, requestFingerprint, generateAudio: input.generateAudio, optimizePrompt: input.optimizePrompt } };
  const job: Job = { id: randomUUID(), kind: 'generation', videoId: id, status: 'running', progress: 0, message: '正在准备 MiniMax H3 视频…', startedAt: now };
  saveProject({ ...project, generatedVideos: [...project.generatedVideos, video], job });
  run(project.id, video, references, input);
  return { videoId: id, jobId: job.id, status: 'running' };
}
export function recoverMinimaxVideo(project: Project, videoId: string) {
  project = getProject(project.id) || project;
  available(project);
  const video = project.generatedVideos.find(video => video.id === videoId && video.provider === 'minimax-h3');
  if (!video) throw new MinimaxError(404, '找不到这个 MiniMax 视频。');
  if (video.status !== 'failed') throw new MinimaxError(409, '只可恢复失败或中断的 MiniMax 任务。');
  if (!video.minimax || !video.requestId && !video.minimax.request) throw new MinimaxError(409, '尚未保存上游请求，无法恢复；请核对任务后再决定是否生成。');
  const job: Job = { id: randomUUID(), kind: 'generation', videoId, status: 'running', progress: 25, message: '正在恢复已有 MiniMax 任务…', startedAt: new Date().toISOString() };
  saveProject({ ...project, generatedVideos: project.generatedVideos.map(item => item.id === videoId ? { ...item, status: 'running', error: undefined, finishedAt: undefined } : item), job });
  run(project.id, video);
  return { videoId, jobId: job.id, status: 'running' };
}
