import path from 'node:path';
import { unlink, writeFile } from 'node:fs/promises';
import { uploadDir } from './store';
import { inspectMedia } from './media';

const endpoint = 'https://gaorui.cc/v1/videos';
export const VEO_DURATION = 8;
export const VEO_MODELS = { t2v: 'veo_3_1', i2v: 'veo_3_1-fl', r2v: 'veo_3_1-components' } as const;
function publicHttps(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password &&
      host !== 'localhost' && !host.endsWith('.localhost') && !host.endsWith('.local') && !host.endsWith('.internal') &&
      !/^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host) && !host.includes(':');
  } catch { return false; }
}
export type GenerationInput = {
  unitId: string;
  prompt: string;
  mode: 't2v' | 'i2v' | 'r2v';
  resolution: '720p' | '1080p' | 'lite';
  aspectRatio: '16:9' | '9:16';
  images: string[];
  keyframeShotId?: string;
  tierShotId?: string;
  tierShotIds?: string[];
  previewRevision?: number;
  referenceImages?: string[];
};
type Progress = (progress: number, message: string) => void;
let sessionKey = '';
export function configureGenerationKey(key: string) { sessionKey = key; }
export function generationKey() { return sessionKey || process.env.SOP_VEO_API_KEY || ''; }
export function generationConfigured() { return Boolean(generationKey()); }

export function requestBody(input: GenerationInput, prompt: string) {
  const base = { model: VEO_MODELS[input.mode], prompt, resolution: input.resolution, aspect_ratio: input.aspectRatio };
  return input.mode === 't2v' ? base : { ...base, images: input.images };
}
function detail(payload: any) {
  return String(payload?.error?.message || payload?.failure_reason || payload?.message || payload?.error?.code || '')
    .replace(/(?:sk-|vc)[A-Za-z0-9_-]{12,}/gi, '[REDACTED]').replace(/\s+/g, ' ').slice(0, 220);
}
function providerError(status: number, payload: unknown, label = 'Veo 3.1') {
  const info = detail(payload);
  const hint = status === 401 || status === 403 ? 'API Key 无效或无权限' : status === 402 ? '余额不足' : status === 429 ? '请求过于频繁' : '请求失败';
  return new Error(`${label} ${hint}（HTTP ${status}）${info ? `：${info}` : ''}`);
}
export async function providerRequest(url: string, key: string, body?: object, label?: string) {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET', redirect: 'manual',
    headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError(response.status, payload, label);
  return payload;
}
function completedUrl(payload: any): string {
  const candidates = [payload?.video_url, payload?.url, payload?.download_url, payload?.output_url, payload?.output, payload?.content,
    payload?.video?.url, payload?.output?.url, payload?.output?.video_url, payload?.result?.url,
    payload?.result?.video_url, payload?.data?.url, payload?.data?.video_url,
    payload?.output?.[0]?.url, payload?.output?.[0], payload?.data?.[0]?.url, payload?.result?.[0]?.url,
    payload?.content?.[0]?.url, payload?.metadata?.video_url, payload?.metadata?.url];
  return candidates.find(value => typeof value === 'string' && /^https:\/\//i.test(value)) || '';
}
async function pollVideo(id: string, key: string, progress: Progress) {
  const deadline = Date.now() + 20 * 60_000;
  let lastStatus = '';
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const result = await providerRequest(`${endpoint}/${encodeURIComponent(id)}`, key);
    const state = String(result?.status || '').toLowerCase();
    if (['completed', 'succeeded', 'success', 'done'].includes(state)) {
      const url = completedUrl(result);
      if (!url) throw new Error('Veo 3.1 任务已完成，但查询响应未提供可下载的视频直链。');
      return { id, url };
    }
    if (['failed', 'failure', 'error', 'canceled', 'cancelled', 'rejected', 'expired'].includes(state)) throw new Error(`Veo 3.1 生成失败${detail(result) ? `：${detail(result)}` : ''}`);
    // gaorui can briefly expose a just-submitted task as "unknown" before its
    // worker assigns a concrete state. Keep polling instead of discarding a
    // billable request that may still complete.
    const waiting = ['queued', 'processing', 'in_progress', 'pending', 'submitted', 'creating', 'running', 'generating', 'unknown', ''];
    if (!waiting.includes(state)) throw new Error(`Veo 3.1 返回无法识别的任务状态：${state}`);
    if (state !== lastStatus) {
      const queued = ['queued', 'pending', 'submitted', 'creating', 'unknown', ''].includes(state);
      progress(queued ? 35 : 55, queued ? 'Veo 3.1 正在确认任务状态…' : 'Veo 3.1 正在生成视频…');
    }
    lastStatus = state;
  }
  throw new Error(`Veo 3.1 任务超过 20 分钟仍未完成。上游任务 ID：${id}`);
}
export async function generateVideo(input: GenerationInput, prompt: string, progress: Progress, submitted: (id: string) => void) {
  const key = generationKey();
  if (!key) throw new Error('请先配置 Veo 3.1 API Key。');
  if (!prompt.trim()) throw new Error('视频生成描述不能为空。');
  if (input.mode !== 't2v' && (!input.images.length || input.images.some(image => !publicHttps(image)))) throw new Error('图生视频需要有效的公网 HTTPS 图片链接，请检查关键帧存储连接。');
  if (input.mode === 'i2v' && input.images.length > 2 || input.mode === 'r2v' && input.images.length > 3) throw new Error('图片数量超出当前视频模型的限制。');
  progress(15, '正在提交 Veo 3.1 任务…');
  const created = await providerRequest(endpoint, key, requestBody(input, prompt));
  const id = created?.id;
  if (typeof id !== 'string' || !id.trim()) throw new Error('Veo 3.1 未返回任务 ID。');
  submitted(id);
  progress(30, 'Veo 3.1 已排队，正在等待成片…');
  return pollVideo(id, key, progress);
}
export async function resumeVideo(id: string, progress: Progress) {
  const key = generationKey();
  if (!key) throw new Error('请先配置 Veo 3.1 API Key。');
  progress(30, '正在查询已提交的 Veo 3.1 任务，不会重新计费生成…');
  return pollVideo(id, key, progress);
}

