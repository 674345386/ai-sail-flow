import { generationKey, providerRequest } from './veo';
import { REMIX_MODEL, type RemixSettings } from '../shared/remix';

const endpoint = 'https://gaorui.cc/v1/videos';
type Progress = (n: number, message: string) => void;
export async function submitOmni(prompt: string, settings: RemixSettings, referenceUrl: string) {
  // The gateway requires input_reference for this model. images is a Veo field.
  const result = await providerRequest(endpoint, generationKey(), {
    model: REMIX_MODEL, prompt, resolution: settings.resolution, aspect_ratio: settings.aspectRatio,
    input_reference: [referenceUrl], first_last_frame: false,
  }, 'Omni');
  if (typeof result?.id !== 'string' || !result.id.trim()) throw new Error('Omni 未返回任务 ID，请核对服务记录后再提交。');
  return result.id as string;
}
export async function waitOmni(requestId: string, progress: Progress) {
  const deadline = Date.now() + 20 * 60_000;
  while (Date.now() < deadline) {
    const result = await providerRequest(`${endpoint}/${encodeURIComponent(requestId)}`, generationKey(), undefined, 'Omni');
    const state = String(result.status || '').toLowerCase();
    if (['failed', 'error', 'cancelled', 'canceled', 'rejected', 'expired'].includes(state)) {
      throw new Error(`Omni 生成失败：${String(result.error?.message || result.failure_reason || result.message || state).replace(/(?:sk-|vc)[A-Za-z0-9_-]{12,}/gi, '[REDACTED]').slice(0, 800)}`);
    }
    if (['completed', 'succeeded', 'success', 'done'].includes(state)) {
      const url = [result.video_url, result.output_url, result.url, result.metadata?.video_url, result.metadata?.url, result.output?.url, result.result?.video_url]
        .find(value => typeof value === 'string' && value.startsWith('https://'));
      if (!url) throw new Error('Omni 已完成，但未返回下载地址；可恢复查询此任务。');
      return url as string;
    }
    progress(['queued', 'pending', 'unknown', ''].includes(state) ? 30 : 55, ['queued', 'pending', 'unknown', ''].includes(state) ? 'Omni 已排队，正在等待生成…' : 'Omni 正在生成10秒二创视频…');
    await new Promise(resolve => setTimeout(resolve, 10_000));
  }
  throw new Error('Omni 等待超时，任务 ID 已保存；请恢复查询，避免重复提交。');
}
