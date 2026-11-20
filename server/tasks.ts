import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import type { Analysis, AnalysisMeta, GeneratedVideo, Job, Project } from '../shared/domain';
import type { ReferenceScene, ReferenceSceneTable } from '../shared/agent-video-analysis';
import type { VideoMasterPrompt } from '../shared/video-production';
import { mergeFocusPoints } from '../shared/focus';
import { composeProductionVideo, type ProductionClip } from './compose';
import { keyframeStorageStatus, publishReferenceImage, publishReferenceVideo } from './keyframe-storage';
import { prepareReferenceSceneFrame, prepareVideoEditSource } from './media';
import { generateOmniVideo, omniConfigured, omniRequestBody, saveOmniVideo, waitOmni, type OmniVideoSettings } from './omni';
import { getProject, saveProject } from './store';
import { generateStoryboardGrids } from './storyboard-grid';
import { workspaceUploadPath } from './workspace-storage';

type FullReferenceAnalysis = {
  result: Analysis;
  meta: AnalysisMeta;
  scenes: ReferenceScene[];
  masterPrompt?: VideoMasterPrompt;
};
type OmniGenerationInput = Omit<OmniVideoSettings, 'sourceVideoUrl'> & {
  prompt: string;
  references: { id: string; filename: string; mime: string }[];
  source?: { videoId: string; filename: string; start: number; end: number };
  requestKey: string;
  requestFingerprint: string;
};

export class TaskError extends Error { constructor(public status: number, message: string) { super(message); } }

type TaskSpec =
  | { kind: 'analysis'; agentAnalysis: FullReferenceAnalysis }
  | { kind: 'generation'; input: OmniGenerationInput }
  | { kind: 'recover'; videoId: string }
  | { kind: 'compose'; production: { clips: ProductionClip[]; width: number; height: number } };

const activeProjects = new Set<string>();
let occupied = 0;
const queue: (() => void)[] = [];
async function acquire() {
  if (occupied < 2) { occupied++; return; }
  await new Promise<void>(resolve => queue.push(resolve));
}
function release() { const next = queue.shift(); if (next) next(); else occupied--; }

function update(id: string, change: (project: Project) => Project) {
  return saveProject(change(getProject(id)!));
}

function updateVideo(id: string, videoId: string, patch: Partial<GeneratedVideo>) {
  update(id, project => ({ ...project, generatedVideos: project.generatedVideos.map(item => item.id === videoId ? { ...item, ...patch } : item) }));
}

async function saveReferenceAnalysis(
  project: Project, analysis: FullReferenceAnalysis,
  progress: (n: number, message: string) => void,
) {
  const video = project.assets.find(asset => asset.kind === 'video')!;
  const { result, meta, scenes, masterPrompt } = analysis;
  const rows: ReferenceSceneTable['rows'] = [];
  for (const [index, scene] of scenes.entries()) {
    if (index % 5 === 0) progress(68 + Math.floor(index / scenes.length * 10), `正在提取场景截图 ${index + 1}/${scenes.length}…`);
    try {
      const primary = await prepareReferenceSceneFrame(video, scene);
      const keyframes = [{ at: primary.frameAt, url: primary.frameUrl }];
      for (const frameAt of scene.additionalFrameTimes || []) {
        const frame = await prepareReferenceSceneFrame(video, { ...scene, frameAt });
        if (!keyframes.some(item => item.url === frame.frameUrl)) keyframes.push({ at: frame.frameAt, url: frame.frameUrl });
      }
      rows.push({ ...scene, ...primary, keyframes: keyframes.sort((a, b) => a.at - b.at) });
    } catch (error) {
      throw new Error(`第 ${index + 1} 个场景的原片截图提取失败。`, { cause: error });
    }
  }
  const referenceSceneTable = { videoId: video.id, duration: result.duration, createdAt: meta.analyzedAt, masterPrompt, rows };
  const storyboardGrids = await generateStoryboardGrids(video, result, project.storyboardGridSize || 3,
    (done, total) => progress(78 + Math.round(done / total * 18), `正在生成分镜网格 ${done}/${total}…`));
  update(project.id, current => {
    const previous = current.analysis;
    const oldShots = new Map(previous?.shots.map(shot => [shot.id, shot]));
    const shots = result.shots.map(shot => {
      const old = oldShots.get(shot.id);
      const overlap = old ? Math.max(0, Math.min(old.end, shot.end) - Math.max(old.start, shot.start)) : 0;
      const sameSegment = old && overlap / Math.max(old.end - old.start, shot.end - shot.start) > 0.5;
      return { ...shot, focusPoints: mergeFocusPoints(sameSegment ? old.focusPoints : [], shot.focusPoints) };
    });
    return { ...current, isDemo: false, ttsTimingNotice: undefined,
      analysis: previous ? { ...result, focusPoints: mergeFocusPoints(previous.focusPoints, result.focusPoints), shots } : result,
      analysisReview: { pendingIds: [], suggestions: {} }, analysisMeta: meta, analysisRequest: null,
      breakdownType: 'storyboard-grid', storyboardGrids, referenceSceneTable, rewriteStale: !!current.rewrite,
      generatedVideos: current.generatedVideos.map(video => ({ ...video, stale: true })), composedVideos: current.composedVideos?.map(video => ({ ...video, stale: true })),
    };
  });
}

