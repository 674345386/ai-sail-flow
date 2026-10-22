import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { dataDir, uploadDir } from './store';

export const IMAGE_MODELS = ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'gpt-image-2'] as const;
export type ImageModel = typeof IMAGE_MODELS[number];
type Connection = { apiKey: string; baseUrl: string; model: ImageModel };
type ImageResult = { filename: string; url: string; mime: 'image/png' | 'image/jpeg' | 'image/webp'; generatedAt: string; model: ImageModel };
type Attempt = { key: string; status: 'submitting' | 'completed' | 'rejected' | 'unknown'; model: ImageModel; prompt: string; fingerprint?: string; requestId: string; result?: ImageResult; error?: string; references?: { filename: string; bytes: number }[] };
export type ImageReference = { data: Buffer; mime: 'image/png' | 'image/jpeg' | 'image/webp'; filename: string };
const connectionFile = path.join(dataDir, '.image-generation.json');
const attemptDir = path.join(dataDir, 'image-attempts');
fs.mkdirSync(attemptDir, { recursive: true, mode: 0o700 });
const defaultBaseUrl = 'https://api.qzftech.top/v1';
function savedConnection(): Partial<Connection> {
  try { return JSON.parse(fs.readFileSync(connectionFile, 'utf8')); } catch { return {}; }
}
const saved = savedConnection();
let session: Connection = {
  apiKey: saved.apiKey || process.env.SOP_IMAGE_API_KEY || '',
  baseUrl: saved.baseUrl || process.env.SOP_IMAGE_BASE_URL || defaultBaseUrl,
  model: IMAGE_MODELS.includes(saved.model as ImageModel) ? saved.model as ImageModel
    : IMAGE_MODELS.includes(process.env.SOP_IMAGE_MODEL as ImageModel) ? process.env.SOP_IMAGE_MODEL as ImageModel : IMAGE_MODELS[0],
};
export function imageGenerationStatus() { return { configured: !!session.apiKey, baseUrl: session.baseUrl, model: session.model, models: IMAGE_MODELS }; }
export function imageAttemptStatus(key: string): Attempt['status'] | undefined {
  if (!/^[a-f\d-]{36}$/.test(key)) return;
  try { return (JSON.parse(fs.readFileSync(attemptPath(key), 'utf8')) as Attempt).status; } catch { return; }
}
export function configureImageGeneration(input: { apiKey?: string; baseUrl?: string; model: ImageModel }) {
  const next = { apiKey: input.apiKey || session.apiKey, baseUrl: (input.baseUrl || session.baseUrl).replace(/\/+$/, ''), model: input.model };
  if (!next.apiKey) throw new Error('请填写图片生成 API Key。');
  const address = new URL(next.baseUrl);
  if (address.protocol !== 'https:' || address.username || address.password || address.search || address.hash || !address.hostname || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.hostname)) throw new Error('请输入有效的 HTTPS 图片接口地址。');
  const temporary = `${connectionFile}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(next), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, connectionFile);
  } catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  session = next;
}
function attemptPath(key: string) { return path.join(attemptDir, `${key}.json`); }
function saveAttempt(attempt: Attempt) {
  const dest = attemptPath(attempt.key);
  const temporary = `${dest}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, JSON.stringify(attempt), { mode: 0o600, flag: 'wx' }); fs.renameSync(temporary, dest); }
  catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
}
export async function generateImage(input: { idempotencyKey: string; prompt: string; aspectRatio?: string; prefix: string; model?: ImageModel; references?: ImageReference[] }): Promise<ImageResult> {
  if (!/^[a-f\d-]{36}$/.test(input.idempotencyKey) || !/^[a-z][a-z-]*$/.test(input.prefix)) throw new Error('图片任务标识无效。');
  if (!session.apiKey) throw new Error('请先连接图片生成服务。');
  const references = input.references || [];
  if (references.length > 16 || references.some(ref => !ref.data.length || ref.data.length > 20 * 1024 * 1024 || !/^[\w.-]{1,100}$/.test(ref.filename)) || references.reduce((sum, ref) => sum + ref.data.length, 0) > 50 * 1024 * 1024) throw new Error('参考图数量或大小超过图片接口限制。');
  const model = input.model || session.model;
  if (!IMAGE_MODELS.includes(model)) throw new Error('图片模型无效。');
  const fingerprint = createHash('sha256').update(JSON.stringify([model, input.prompt, input.aspectRatio, references.map(ref => [ref.filename, ref.mime, createHash('sha256').update(ref.data).digest('hex')])])).digest('hex');
  const existing = attemptPath(input.idempotencyKey);
  if (fs.existsSync(existing)) {
    const prior = JSON.parse(fs.readFileSync(existing, 'utf8')) as Attempt;
    if (prior.fingerprint ? prior.fingerprint !== fingerprint : prior.prompt !== input.prompt) throw new Error('同一图片任务不能使用不同请求参数。');
    if (prior.status === 'completed' && prior.result && fs.existsSync(path.join(uploadDir, prior.result.filename))) return prior.result;
    if (prior.status === 'rejected') throw new Error(prior.error || '图片接口拒绝了该任务。');
    throw new Error('该图片任务已提交，结果待核对；为避免重复生成和扣费，不会自动重发。');
  }
  const requestId = randomUUID();
  const attempt: Attempt = { key: input.idempotencyKey, status: 'submitting', model, prompt: input.prompt, fingerprint, requestId, references: references.map(ref => ({ filename: ref.filename, bytes: ref.data.length })) };
  // Reserve before submitting, including across multiple server processes.
  try { fs.writeFileSync(existing, JSON.stringify(attempt), { mode: 0o600, flag: 'wx' }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('该图片任务已提交，结果待核对；不会重复生成。');
    throw error;
  }
  let rejected = false;
  try {
    const size = input.aspectRatio === '16:9' ? '1536x1024' : ['9:16', '4:5'].includes(input.aspectRatio || '') ? '1024x1536' : '1024x1024';
    const form = new FormData();
    if (references.length) {
      form.set('model', model); form.set('prompt', input.prompt); form.set('n', '1'); form.set('size', size);
      form.set('quality', 'medium'); form.set('output_format', 'png');
      for (const reference of references) form.append('image[]', new Blob([new Uint8Array(reference.data)], { type: reference.mime }), reference.filename);
    }
    // 150 s per request. Never resend after a drop: the gateway may already be generating (and billing) it.
    const send = () => fetch(`${session.baseUrl}/images/${references.length ? 'edits' : 'generations'}`, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(150_000),
      headers: { Authorization: `Bearer ${session.apiKey}`, ...(references.length ? {} : { 'Content-Type': 'application/json' }), 'X-Client-Request-Id': requestId },
      body: references.length ? form : JSON.stringify({ model, prompt: input.prompt, n: 1, size, quality: 'medium', output_format: 'png' }),
    });
    type NetError = Error & { cause?: { code?: string; message?: string } };
    const reason = (error: NetError) => error.name === 'TimeoutError' ? '超过 150 秒' : error.cause?.code || error.cause?.message || error.message;
    const response = await send().catch((error: NetError) => { throw new Error(`图片接口连接失败（${reason(error)}）；任务结果待核对。`); });
    const body = await response.json();
    if (!response.ok) {
      rejected = [400, 401, 403, 404, 422, 429].includes(response.status);
      throw new Error(`图片接口 HTTP ${response.status}：${String(body?.error?.message || '请求未完成').slice(0, 300)}`);
    }
    const encoded = body?.data?.[0]?.b64_json, link = body?.data?.[0]?.url;
    let bytes: Buffer;
    if (typeof encoded === 'string' && encoded) bytes = Buffer.from(encoded, 'base64');
    else if (typeof link === 'string' && /^https:\/\//.test(link)) {
      // Some relays return a hosted URL instead of base64.
      const download = () => fetch(link, { signal: AbortSignal.timeout(120_000) });
      const retry = async () => { await new Promise(resolve => setTimeout(resolve, 2000)); return download(); };
      // Download drops lose an image already paid for, so retry it up to twice.
      const file = await download().catch(retry).catch(retry).catch((error: Error & { cause?: { code?: string; message?: string } }) => {
        throw new Error(`图片已生成但下载失败（${error.cause?.code || error.cause?.message || error.message}）；任务结果待核对。`);
      });
      if (!file.ok) throw new Error(`图片下载失败 HTTP ${file.status}；任务结果待核对。`);
      bytes = Buffer.from(await file.arrayBuffer());
    } else throw new Error('图片接口未返回图片数据；任务结果待核对。');
    if (bytes.length < 8 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('图片接口未返回有效 PNG；任务结果待核对。');
    const filename = `${input.prefix}-${randomUUID()}.png`;
    fs.writeFileSync(path.join(uploadDir, filename), bytes, { mode: 0o600, flag: 'wx' });
    const result: ImageResult = { filename, url: `/media/${filename}`, mime: 'image/png', generatedAt: new Date().toISOString(), model };
    saveAttempt({ ...attempt, status: 'completed', result });
    return result;
  } catch (error) {
    saveAttempt({ ...attempt, status: rejected ? 'rejected' : 'unknown', error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
