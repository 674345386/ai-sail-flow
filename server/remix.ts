import { randomUUID } from 'node:crypto';
import type { Job, Project } from '../shared/domain';
import { defaultRemixSettings, REMIX_MODEL, remixCharacterCurrent, remixPlanCurrent, remixVideoBasis, type RemixAction, type RemixVideo } from '../shared/remix';
import { getProject, saveProject } from './store';
import { configured, generateRemixCharacter, planRemix } from './gemini';
import { generationConfigured, saveGeneratedVideo } from './veo';
import { keyframeStorageStatus, publishReferenceImage } from './keyframe-storage';
import { submitOmni, waitOmni } from './omni';

export class RemixError extends Error { constructor(public status: number, message: string) { super(message); } }
function update(id: string, mutate: (project: Project) => Project) { return saveProject(mutate(getProject(id)!)); }
export function launchRemix(id: string, action: RemixAction, videoId?: string) {
  let project = getProject(id)!;
  if (project.job?.status === 'running') throw new RemixError(409, '当前任务正在处理。');
  if (!project.analysis || !project.assets.some(asset => asset.kind === 'video')) throw new RemixError(409, '请先完成参考视频拆解。');
  if (project.analysisReview?.pendingIds.length) throw new RemixError(409, '请先重新分析变动镜头，再编写二创提示词。');
  if (['character', 'plan'].includes(action) && !configured()) throw new RemixError(503, '请先连接 Gemini 图像与分析服务。');
  if (action === 'plan' && !remixCharacterCurrent(project)) throw new RemixError(409, '请先生成与当前人物描述一致的新人物参考图。');
  if (action === 'video' && !remixPlanCurrent(project)) throw new RemixError(409, '请先根据当前分析和新人物编写视频提示词。');
  if (['video', 'recover'].includes(action) && !generationConfigured()) throw new RemixError(503, '请先在模型连接中填写视频服务 API Key。');
  if (action === 'video' && !keyframeStorageStatus().configured) throw new RemixError(503, '请先连接 Supabase 私有图片存储。');
  project = { ...project, remix: project.remix || { settings: { ...defaultRemixSettings }, videos: [] } };
  const now = new Date().toISOString();
  let video: RemixVideo | undefined;
  if (action === 'recover') {
    video = project.remix!.videos.find(item => item.id === videoId);
    if (!video?.requestId || video.status === 'completed') throw new RemixError(409, '没有可恢复查询的上游任务。');
    video = { ...video, status: 'running', error: undefined };
  } else if (action === 'video') {
    video = { id: randomUUID(), basis: remixVideoBasis(project), model: REMIX_MODEL, status: 'running',
      prompt: project.remix!.plan!.prompt, ...{ resolution: project.remix!.settings.resolution, aspectRatio: project.remix!.settings.aspectRatio },
      characterFilename: project.remix!.character!.filename, startedAt: now };
  }
  const job: Job = { id: randomUUID(), kind: `remix-${action}` as Job['kind'], status: 'running', progress: 2, message: '正在准备二创任务…', startedAt: now, videoId: video?.id };
  saveProject({ ...project, job, remix: { ...project.remix!, videos: action === 'video' ? [...project.remix!.videos, video!] : action === 'recover' ? project.remix!.videos.map(item => item.id === video!.id ? video! : item) : project.remix!.videos } });
  const progress = (n: number, message: string) => update(id, current => ({ ...current, job: { ...current.job!, progress: n, message } }));
  return (async () => {
    try {
      if (action === 'character' || action === 'plan') {
        const snapshot = getProject(id)!;
        const result = action === 'character' ? await generateRemixCharacter(snapshot, snapshot.remix!.settings) : await planRemix(snapshot, progress);
        update(id, current => ({ ...current, remix: { ...current.remix!, ...('character' in result ? { character: result.character } : { plan: result.plan }) },
          usage: { input: current.usage.input + result.usage.input, output: current.usage.output + result.usage.output } }));
      } else {
        let requestId = video!.requestId;
        if (action === 'video') {
          progress(10, '正在发布新人物参考图的临时链接…');
          const character = getProject(id)!.remix!.character!;
          const url = await publishReferenceImage(id, character.filename, character.mime);
          progress(20, '正在提交 Omni 参考图视频任务…');
          requestId = await submitOmni(video!.prompt, project.remix!.settings, url);
          update(id, current => ({ ...current, remix: { ...current.remix!, videos: current.remix!.videos.map(item => item.id === video!.id ? { ...item, requestId } : item) } }));
        }
        const url = await waitOmni(requestId!, progress);
        const local = await saveGeneratedVideo(url, video!.id, progress, { prefix: 'omni', requestId });
        update(id, current => ({ ...current, remix: { ...current.remix!, videos: current.remix!.videos.map(item => item.id === video!.id
          ? { ...item, ...local, status: 'completed', finishedAt: new Date().toISOString(), error: undefined } : item) } }));
      }
      update(id, current => {
        const completed: Job = { ...current.job!, status: 'completed', progress: 100, finishedAt: new Date().toISOString(),
          message: action === 'character' ? '新人物参考图已生成' : action === 'plan' ? '二创提示词已编写，可修改后生成视频' : 'Omni 二创视频已保存，可预览和下载' };
        return { ...current, job: completed, jobHistory: [...(current.jobHistory || []), completed].slice(-200) };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '二创任务失败。';
      update(id, current => {
        const failed: Job = { ...current.job!, status: 'failed', finishedAt: new Date().toISOString(), message };
        return { ...current, job: failed, jobHistory: [...(current.jobHistory || []), failed].slice(-200),
          remix: { ...current.remix!, videos: current.remix!.videos.map(item => item.id === video?.id ? { ...item, status: 'failed', error: message, finishedAt: failed.finishedAt } : item) } };
      });
      throw error;
    }
  })();
}