function newOmniVideo(input: OmniGenerationInput, startedAt: string): GeneratedVideo {
  if ((input.references.length || input.source) && !keyframeStorageStatus().configured) {
    throw new TaskError(409, '请先连接 Supabase 私有素材存储。');
  }
  const id = randomUUID();
  const model = input.model || (input.duration === 8 ? 'omni_flash_8s' : 'omni_flash_10s');
  const editSource = input.source && { videoId: input.source.videoId, start: input.source.start, end: input.source.end };
  const duration = editSource ? editSource.end - editSource.start : input.duration ?? 10;
  return {
    id, provider: 'omni-flash', model, mode: input.references.length || editSource ? 'r2v' : 't2v',
    productionMode: 'veo-native', shotId: id, unitId: `agent-video-${id}`, sourceShotIds: [],
    imageUrls: [], referenceIds: input.references.map(reference => reference.id), editSource,
    requestKey: input.requestKey, requestFingerprint: input.requestFingerprint,
    resolution: input.resolution, aspectRatio: input.aspectRatio, duration,
    ...(editSource ? { targetDuration: duration } : {}),
    providerRequest: { model, prompt: input.prompt, resolution: input.resolution, ...(!editSource ? {
      aspect_ratio: input.aspectRatio, first_last_frame: input.firstLastFrame, ...(input.model ? { seconds: input.duration } : {}),
    } : {}) },
    status: 'running', prompt: input.prompt, startedAt,
  };
}

async function submitOmniTask(projectId: string, video: GeneratedVideo, input: OmniGenerationInput, progress: (n: number, message: string) => void) {
  const { references, source, model, duration, firstLastFrame, resolution, aspectRatio } = input;
  const imageUrls: string[] = [];
  if (references.length) progress(8, '正在发布参考图…');
  for (const { filename, mime } of references) {
    imageUrls.push(await publishReferenceImage(projectId, filename, mime));
  }
  let sourceVideoUrl: string | undefined;
  if (source) {
    const filename = `video-edit-source-${video.id}.mp4`;
    progress(10, '正在裁取并发布选定的待编辑视频区间…');
    try {
      await prepareVideoEditSource(source.filename, source.start, source.end, filename);
      sourceVideoUrl = await publishReferenceVideo(projectId, filename);
    } finally { await fs.rm(workspaceUploadPath(filename), { force: true }).catch(() => {}); }
  }
  const settings = { model, duration, firstLastFrame, resolution, aspectRatio, sourceVideoUrl };
  const providerRequest = omniRequestBody(input.prompt, settings, imageUrls);
  // Signed URLs for edit sources are temporary credentials. Keep the source time range in the record.
  updateVideo(projectId, video.id, source ? { imageUrls } : { imageUrls, providerRequest });
  return generateOmniVideo(input.prompt, settings, imageUrls, progress, requestId => updateVideo(projectId, video.id, { requestId }));
}

