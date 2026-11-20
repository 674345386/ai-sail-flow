import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Asset, Project } from '../shared/domain';
import { referenceSceneImages } from '../shared/agent-video-analysis';
import { levelInfo } from '../shared/replication-levels';
import { H3_MIN_SECONDS, OMNI_FLASH_12, OMNI_FLASH_12_SECONDS, PRODUCTION_SEGMENT_SECONDS, productionCompositionInput, productionVideoInput, videoProductionInput, type ProductionVideoInput, type VideoProductionPlan } from '../shared/video-production';
import { prepareReferenceSceneFrame } from './media';
import { startMinimaxVideo } from './minimax-video';
import { getProject, saveProject } from './store';
import { launchTask, TaskError } from './tasks';
import { omniConfigured } from './omni';
import { workspaceUploadPath } from './workspace-storage';
import type { ProductionClip } from './compose';
import type { z } from 'zod';

type ImageReference = { id: string; name?: string; filename?: string; mime?: string };

export function productionImages(project: Project, extras: ImageReference[] = []): ImageReference[] {
  return [
    ...project.assets.filter(asset => asset.kind === 'product'), ...extras,
    ...(project.agentImages || []).filter(image => image.status === 'completed'), ...(project.storyboardGrids || []), ...(project.productionStoryboards || []),
    ...productionScopeImages(project),
  ];
}

export function productionScopeImages(project: Project) {
  return (project.videoProductionPlan?.scenes || []).flatMap(scene => (scene.originalFrames || []).map(frame => ({
    ...frame, mime: 'image/jpeg' as const, name: `${scene.title} · ${frame.at.toFixed(3)} 秒`,
  })));
}

export async function saveVideoProductionPlan(project: Project, input: z.infer<typeof videoProductionInput>, images: ImageReference[]) {
  if (input.revision !== project.revision) throw new TaskError(409, '创意已更新，请重新读取后保存制作方案。');
  const { revision: _revision, ...plan } = input;
  const video = plan.sourceVideoId ? project.assets.find(asset => asset.id === plan.sourceVideoId && asset.kind === 'video') : undefined;
  if (plan.sourceVideoId && !video?.duration) throw new TaskError(404, '制作方案引用的视频不存在或缺少时长。');
  if (plan.method === 'edit' && !video) throw new TaskError(400, '视频编辑方案需要原片。');
  const refs = new Set(images.map(image => image.id));
  let previousEnd = 0;
  for (const scene of plan.scenes) {
    if (scene.end <= scene.start || scene.start < previousEnd || video?.duration && scene.end > video.duration + 0.001 ||
        plan.method !== 'edit' && scene.end - scene.start > PRODUCTION_SEGMENT_SECONDS + 0.001) throw new TaskError(400, '场景时间须依序排列且不重叠，并位于原片范围内。生成片段每段最长 10 秒。');
    if ([...scene.sourceFrameIds, ...scene.referenceIds].some(id => !refs.has(id))) throw new TaskError(400, '制作方案中的图片须属于当前创意。');
    if (scene.originalFrameTimes?.some(at => !video || at < scene.start || at >= scene.end)) throw new TaskError(400, '原片关键帧时间必须位于当前场景区间。');
    previousEnd = scene.end;
  }
  const scenes: VideoProductionPlan['scenes'] = [];
  const table = project.referenceSceneTable?.videoId === video?.id ? project.referenceSceneTable : undefined;
  const savedFrames = new Map([...referenceSceneImages(table), ...productionScopeImages(project)].map(frame => [frame.id, frame]));
  for (const scene of plan.scenes) {
    const originalFrames = [...new Set(scene.sourceFrameIds)].flatMap(id => {
      const frame = savedFrames.get(id);
      return frame ? [{ id, at: frame.at, url: frame.url, filename: frame.filename }] : [];
    });
    for (const at of new Set(scene.originalFrameTimes || [])) {
      const frame = await prepareReferenceSceneFrame(video!, { ...scene, frameAt: at });
      const filename = path.basename(frame.frameUrl);
      const frameId = filename.replace(/\.jpg$/, '');
      if (!originalFrames.some(item => item.id === frameId)) originalFrames.push({ id: frameId, url: frame.frameUrl, at: frame.frameAt, filename });
    }
    const sourceFrameIds = [...new Set([...scene.sourceFrameIds, ...originalFrames.map(frame => frame.id)])];
    if (sourceFrameIds.length > 3) throw new TaskError(400, '每个场景最多选 3 张原片关键帧。');
    scenes.push({ ...scene, originalFrames, sourceFrameIds });
  }
  const current = getProject(project.id);
  if (!current || current.revision !== input.revision) throw new TaskError(409, '提取场景截图时创意已更新，请重新读取后保存制作方案。');
  const updated = { ...plan, scenes, level: plan.level ?? project.replication?.level, updatedAt: new Date().toISOString() };
  saveProject({ ...current, videoProductionPlan: updated });
  return updated;
}

