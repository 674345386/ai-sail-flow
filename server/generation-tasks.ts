import type { Job, Project } from '../shared/domain';
import { generationTaskActive, type GenerationTask, type GenerationTaskList, type GenerationTaskStage, type GenerationTaskStatus } from '../shared/generation-task';
import { getProject, getWorkspaceProject, listProjects } from './store';
import { imageAttemptActive, imageGenerationStatus, listImageAttempts } from './image-generation';
import { studioGenerationTasks } from './studio';

const imageLabels: Record<string, string> = {
  'agent-image': 'Agent 图片', recreation: '复刻关键帧', 'remix-character': '人物参考图',
  'tier-frame': '镜头关键帧', 'tier-subject-gen': '主体参考图',
};
function context(project?: Project) {
  return {
    creativeId: project?.id, creativeTitle: project?.title || '历史图片任务',
    projectTitle: project?.parentProjectId ? getWorkspaceProject(project.parentProjectId)?.title : undefined,
    archived: !!project?.archivedAt,
  };
}
function videoStage(job?: Job): GenerationTaskStage {
  if (!job) return 'generate';
  if (job.progress >= 75 || /保存|下载|切分|拼接/.test(job.message)) return 'save';
  if (job.progress >= 30 || /排队|正在生成视频|等待生成|等待成片|确认任务状态/.test(job.message)) return 'generate';
  return 'prepare';
}
function runningStatus(stage: GenerationTaskStage, message: string): GenerationTaskStatus {
  if (/排队|等待空闲|等待生成|等待成片|确认任务状态/.test(message)) return 'queued';
  return stage === 'save' ? 'saving' : stage === 'generate' ? 'processing' : 'submitting';
}

