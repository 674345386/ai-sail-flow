import { unlink, writeFile } from 'node:fs/promises';
import { workspaceUploadPath } from './workspace-storage';
import { inspectMedia } from './media';
import { OMNI_FLASH_12, OMNI_FLASH_12_SECONDS } from '../shared/video-production';

const endpoint = 'https://gaorui.cc/v1/videos';
type Progress = (n: number, message: string) => void;
let sessionKey = '';
export function configureOmniKey(key: string) { sessionKey = key; }
function omniKey() { return sessionKey || process.env.SOP_OMNI_API_KEY || process.env.SOP_VEO_API_KEY || ''; }
export function omniConfigured() { return !!omniKey(); }

export type OmniVideoSettings = {
  resolution: '720p' | '1080p'; aspectRatio: '16:9' | '9:16';
  model?: typeof OMNI_FLASH_12; duration?: (typeof OMNI_FLASH_12_SECONDS)[number]; firstLastFrame?: boolean; sourceVideoUrl?: string;
};
function httpsReference(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
}
export function omniRequestBody(prompt: string, settings: OmniVideoSettings, referenceUrl?: string | string[]) {
  const references = typeof referenceUrl === 'string' ? [referenceUrl] : referenceUrl || [];
  if (!prompt.trim()) throw new Error('请填写视频提示词。');
  if (references.some(value => !httpsReference(value))) throw new Error('Omni 参考图需要公网 HTTPS 链接。');
  if (settings.model === OMNI_FLASH_12) {
    if (settings.resolution !== '720p') throw new Error('当前制作流程的 Omni Flash 1.2 固定使用 720p。');
    const base = { model: OMNI_FLASH_12, prompt, resolution: settings.resolution, ...(references.length ? { input_reference: references } : {}) };
    if (settings.sourceVideoUrl) {
      if (!httpsReference(settings.sourceVideoUrl) || settings.duration !== undefined || settings.firstLastFrame || references.length > 5) throw new Error('Omni 编辑需提供 HTTPS 源视频，最多 5 张参考图，且不可指定时长或首尾帧。');
      return { ...base, source_video_url: settings.sourceVideoUrl };
    }
    const seconds = settings.duration ?? 10;
    if (!OMNI_FLASH_12_SECONDS.includes(seconds) || !['16:9', '9:16'].includes(settings.aspectRatio)) throw new Error('Omni Flash 1.2 生成支持 8、10、12、15 秒及 16:9 或 9:16。');
    if (settings.firstLastFrame ? references.length < 1 || references.length > 2 || references.length === 2 && seconds > 10 : references.length > 7) throw new Error('首帧需要 1 张图，首尾帧需要 2 张图且最长 10 秒；普通参考图最多 7 张。');
    return { ...base, seconds, aspect_ratio: settings.aspectRatio, ...(settings.firstLastFrame ? { first_last_frame: true } : {}) };
  }
  if (settings.sourceVideoUrl) throw new Error('请使用 Omni Flash 1.2 编辑视频。');
  if (!['720p', '1080p'].includes(settings.resolution) || !['16:9', '9:16'].includes(settings.aspectRatio) || ![8, 10].includes(settings.duration ?? 10)) throw new Error('Omni 视频参数无效。');
  if (references.length > (settings.firstLastFrame ? 2 : 7) || (settings.firstLastFrame && references.length !== 2)) throw new Error('参考图最多 7 张；首尾帧模式必须按顺序提供首帧、尾帧各一张。');
  return {
    model: settings.duration === 8 ? 'omni_flash_8s' as const : 'omni_flash_10s' as const, prompt, resolution: settings.resolution, aspect_ratio: settings.aspectRatio,
    ...(references.length ? { input_reference: references } : {}), first_last_frame: settings.firstLastFrame ?? false,
  };
}
async function submitOmni(prompt: string, settings: OmniVideoSettings, referenceUrl?: string | string[]) {
  const result = await providerRequest(endpoint, omniRequestBody(prompt, settings, referenceUrl));
  if (typeof result?.id !== 'string' || !result.id.trim()) throw new Error('Omni 未返回任务 ID，请核对服务记录后再提交。');
  return result.id as string;
}
export async function waitOmni(requestId: string, progress: Progress) {
  const deadline = Date.now() + 20 * 60_000;
  while (Date.now() < deadline) {
    const result = await providerRequest(`${endpoint}/${encodeURIComponent(requestId)}`);
    const state = String(result.status || '').toLowerCase();
    if (['failed', 'error', 'cancelled', 'canceled', 'rejected', 'expired'].includes(state)) {
      throw new Error(`Omni 生成失败：${String(result.error?.message || result.failure_reason || result.message || state).replace(/(?:sk-|vc)[A-Za-z0-9_-]{12,}/gi, '[REDACTED]').slice(0, 800)}`);
    }
    if (['completed', 'succeeded', 'success', 'done'].includes(state)) {
      const url = [result.url, result.video_url, result.output_url, result.metadata?.video_url, result.metadata?.url, result.output?.url, result.result?.video_url]
        .find(value => typeof value === 'string' && value.startsWith('https://'));
      if (!url) throw new Error('Omni 已完成，但未返回下载地址；可恢复查询此任务。');
      return url as string;
    }
    progress(['queued', 'pending', 'unknown', ''].includes(state) ? 30 : 55, ['queued', 'pending', 'unknown', ''].includes(state) ? 'Omni 已排队，正在等待生成…' : 'Omni 正在生成视频…');
    await new Promise(resolve => setTimeout(resolve, 10_000));
  }
  throw new Error('Omni 等待超时，任务 ID 已保存；请恢复查询，避免重复提交。');
}
export async function generateOmniVideo(prompt: string, settings: OmniVideoSettings, referenceUrl: string | string[] | undefined, progress: Progress, submitted: (id: string) => void) {
  if (!omniConfigured()) throw new Error('请先配置视频服务 API Key。');
  progress(15, '正在提交 Omni Flash 视频任务…');
  const id = await submitOmni(prompt, settings, referenceUrl);
  submitted(id);
  return { id, url: await waitOmni(id, progress) };
}

