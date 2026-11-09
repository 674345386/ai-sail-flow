import type { GeneratedVideo } from '../../shared/domain';

export type VideoReferenceMedia = { id: string; artifactId?: string; title: string; url?: string; filename?: string; role?: string };
export type VideoDetailsLoader = (id: string, signal: AbortSignal) => Promise<GeneratedVideo>;

export function videoModelLabel(model: string) {
  return ({ 'h3-video': 'H3 Video', 'h3-video-flex': 'H3 Video Flex', 'h3-video-frames': 'H3 Video Frames', omni_flash_8s: 'Omni Flash 8s', omni_flash_10s: 'Omni Flash 10s' } as Record<string, string>)[model] || model;
}

function elapsedLabel(milliseconds: number | undefined) {
  if (milliseconds === undefined || !Number.isFinite(milliseconds) || milliseconds < 0) return '未记录';
  const seconds = Math.round(milliseconds / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒` : `${seconds} 秒`;
}

export function videoGenerationFields(video: GeneratedVideo) {
  const request = video.minimax?.request;
  const details = video.minimax?.details;
  const running = video.status === 'running';
  const waiting = running ? '等待服务端返回' : '服务端未提供';
  const flag = (value: boolean | undefined) => value === undefined ? '未记录' : value ? '开启' : '关闭';
  const timestamp = details?.createdAt || video.startedAt;
  const created = Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '未记录';
  const localTime = video.finishedAt ? Date.parse(video.finishedAt) - Date.parse(video.startedAt) : undefined;
  return [
    { label: '模型', value: videoModelLabel(video.model) },
    { label: '创建时间', value: created },
    { label: '消耗积分', value: running ? (video.minimax?.credits?.held ? `预留 ${video.minimax.credits.held}` : '待结算') : video.minimax?.credits?.charged ?? (video.minimax?.credits?.held ? `预留 ${video.minimax.credits.held}` : '服务端未提供') },
    { label: '分辨率', value: request?.parameters.resolution || video.resolution || '未记录' },
    { label: '视频时长', value: `${request?.parameters.duration ?? video.duration} 秒` },
    { label: '画幅比例', value: request?.parameters.aspect_ratio || video.aspectRatio },
    { label: '输出数量', value: details?.outputCount?.toString() || (video.provider === 'omni-flash' ? '1' : running ? waiting : '未记录') },
    { label: '生成音频', value: flag(details?.generateAudio ?? request?.parameters.generate_audio ?? video.minimax?.generateAudio) },
    { label: '静音参考视频', value: details?.muteReferenceVideo === undefined && running ? waiting : flag(details?.muteReferenceVideo) },
    { label: '提示词优化', value: flag(details?.optimizePrompt ?? request?.optimize_prompt ?? video.minimax?.optimizePrompt) },
    { label: '模型运行耗时', value: details?.modelRunMs === undefined ? (running ? '生成中' : waiting) : elapsedLabel(details.modelRunMs) },
    { label: details?.totalTimeMs === undefined ? '总耗时（含本地保存）' : '总耗时', value: running && details?.totalTimeMs === undefined ? '生成中' : elapsedLabel(details?.totalTimeMs ?? localTime) },
  ];
}

export function recreateVideoDraft(video: GeneratedVideo) {
  const request = video.minimax?.request;
  const parameters: Record<string, unknown> = { model: video.model, duration: request?.parameters.duration ?? video.duration, resolution: request?.parameters.resolution || video.resolution, aspectRatio: request?.parameters.aspect_ratio || video.aspectRatio };
  if (request) { parameters.generateAudio = request.parameters.generate_audio; parameters.optimizePrompt = request.optimize_prompt; }
  if (video.model === 'h3-video-frames' || video.providerRequest?.first_last_frame) {
    (video.referenceIds || []).forEach((id, index) => {
      const role = request?.inputs[index]?.role || (index === 0 ? 'first_frame' : 'last_frame');
      parameters[role === 'last_frame' ? 'lastFrameId' : 'firstFrameId'] = id;
    });
  } else parameters.referenceIds = video.referenceIds || (video.storyboardGridId ? [video.storyboardGridId] : []);
  return `请基于视频产物 ${video.id} 再创作一个新版本。先读取当前创意，沿用以下实际提示词、参数和参考图；这次是新版本，不是恢复旧任务。\n\n生成参数：\n${JSON.stringify(parameters, null, 2)}\n\n完整提示词：\n${request?.prompt || video.providerRequest?.prompt || video.prompt}`;
}