export async function saveGeneratedVideo(url: string, id: string, progress: Progress, options?: { prefix: string; requestId?: string }) {
  if (!publicHttps(url)) throw new Error('生成结果必须是公网 HTTPS 视频直链。');
  progress(75, '正在保存 Veo 3.1 成片到本机…');
  let response: Response;
  for (let redirect = 0; ; redirect++) {
    response = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://gaorui.cc/' }, signal: AbortSignal.timeout(120_000) });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    if (!location || redirect >= 3) throw new Error('生成视频下载重定向过多。');
    url = new URL(location, url).toString();
    if (!publicHttps(url)) throw new Error('生成视频下载地址重定向到非公网 HTTPS 地址，已拒绝。');
  }
  if (!response.ok && options?.requestId) {
    response = await fetch(`${endpoint}/${encodeURIComponent(options.requestId)}/content`, {
      headers: { Authorization: `Bearer ${generationKey()}` }, redirect: 'error', signal: AbortSignal.timeout(120_000),
    });
  }
  if (!response.ok) throw new Error(`无法下载生成结果（HTTP ${response.status}）。`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 200 * 1024 * 1024) throw new Error('生成视频超过 200 MB，未保存到本机。');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 200 * 1024 * 1024) throw new Error('生成视频超过 200 MB，未保存到本机。');
  const filename = `${options?.prefix || 'veo'}-${id}.mp4`;
  const file = path.join(uploadDir, filename);
  await writeFile(file, buffer, { mode: 0o600 });
  try {
    const metadata = await inspectMedia(filename, 'video');
    return { filename, url: `/media/${filename}`, size: buffer.length, ...metadata };
  } catch (error) {
    await unlink(file).catch(() => {});
    throw error;
  }
}