export function launchTask(id: string, spec: TaskSpec): Promise<void> {
  const project = getProject(id);
  if (!project) throw new TaskError(404, '找不到这个创意。');
  if (activeProjects.has(id) || project.job?.status === 'running') throw new TaskError(409, '当前任务正在处理，请等待完成。');
  if (spec.kind === 'analysis' && !project.assets.some(asset => asset.kind === 'video')) throw new TaskError(400, '请先上传参考视频。');
  if ((spec.kind === 'generation' || spec.kind === 'recover') && !omniConfigured()) throw new TaskError(503, '请先连接 Omni 视频服务。');

  const now = new Date().toISOString();
  let video: GeneratedVideo | undefined;
  if (spec.kind === 'generation') video = newOmniVideo(spec.input, now);
  if (spec.kind === 'recover') {
    video = project.generatedVideos.find(item => item.id === spec.videoId && item.provider === 'omni-flash');
    if (!video?.requestId || video.status !== 'failed' || video.stale) throw new TaskError(409, '没有可恢复的 Omni 视频任务。');
  }
  const job: Job = {
    id: randomUUID(), kind: spec.kind === 'recover' ? 'generation' : spec.kind === 'compose' ? 'composition' : spec.kind,
    status: 'running', progress: 2, startedAt: now, videoId: video?.id, unitId: video?.unitId,
    message: occupied >= 2 ? '排队中，正在等待空闲处理资源…' : '正在准备任务…',
  };
  const generatedVideos = spec.kind === 'generation' ? [...project.generatedVideos, video!]
    : spec.kind === 'recover' ? project.generatedVideos.map(item => item.id === video!.id ? { ...item, status: 'running' as const, error: undefined, finishedAt: undefined } : item)
    : project.generatedVideos;
  const saved = saveProject({ ...project, job, generatedVideos });
  activeProjects.add(id);

  const progress = (n: number, message: string) => update(id, current => ({ ...current, job: { ...current.job!, progress: n, message } }));
  return (async () => {
    await acquire();
    try {
      let message: string;
      if (spec.kind === 'analysis') {
        await saveReferenceAnalysis(saved, spec.agentAnalysis, progress);
        message = '场景表与分镜网格已完成';
      } else if (spec.kind === 'compose') {
        const { clips, width, height } = spec.production;
        const rendered = await composeProductionVideo(clips, width, height, progress);
        update(id, current => ({ ...current, composedVideos: [...(current.composedVideos || []), rendered] }));
        message = '选定片段已拼接成片';
      } else {
        const target = video!;
        const remote = spec.kind === 'generation'
          ? await submitOmniTask(id, target, spec.input, progress)
          : { id: target.requestId!, url: await waitOmni(target.requestId!, progress) };
        const local = await saveOmniVideo(remote.url, target.id, remote.id, progress);
        updateVideo(id, target.id, { ...local, status: 'completed', finishedAt: new Date().toISOString(), stale: false });
        message = 'Omni Flash 视频片段已保存到本机';
      }
      update(id, current => {
        const completed: Job = { ...current.job!, status: 'completed', progress: 100, message, finishedAt: new Date().toISOString() };
        return { ...current, job: completed, jobHistory: [...(current.jobHistory || []), completed].slice(-200) };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '任务未完成，请重试。';
      update(id, current => {
        const failed: Job = { ...current.job!, status: 'failed', message, finishedAt: new Date().toISOString() };
        const videos = current.generatedVideos.map(item => item.id === video?.id && item.status !== 'completed'
          ? { ...item, status: 'failed' as const, error: message, finishedAt: failed.finishedAt } : item);
        return { ...current, job: failed, generatedVideos: videos, jobHistory: [...(current.jobHistory || []), failed].slice(-200) };
      });
      throw error;
    } finally { activeProjects.delete(id); release(); }
  })();
}