function publicHttps(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password &&
      host !== 'localhost' && !host.endsWith('.localhost') && !host.endsWith('.local') && !host.endsWith('.internal') &&
      !/^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host) && !host.includes(':');
  } catch { return false; }
}
function detail(payload: any) {
  return String(payload?.error?.message || payload?.failure_reason || payload?.message || payload?.error?.code || '')
    .replace(/(?:sk-|vc)[A-Za-z0-9_-]{12,}/gi, '[REDACTED]').replace(/\s+/g, ' ').slice(0, 220);
}
function providerError(status: number, payload: unknown) {
  const info = detail(payload);
  const hint = status === 401 || status === 403 ? 'API Key 无效或无权限' : status === 402 ? '余额不足' : status === 429 ? '请求过于频繁' : '请求失败';
  return new Error(`Omni ${hint}（HTTP ${status}）${info ? `：${info}` : ''}`);
}
async function providerRequest(url: string, body?: object) {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET', redirect: 'manual',
    headers: { Authorization: `Bearer ${omniKey()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError(response.status, payload);
  return payload;
}

export async function saveOmniVideo(url: string, id: string, requestId: string, progress: Progress) {
  if (!publicHttps(url)) throw new Error('生成结果必须是公网 HTTPS 视频直链。');
  progress(75, '正在保存 Omni Flash 成片到本机…');
  let response: Response;
  for (let redirect = 0; ; redirect++) {
    response = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://gaorui.cc/' }, signal: AbortSignal.timeout(120_000) });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    if (!location || redirect >= 3) throw new Error('生成视频下载重定向过多。');
    url = new URL(location, url).toString();
    if (!publicHttps(url)) throw new Error('生成视频下载地址重定向到非公网 HTTPS 地址，已拒绝。');
  }
  if (!response.ok) {
    response = await fetch(`${endpoint}/${encodeURIComponent(requestId)}/content`, {
      headers: { Authorization: `Bearer ${omniKey()}` }, redirect: 'error', signal: AbortSignal.timeout(120_000),
    });
  }
  if (!response.ok) throw new Error(`无法下载生成结果（HTTP ${response.status}）。`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 200 * 1024 * 1024) throw new Error('生成视频超过 200 MB，未保存到本机。');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 200 * 1024 * 1024) throw new Error('生成视频超过 200 MB，未保存到本机。');
  const filename = `omni-${id}.mp4`;
  const file = workspaceUploadPath(filename);
  await writeFile(file, buffer, { mode: 0o600 });
  try {
    const metadata = await inspectMedia(filename, 'video');
    return { filename, url: `/media/${filename}`, size: buffer.length, ...metadata };
  } catch (error) {
    await unlink(file).catch(() => {});
    throw error;
  }
}