export function productionSceneImage(project: Project, sceneIndex: number) {
  const plan = project.videoProductionPlan;
  const scene = plan?.scenes[sceneIndex - 1];
  if (!scene?.keyframePrompt) throw new TaskError(400, '请先保存此场景的关键帧 Prompt。');
  const useSource = levelInfo(plan?.level || project.replication?.level).frameUse !== 'none';
  const referenceIds = [...new Set([...(useSource ? scene.sourceFrameIds : []), ...scene.referenceIds])];
  if (referenceIds.length > 4) throw new TaskError(400, '场景原片帧与用户参考图合计最多 4 张，请在方案中选定要发送的图。');
  return { prompt: scene.keyframePrompt, referenceIds };
}

export function sourceRange(video: Pick<Asset, 'duration'>, start = 0, end = video.duration) {
  if (!video.duration || end === undefined || end <= start || end > video.duration + 0.001) throw new TaskError(400, '请选择原片时长内的有效区间。');
  return { start, end: Math.min(end, video.duration) };
}

export function productionProvider(input: Pick<ProductionVideoInput, 'model' | 'sourceVideoId'>, editDuration?: number) {
  if (input.sourceVideoId) return editDuration !== undefined && editDuration >= H3_MIN_SECONDS - 1e-6 ? OMNI_FLASH_12 : 'h3';
  return input.model?.startsWith('omni_flash') ? input.model : 'h3';
}

export async function composeSelectedVideo(project: Project, input: z.infer<typeof productionCompositionInput>) {
  const clips: ProductionClip[] = [];
  let width: number | undefined, height: number | undefined;
  for (const clip of input.clips) {
    const video = project.generatedVideos.find(item => item.id === clip.videoId && item.status === 'completed' && item.filename);
    if (!video?.filename || !fs.existsSync(workspaceUploadPath(video.filename))) throw new TaskError(404, `找不到已完成的片段 ${clip.videoId}。`);
    const start = clip.start ?? 0;
    const end = clip.end ?? Math.min(video.duration, start + (video.targetDuration || video.duration));
    clips.push({ id: video.id, filename: video.filename, ...sourceRange(video, start, end), hasAudio: video.hasAudio });
    width ??= video.width;
    height ??= video.height;
  }
  if (input.replace) {
    const original = project.assets.find(asset => asset.kind === 'video' && asset.id === input.replace!.videoId);
    if (!original?.duration || !fs.existsSync(workspaceUploadPath(original.filename))) throw new TaskError(404, '未找到待局部替换的原片。');
    const { start, end } = sourceRange(original, input.replace.start, input.replace.end);
    const duration = clips.reduce((sum, clip) => sum + clip.end - clip.start, 0);
    if (Math.abs(duration - (end - start)) > 1 / 30) throw new TaskError(400, '拼接片段的裁剪后时长须与局部替换区间一致。');
    const source = { id: original.id, filename: original.filename, hasAudio: original.hasAudio };
    if (start > 0) clips.unshift({ ...source, start: 0, end: start });
    if (end < original.duration) clips.push({ ...source, start: end, end: original.duration });
    width = original.width ?? width;
    height = original.height ?? height;
  }
  if (!width || !height) throw new TaskError(400, '首段视频缺少有效画幅。');
  await launchTask(project.id, { kind: 'compose', production: { clips, width: Math.floor(width / 2) * 2, height: Math.floor(height / 2) * 2 } });
  return getProject(project.id)!.composedVideos!.at(-1)!;
}

