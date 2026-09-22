import path from 'node:path';
import { unlink, writeFile } from 'node:fs/promises';
import { z } from 'zod';
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
const imageUrl = z.string().trim().url().max(2000).refine(publicHttps, '图片必须是公网可访问的 HTTPS 直链');
const common = { unitId: z.string().trim().regex(/^veo-unit-\d{2,}$/).max(80), resolution: z.enum(['720p', '1080p', 'lite']).default('720p'), aspectRatio: z.enum(['16:9', '9:16']).default('9:16') };
export const generationInputSchema = z.discriminatedUnion('mode', [
  z.object({ ...common, mode: z.literal('t2v') }).strict(),
  z.object({ ...common, mode: z.literal('i2v'), images: z.array(imageUrl).min(1).max(2) }).strict(),
  z.object({ ...common, mode: z.literal('r2v'), images: z.array(imageUrl).min(1) }).strict(),
]);
export type GenerationInput = z.infer<typeof generationInputSchema>;
type Progress = (progress: number, message: string) => void;
let sessionKey = '';
export function configureGenerationKey(key: string) { sessionKey = key; }
function generationKey() { return sessionKey || process.env.SOP_VEO_API_KEY || ''; }
export function generationConfigured() { return Boolean(generationKey()); }

export function requestBody(input: GenerationInput, prompt: string) {
  const base = { model: VEO_MODELS[input.mode], prompt, resolution: input.resolution, aspect_ratio: input.aspectRatio };
  return input.mode === 't2v' ? base : { ...base, images: input.images };
}
function detail(payload: any) {
  return String(payload?.error?.message || payload?.failure_reason || payload?.message || payload?.error?.code || '')
    .replace(/(?:sk-|vc)[A-Za-z0-9_-]{12,}/gi, '[REDACTED]').replace(/\s+/g, ' ').slice(0, 220);
}
function providerError(status: number, payload: unknown) {
  const info = detail(payload);
  const hint = status === 401 || status === 403 ? 'API Key 无效或无权限' : status === 402 ? '余额不足' : status === 429 ? '请求过于频繁' : '请求失败';
  return new Error(`Veo 3.1 ${hint}（HTTP ${status}）${info ? `：${info}` : ''}`);
}
async function providerRequest(url: string, key: string, body?: object) {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET', redirect: 'manual',
    headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError(response.status, payload);
  return payload;
}
function completedUrl(payload: any): string {
  const candidates = [payload?.video_url, payload?.url, payload?.download_url, payload?.output_url, payload?.output, payload?.content,
    payload?.video?.url, payload?.output?.url, payload?.output?.video_url, payload?.result?.url,
    payload?.result?.video_url, payload?.data?.url, payload?.data?.video_url,
    payload?.output?.[0]?.url, payload?.output?.[0], payload?.data?.[0]?.url, payload?.result?.[0]?.url,
    payload?.content?.[0]?.url];
  return candidates.find(value => typeof value === 'string' && /^https:\/\//i.test(value)) || '';
}
async function pollVideo(id: string, key: string, progress: Progress) {
  const deadline = Date.now() + 20 * 60_000;
  let lastStatus = '';
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const result = await providerRequest(`${endpoint}/${encodeURIComponent(id)}`, key);
    const state = String(result?.status || '').toLowerCase();
    if (state === 'completed') {
      const url = completedUrl(result);
      if (!url) throw new Error('Veo 3.1 任务已完成，但查询响应未提供可下载的视频直链。');
      return { id, url };
    }
    if (state === 'failed' || state === 'canceled' || state === 'cancelled') throw new Error(`Veo 3.1 生成失败${detail(result) ? `：${detail(result)}` : ''}`);
    if (!['queued', 'processing', 'in_progress', 'pending'].includes(state)) throw new Error(`Veo 3.1 返回未知任务状态：${state || '空'}`);
    if (state !== lastStatus) progress(state === 'queued' || state === 'pending' ? 35 : 55, state === 'queued' || state === 'pending' ? 'Veo 3.1 排队中…' : 'Veo 3.1 正在生成视频…');
    lastStatus = state;
  }
  throw new Error(`Veo 3.1 任务超过 20 分钟仍未完成。上游任务 ID：${id}`);
}
export async function generateVideo(input: GenerationInput, prompt: string, progress: Progress, submitted: (id: string) => void) {
  const key = generationKey();
  if (!key) throw new Error('请先配置 Veo 3.1 API Key。');
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

export async function saveGeneratedVideo(url: string, id: string, progress: Progress) {
  if (!publicHttps(url)) throw new Error('生成结果必须是公网 HTTPS 视频直链。');
  progress(75, '正在保存 Veo 3.1 成片到本机…');
  let response: Response;
  for (let redirect = 0; ; redirect++) {
    response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(120_000) });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    if (!location || redirect >= 3) throw new Error('生成视频下载重定向过多。');
    url = new URL(location, url).toString();
    if (!publicHttps(url)) throw new Error('生成视频下载地址重定向到非公网 HTTPS 地址，已拒绝。');
  }
  if (!response.ok) throw new Error(`无法下载生成结果（HTTP ${response.status}）。`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 200 * 1024 * 1024) throw new Error('生成视频超过 200 MB，未保存到本机。');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 200 * 1024 * 1024) throw new Error('生成视频超过 200 MB，未保存到本机。');
  const filename = `veo-${id}.mp4`;
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
