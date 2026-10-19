import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { dataDir, uploadDir } from './store';

export const IMAGE_MODELS = ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'gpt-image-2'] as const;
export type ImageModel = typeof IMAGE_MODELS[number];
type Connection = { apiKey: string; baseUrl: string; model: ImageModel };
type ImageResult = { filename: string; url: string; mime: 'image/png' | 'image/jpeg' | 'image/webp'; generatedAt: string; model: ImageModel };
type Attempt = { key: string; status: 'submitting' | 'completed' | 'unknown'; model: ImageModel; prompt: string; requestId: string; result?: ImageResult; error?: string };
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
export async function generateImage(input: { idempotencyKey: string; prompt: string; aspectRatio?: string; prefix: string }): Promise<ImageResult> {
  if (!/^[a-f\d-]{36}$/.test(input.idempotencyKey) || !/^[a-z][a-z-]*$/.test(input.prefix)) throw new Error('图片任务标识无效。');
  if (!session.apiKey) throw new Error('请先连接图片生成服务。');
  const existing = attemptPath(input.idempotencyKey);
  if (fs.existsSync(existing)) {
    const prior = JSON.parse(fs.readFileSync(existing, 'utf8')) as Attempt;
    if (prior.prompt !== input.prompt) throw new Error('同一图片任务不能使用不同提示词。');
    if (prior.status === 'completed' && prior.result && fs.existsSync(path.join(uploadDir, prior.result.filename))) return prior.result;
    throw new Error('该图片任务已提交，结果待核对；为避免重复生成和扣费，不会自动重发。');
  }
  const model = session.model;
  const requestId = randomUUID();
  const attempt: Attempt = { key: input.idempotencyKey, status: 'submitting', model, prompt: input.prompt, requestId };
  // Reserve before submitting, including across multiple server processes.
  try { fs.writeFileSync(existing, JSON.stringify(attempt), { mode: 0o600, flag: 'wx' }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('该图片任务已提交，结果待核对；不会重复生成。');
    throw error;
  }
  try {
    const size = input.aspectRatio === '16:9' ? '1536x1024' : input.aspectRatio === '9:16' ? '1024x1536' : '1024x1024';
    const response = await fetch(`${session.baseUrl}/images/generations`, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(600_000),
      headers: { Authorization: `Bearer ${session.apiKey}`, 'Content-Type': 'application/json', 'X-Client-Request-Id': requestId },
      body: JSON.stringify({ model, prompt: input.prompt, n: 1, size, quality: 'medium', output_format: 'png' }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`图片接口 HTTP ${response.status}：${String(body?.error?.message || '请求未完成').slice(0, 300)}`);
    const encoded = body?.data?.[0]?.b64_json;
    if (typeof encoded !== 'string' || !encoded) throw new Error('图片接口未返回图片数据；任务结果待核对。');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length < 8 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('图片接口未返回有效 PNG；任务结果待核对。');
    const filename = `${input.prefix}-${randomUUID()}.png`;
    fs.writeFileSync(path.join(uploadDir, filename), bytes, { mode: 0o600, flag: 'wx' });
    const result: ImageResult = { filename, url: `/media/${filename}`, mime: 'image/png', generatedAt: new Date().toISOString(), model };
    saveAttempt({ ...attempt, status: 'completed', result });
    return result;
  } catch (error) {
    saveAttempt({ ...attempt, status: 'unknown', error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