/** Read existing production records; this endpoint never submits or retries a generation. */
export function generationTasks(): GenerationTask[] {
  const projects = listProjects().map(item => getProject(item.id)!).filter(Boolean);
  const byId = new Map(projects.map(project => [project.id, project]));
  const imageOwners = new Map<string, Project>();
  const imageSources = new Map<string, string>();
  const remember = (project: Project, key?: string, source?: string) => {
    if (key) { imageOwners.set(key, project); if (source) imageSources.set(key, source); }
  };
  for (const project of projects) {
    for (const image of project.agentImages || []) { remember(project, image.id, 'Agent 图片'); remember(project, image.filename, 'Agent 图片'); }
    for (const shot of project.rewrite?.shots || []) { remember(project, shot.keyframe?.attemptId, '复刻关键帧'); remember(project, shot.keyframe?.filename, '复刻关键帧'); }
    remember(project, project.remix?.character?.filename, '人物参考图');
    for (const job of [...(project.jobHistory || []), ...(project.job ? [project.job] : [])]) if (job.kind === 'remix-character') remember(project, job.id, '人物参考图');
    for (const subject of project.replication?.subjects || []) for (const image of subject.images) if (image.generated) remember(project, image.filename, '主体参考图');
    for (const [shotId, shot] of Object.entries(project.replication?.shots || {})) for (const [position, frame] of Object.entries(shot.newFrames || {})) {
      const label = `镜头 ${shotId} · ${position === 'first' ? '首帧' : position === 'last' ? '尾帧' : '中间帧'}`;
      if (frame?.kind !== 'uploaded') remember(project, frame?.filename, label);
      if (frame?.previous?.kind !== 'uploaded') remember(project, frame?.previous?.filename, label);
    }
  }

  const tasks: GenerationTask[] = [];
  const imageKeys = new Set<string>();
  const imageFiles = new Set<string>();
  const studioTasks = studioGenerationTasks();
  const studioImages = new Map(studioTasks.map(task => [task.id, task]));
  for (const attempt of listImageAttempts()) {
    const studioTask = studioImages.get(`image:${attempt.key}`);
    const project = (attempt.projectId ? byId.get(attempt.projectId) : undefined) || imageOwners.get(attempt.key) || imageOwners.get(attempt.result?.filename || '');
    const status: GenerationTaskStatus = attempt.status === 'completed' ? 'completed' : attempt.status === 'rejected' ? 'failed'
      : attempt.status === 'unknown' || !imageAttemptActive(attempt.key) ? 'needs-attention'
      : attempt.phase === 'saving' ? 'saving' : attempt.phase === 'submitting' ? 'submitting' : 'processing';
    const createdAt = studioTask?.createdAt || attempt.submittedAt || attempt.result?.generatedAt || '';
    tasks.push({
      id: `image:${attempt.taskId || attempt.key}`, kind: 'image', ...context(project),
      ...(studioTask ? { studioProjectId: studioTask.studioProjectId, creativeTitle: studioTask.creativeTitle, projectTitle: studioTask.projectTitle } : {}),
      source: studioTask?.source || imageSources.get(attempt.key) || imageSources.get(attempt.result?.filename || '') || imageLabels[attempt.label || ''] || attempt.label || '图片生成',
      model: attempt.model, prompt: attempt.prompt, status,
      stage: status === 'completed' || attempt.phase === 'saving' ? 'save' : attempt.phase === 'submitting' ? 'prepare' : 'generate',
      message: status === 'completed' ? '图片已保存，可以预览和下载。' : status === 'needs-attention'
        ? attempt.error || '图片请求已中断，结果待核对；请先确认原任务结果。'
        : status === 'failed' ? attempt.error || '图片服务拒绝了该请求。' : status === 'saving' ? '正在接收并保存生成的图片…' : status === 'submitting' ? '正在准备图片生成请求…' : '图片模型正在生成，请稍候…',
      createdAt, updatedAt: attempt.updatedAt || attempt.result?.generatedAt || createdAt,
      finishedAt: attempt.finishedAt || attempt.result?.generatedAt, requestId: attempt.requestId,
      aspectRatio: attempt.aspectRatio, size: attempt.size, quality: attempt.quality, referenceCount: attempt.references?.length || 0,
      width: attempt.result?.width, height: attempt.result?.height, error: attempt.error, warning: attempt.result?.warning,
      outputs: attempt.result ? [{ id: attempt.key, url: attempt.result.url, filename: attempt.result.filename }] : [],
    });
    imageKeys.add(attempt.key);
    if (attempt.taskId) imageKeys.add(attempt.taskId);
    if (attempt.result?.filename) imageFiles.add(attempt.result.filename);
  }
  for (const task of studioTasks) if (!imageKeys.has(task.id.slice('image:'.length))) tasks.push(task);

  // Older completed media may predate image request logging. Keep those results findable too.
  const addLegacyImage = (project: Project, input: {
    id: string; source: string; prompt: string; model?: string; createdAt?: string; status?: 'running' | 'completed' | 'failed';
    filename?: string; url?: string; error?: string; warning?: string; aspectRatio?: string; size?: string; width?: number; height?: number;
  }) => {
    if (imageKeys.has(input.id) || input.filename && imageFiles.has(input.filename)) return;
    const status = input.status === 'running' ? 'submitting' : input.status === 'failed' ? /待核对|重启|中断/.test(input.error || '') ? 'needs-attention' : 'failed' : 'completed';
    const createdAt = input.createdAt || '';
    tasks.push({ id: `image:${input.id}`, kind: 'image', ...context(project), model: input.model || '图片生成', source: input.source, prompt: input.prompt,
      aspectRatio: input.aspectRatio, size: input.size, width: input.width, height: input.height, error: input.error, warning: input.warning, status,
      stage: status === 'completed' ? 'save' : 'prepare', createdAt, updatedAt: createdAt, finishedAt: status === 'completed' ? createdAt : undefined,
      message: input.error || (status === 'completed' ? '图片已保存，可以预览和下载。' : status === 'failed' ? '图片生成失败。' : '正在准备图片生成请求…'),
      outputs: input.url ? [{ id: input.id, url: input.url, filename: input.filename }] : [],
    });
    imageKeys.add(input.id);
    if (input.filename) imageFiles.add(input.filename);
  };

  for (const project of projects) {
    const imageJob = project.job;
    if (imageJob?.status === 'running' && (imageJob.kind === 'keyframe' || imageJob.kind === 'remix-character') && !imageKeys.has(imageJob.id)) {
      const alreadySubmitted = tasks.some(task => task.kind === 'image' && task.creativeId === project.id && task.createdAt >= imageJob.startedAt
        && task.source === (imageJob.kind === 'keyframe' ? '复刻关键帧' : '人物参考图'));
      if (!alreadySubmitted) tasks.push({
        id: `image:${imageJob.id}`, kind: 'image', ...context(project), model: imageGenerationStatus().model,
        source: imageJob.kind === 'keyframe' ? '复刻关键帧' : '人物参考图', prompt: '',
        status: /排队|等待空闲/.test(imageJob.message) ? 'queued' : 'submitting', stage: 'prepare',
        message: imageJob.message, createdAt: imageJob.startedAt, updatedAt: project.updatedAt, outputs: [],
      });
    }
    for (const image of project.agentImages || []) addLegacyImage(project, { ...image, source: 'Agent 图片' });
    for (const shot of project.rewrite?.shots || []) if (shot.keyframe) {
      const frame = shot.keyframe;
      addLegacyImage(project, { ...frame, id: frame.attemptId || frame.filename || `${project.id}:${shot.id}`, source: '复刻关键帧', createdAt: frame.generatedAt });
    }
    const character = project.remix?.character;
    if (character && character.source !== 'uploaded') addLegacyImage(project, { ...character, id: character.filename, source: '人物参考图', createdAt: character.generatedAt });
    for (const [shotId, shot] of Object.entries(project.replication?.shots || {})) for (const [position, current] of Object.entries(shot.newFrames || {})) {
      for (const frame of [current, current?.previous]) if (frame && frame.kind !== 'uploaded') addLegacyImage(project, {
        ...frame, id: frame.filename, source: `镜头 ${shotId} · ${position === 'first' ? '首帧' : position === 'last' ? '尾帧' : '中间帧'}`, prompt: shot.prompt || '',
      });
    }
    for (const subject of project.replication?.subjects || []) for (const image of subject.images) if (image.generated) addLegacyImage(project, {
      ...image, id: image.filename, source: '主体参考图', prompt: '',
    });

    const jobs = [...(project.jobHistory || []), ...(project.job ? [project.job] : [])];
    const groupedVideos = new Map<string, GenerationTask>();
    for (const video of [...project.generatedVideos, ...(project.remix?.videos || [])]) {
      const generated = 'provider' in video ? video : undefined;
      const job = [...jobs].reverse().find(item => item.videoId === video.id || !!generated?.tierGroupId && item.unitId === generated.unitId);
      const interrupted = video.status === 'running' && (!job || job.status !== 'running');
      const stage = video.status === 'completed' || generated?.minimax?.upstreamStatus === 'succeeded' ? 'save' : videoStage(job);
      const status: GenerationTaskStatus = interrupted ? 'needs-attention' : video.status === 'running' ? runningStatus(stage, job?.message || '')
        : video.status === 'completed' ? 'completed' : generated?.minimax?.upstreamStatus === 'succeeded' || /待核对|重启|中断/.test(video.error || '') ? 'needs-attention' : 'failed';
      const output = video.url ? { id: video.id, url: video.url, filename: video.filename, thumbnail: video.thumbnail } : undefined;
      const groupId = generated?.tierGroupId;
      const existing = groupId ? groupedVideos.get(groupId) : undefined;
      // One upstream generation can produce multiple shot clips; count the request once.
      if (existing) {
        if (output) existing.outputs.push(output);
        existing.duration = (existing.duration || 0) + (video.duration || 0);
        const priority: GenerationTaskStatus[] = ['completed', 'submitting', 'queued', 'processing', 'saving', 'failed', 'needs-attention'];
        if (priority.indexOf(status) > priority.indexOf(existing.status)) { existing.status = status; existing.stage = stage; existing.error = video.error; existing.message = video.error || job?.message || existing.message; }
        if (generationTaskActive(existing.status)) existing.finishedAt = undefined;
        continue;
      }
      const task: GenerationTask = {
        id: `video:${groupId || video.id}`, kind: 'video', ...context(project),
        source: generated ? groupId ? '多镜头视频' : generated.provider === 'local-test' ? '本地测试视频' : generated.storyboardGridId ? '分镜网格视频' : '视频生成' : '人物与视频二创',
        model: video.model, prompt: video.prompt, status, stage,
        message: video.error || (interrupted ? '本地处理已中断，请打开所属创意核对原任务。' : video.status === 'completed' ? '视频已保存，可以播放和下载。' : job?.message || '视频模型正在处理…'),
        createdAt: video.startedAt, updatedAt: video.status === 'running' && job?.status === 'running' ? project.updatedAt : video.finishedAt || job?.finishedAt || video.startedAt,
        finishedAt: video.status === 'running' ? undefined : video.finishedAt, requestId: video.requestId,
        aspectRatio: video.aspectRatio, resolution: video.resolution, duration: video.duration, width: video.width, height: video.height,
        referenceCount: generated?.referenceIds?.length ?? generated?.imageUrls?.length, credits: generated?.minimax?.credits,
        error: video.error, outputs: output ? [output] : [],
      };
      tasks.push(task);
      if (groupId) groupedVideos.set(groupId, task);
    }
  }
  return tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

export function generationTaskList(query = ''): GenerationTaskList {
  const tasks = generationTasks();
  const search = query.trim().toLocaleLowerCase();
  const matches = search ? tasks.filter(task => [task.id, task.requestId, task.prompt, task.model, task.source, task.creativeTitle, task.projectTitle].some(value => value?.toLocaleLowerCase().includes(search))) : tasks;
  return {
    tasks: matches.map(task => ({ ...task, prompt: task.prompt.slice(0, 240) })),
    counts: { total: tasks.length, active: tasks.filter(task => generationTaskActive(task.status)).length,
      attention: tasks.filter(task => task.status === 'failed' || task.status === 'needs-attention').length,
      completed: tasks.filter(task => task.status === 'completed').length },
    updatedAt: new Date().toISOString(),
  };
}