export async function startProductionVideo(project: Project, body: unknown, images: ImageReference[], scope: string, gridId?: string) {
  const input = productionVideoInput.parse(body);
  if (project.archivedAt) throw new TaskError(409, '请先恢复已归档创意。');
  if (input.sceneIndex) {
    const plan = project.videoProductionPlan;
    const scene = plan?.scenes[input.sceneIndex - 1];
    if (!plan || !scene) throw new TaskError(404, '找不到已保存的制作场景。');
    input.prompt = scene.prompt;
    if (plan.method === 'edit') {
      if (input.sourceVideoId && input.sourceVideoId !== plan.sourceVideoId || input.start !== undefined || input.end !== undefined) throw new TaskError(400, '已选制作场景使用保存的编辑区间。');
      Object.assign(input, { sourceVideoId: plan.sourceVideoId, start: scene.start, end: scene.end });
      input.referenceIds = [...new Set([...input.referenceIds, ...scene.referenceIds])];
    } else {
      if (plan.method === 'storyboard') throw new TaskError(400, '故事板方案请使用 build_video_storyboard 与 generate_grid_video。');
      if (input.sourceVideoId) throw new TaskError(400, '逐场景制作使用生成或首尾帧模式。');
      input.duration = scene.end - scene.start;
      if (!input.firstFrameId && !input.lastFrameId) {
        const frame = [...project.agentImages || []].reverse().find(image => image.status === 'completed' && image.productionSceneIndex === input.sceneIndex && image.productionPlanUpdatedAt === plan.updatedAt);
        if (scene.keyframePrompt && !frame && !input.referenceIds.length) throw new TaskError(409, '请先生成或选择此场景的关键帧。');
        const selected = input.referenceIds.length ? input.referenceIds : frame ? [frame.id] : [];
        input.referenceIds = [...new Set([...selected, ...scene.referenceIds])];
      }
    }
  }
  const prompt = input.prompt;
  if (!prompt) throw new TaskError(400, '请填写视频 Prompt 或指定一个已保存的制作场景。');
  if (!input.sourceVideoId && (input.start !== undefined || input.end !== undefined)) throw new TaskError(400, '编辑区间需要源视频 ID。');
  const video = input.sourceVideoId ? project.assets.find(asset => asset.id === input.sourceVideoId && asset.kind === 'video') : undefined;
  if (input.sourceVideoId && !video) throw new TaskError(404, '待编辑视频不在当前创意中。');
  const source = video ? { videoId: video.id, filename: video.filename, ...sourceRange(video, input.start, input.end) } : undefined;
  const editDuration = source && source.end - source.start;
  const provider = productionProvider(input, editDuration);
  const frames = [input.firstFrameId, input.lastFrameId].filter((id): id is string => !!id);
  if (frames.length && (input.referenceIds.length || input.referenceVideoIds.length)) throw new TaskError(400, '首尾帧模式请只传首帧和尾帧 ID。');
  if (source && (frames.length || input.referenceVideoIds.length || input.duration !== undefined || input.aspectRatio !== undefined)) throw new TaskError(400, '视频编辑沿用源区间的时长和画幅，支持附加参考图。');
  if (input.sourceVideoId && input.model && (provider === 'h3' ? input.model.startsWith('omni_flash') : input.model !== provider)) throw new TaskError(400, '现有视频编辑按源区间时长选择模型，请省略 model 以使用自动路由。');
  const imageIds = frames.length ? frames : input.referenceIds;
  // Reusing one reference as both endpoints is useful for a seamless loop.
  if (!frames.length && new Set(imageIds).size !== imageIds.length) throw new TaskError(400, '参考图不能重复。');
  const aspectRatio = input.aspectRatio || (project.market.aspectRatio === '4:5' ? '9:16' : project.market.aspectRatio);

  if (provider === 'h3') {
    if (input.resolution === '1080p') throw new TaskError(400, '默认制作流程的 H3 支持 480p 和 720p。');
    const targetDuration = editDuration ?? input.duration ?? 6;
    const resolution = input.resolution || (['16:9', '9:16'].includes(aspectRatio) ? '720p' : '480p');
    let references = images;
    let referenceIds = input.referenceIds;
    if (source && video) {
      const frame = await prepareReferenceSceneFrame(video, { ...source, frameAt: (source.start + source.end) / 2 });
      project = getProject(project.id)!;
      if (!project.assets.some(asset => asset.id === source.videoId && asset.filename === source.filename)) throw new TaskError(409, '待编辑视频已替换，请重新选择。');
      const filename = path.basename(frame.frameUrl), id = filename.replace(/\.jpg$/, '');
      references = [...images, { id, filename, mime: 'image/jpeg', name: '待重制区间原片关键帧' }];
      referenceIds = [id, ...referenceIds.filter(value => value !== id)];
    }
    const editRatio = video && video.width && video.height ? video.width >= video.height ? '16:9' : '9:16' : aspectRatio;
    return startMinimaxVideo(project, {
      stepId: input.stepId, requestKey: input.requestKey, prompt, ...(input.generateAudio === undefined ? {} : { generateAudio: input.generateAudio }),
      referenceIds, referenceVideoIds: input.referenceVideoIds, firstFrameId: input.firstFrameId, lastFrameId: input.lastFrameId,
      model: frames.length ? 'h3-video-frames' : input.model === 'h3-video-flex' && !input.referenceVideoIds.length ? input.model : 'h3-video',
      duration: Math.max(H3_MIN_SECONDS, Math.ceil(targetDuration)), resolution, aspectRatio: source ? editRatio : aspectRatio,
    }, references, scope, { targetDuration, gridId });
  }

  if (!omniConfigured()) throw new TaskError(503, '请先连接 Omni 视频服务。');
  if (input.referenceVideoIds.length) throw new TaskError(400, 'Omni 参考生成支持图片；独立源视频请使用编辑模式。');
  const modern = provider === OMNI_FLASH_12;
  const ratio = source && video?.width && video.height ? video.width >= video.height ? '16:9' : '9:16' : input.aspectRatio || (aspectRatio === '16:9' ? '16:9' : '9:16');
  if (ratio !== '16:9' && ratio !== '9:16') throw new TaskError(400, 'Omni 视频生成只支持 16:9 或 9:16。');
  if (modern ? input.resolution && input.resolution !== '720p' : input.resolution === '480p') throw new TaskError(400, '当前 Omni Flash 1.2 制作流程使用 720p。');
  const resolution = !modern && input.resolution === '1080p' ? '1080p' : '720p';
  const duration = source ? undefined : input.duration ?? (provider === 'omni_flash_8s' ? 8 : 10);
  if (duration !== undefined && !(modern ? OMNI_FLASH_12_SECONDS : [provider === 'omni_flash_8s' ? 8 : 10]).some(seconds => duration === seconds)) throw new TaskError(400, '请选择该模型支持的生成时长。');
  if (input.lastFrameId && !input.firstFrameId || !modern && frames.length === 1 || frames.length === 2 && Number(duration) > 10 || imageIds.length > (source ? 5 : 7)) throw new TaskError(400, 'Omni 参考图数量或首尾帧参数不符合所选模式限制。');
  const references = imageIds.map(id => {
    const image = images.find(item => item.id === id);
    const filename = image?.filename;
    const mime = image?.mime || (/\.jpe?g$/i.test(filename || '') ? 'image/jpeg' : /\.webp$/i.test(filename || '') ? 'image/webp' : 'image/png');
    if (!filename || !['image/jpeg', 'image/png', 'image/webp'].includes(mime) || !fs.existsSync(workspaceUploadPath(filename))) throw new TaskError(400, `参考图 ${id} 不在当前创意中或无法读取。`);
    return { id, filename, mime };
  });
  const { requestKey, stepId: _step, ...parameters } = input;
  const requestFingerprint = createHash('sha256').update(JSON.stringify([parameters, ratio, resolution, duration, source])).digest('hex');
  const key = requestKey ? `explicit:${requestKey}` : `auto:${createHash('sha256').update(JSON.stringify([scope, requestFingerprint])).digest('hex')}`;
  const existing = project.generatedVideos.find(item => item.provider === 'omni-flash' && item.requestKey === key);
  if (existing) {
    if (existing.requestFingerprint !== requestFingerprint) throw new TaskError(409, '同一请求键不能使用不同参数。');
    return { videoId: existing.id, status: existing.status, reused: true };
  }
  const work = launchTask(project.id, { kind: 'generation', input: {
    prompt, resolution, aspectRatio: ratio, references, source, requestKey: key, requestFingerprint,
    model: modern ? OMNI_FLASH_12 : undefined, duration: duration as (typeof OMNI_FLASH_12_SECONDS)[number] | undefined,
    firstLastFrame: !!frames.length,
  } });
  void work.catch(error => console.warn(`Creative Omni: ${error instanceof Error ? error.message : String(error)}`));
  const job = getProject(project.id)!.job!;
  return { videoId: job.videoId, jobId: job.id, status: 'running' as const };
}
