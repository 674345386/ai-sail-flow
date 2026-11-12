import { createHash } from 'node:crypto';
import { open, unlink } from 'node:fs/promises';
import type { MinimaxGenerationRequest } from '../shared/minimax-video';

export class MinimaxError extends Error { constructor(public status: number, message: string) { super(message); } }
export class MinimaxTaskError extends MinimaxError {
  constructor(public taskStatus: 'failed' | 'cancelled', message: string) { super(502, message); }
}
type Progress = (progress: number, message: string, task?: MinimaxTask) => void;
export type MinimaxOutput = { asset_id: string; media_type: string; download_url: string; byte_length?: number | string; download_expires_at?: string };
export type MinimaxTask = {
  id: string; status: string; outputs?: MinimaxOutput[]; optimized_prompt?: string | null;
  created_at?: string; completed_at?: string; model_run_ms?: number; total_time_ms?: number; optimize_prompt?: boolean;
  parameters?: { output_count?: number; generate_audio?: boolean; mute_reference_video?: boolean };
  results?: { requested?: number; succeeded?: number; failed?: number };
  error?: { code?: string; message?: string } | null; credits?: { held: string; charged: string };
};
function publicUrl(value: string) {
  const url = new URL(value), host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || host === 'localhost' || /\.(?:local|localhost|internal)$/.test(host) || host.includes(':') || /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)) throw new MinimaxError(502, 'MiniMax 媒体地址必须为公网 HTTPS。');
  return url;
}
export function minimaxStatus() {
  return { provider: 'minimax-h3' as const, configured: Boolean(process.env.SOP_MINIMAX_API_KEY), endpoint: process.env.SOP_MINIMAX_BASE_URL || 'https://hi.hi.run/api/open/v1' };
}

/** Provider-only client: no creative, UI, storage configuration or Omni/Veo dependency. */
export class MinimaxH3Client {
  private base: string;
  constructor(private key = process.env.SOP_MINIMAX_API_KEY || '', base = minimaxStatus().endpoint) {
    this.base = base.replace(/\/+$/, '');
    publicUrl(this.base);
  }
  private detail(value: unknown) {
    let message = String(value || '').replace(/sc_(?:live|test)_[A-Za-z0-9_-]+/g, '[REDACTED]');
    if (this.key) message = message.split(this.key).join('[REDACTED]');
    return message.slice(0, 800);
  }
  private async request<T>(route: string, body?: object, idempotencyKey?: string): Promise<T> {
    if (!this.key) throw new MinimaxError(503, '请配置服务端 SOP_MINIMAX_API_KEY。');
    const response = await fetch(`${this.base}${route}`, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${this.key}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new MinimaxError(response.status, `MiniMax 请求失败（HTTP ${response.status}）：${this.detail(result?.error?.message || result?.error?.code || response.statusText)}`);
    if (!result) throw new MinimaxError(502, 'MiniMax 未返回有效 JSON；请恢复已有请求，避免重复提交。');
    return result as T;
  }
  listModels() { return this.request<{ data: { id: string; parameters: Record<string, unknown>; parameter_constraints: unknown[] }[] }>('/models'); }
  async uploadReference(filename: string, mime: string, bytes: Buffer) {
    const result = await this.request<{ asset_id: string; reused?: boolean; state?: string; upload?: { url: string; headers: Record<string, string>; method: string } }>('/uploads', {
      filename, content_type: mime, byte_length: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    if (!result.asset_id) throw new MinimaxError(502, 'MiniMax 上传未返回素材 ID。');
    if (result.reused && result.state === 'READY') return result.asset_id;
    if (!result.upload || result.upload.method !== 'PUT') throw new MinimaxError(502, 'MiniMax 未返回有效上传地址。');
    publicUrl(result.upload.url);
    // Signed storage headers are used verbatim; the API key is never added here.
    const response = await fetch(result.upload.url, { method: 'PUT', headers: result.upload.headers, body: new Uint8Array(bytes), redirect: 'error', signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new MinimaxError(502, `MiniMax 素材上传失败（HTTP ${response.status}）。`);
    await this.request(`/uploads/${encodeURIComponent(result.asset_id)}/complete`, {});
    return result.asset_id;
  }
  async submit(body: MinimaxGenerationRequest, idempotencyKey: string) {
    const task = await this.request<MinimaxTask>('/generations', body, idempotencyKey);
    if (!task.id) throw new MinimaxError(502, 'MiniMax 未返回任务 ID；请用已保存的幂等键恢复请求。');
    return task;
  }
  query(id: string) { return this.request<MinimaxTask>(`/generations/${encodeURIComponent(id)}`); }
  async wait(id: string, progress: Progress): Promise<MinimaxTask> {
    const started = Date.now();
    while (Date.now() - started < 30 * 60_000) {
      let task: MinimaxTask;
      try { task = await this.query(id); }
      catch (error) {
        if (error instanceof MinimaxError && error.status !== 429 && error.status < 500) throw error;
        progress(35, 'MiniMax 查询暂时不可用，稍后继续查询已有任务…');
        await new Promise(resolve => setTimeout(resolve, 15_000));
        continue;
      }
      if (task.status === 'succeeded') return task;
      if (task.status === 'failed' || task.status === 'cancelled') throw new MinimaxTaskError(task.status, `MiniMax 任务${task.status === 'cancelled' ? '已取消' : '失败'}：${this.detail(task.error?.message || task.error?.code || task.status)}`);
      progress(task.status === 'queued' ? 30 : 55, `MiniMax H3 ${task.status === 'queued' ? '已排队' : '正在生成视频'}…`, task);
      await new Promise(resolve => setTimeout(resolve, Date.now() - started < 60_000 ? 5000 : 15_000));
    }
    throw new MinimaxError(504, 'MiniMax 等待超时，任务 ID 已保存；请用 recover_video 继续查询，避免重复生成。');
  }
  async download(output: MinimaxOutput, destination: string) {
    let url = publicUrl(output.download_url).href;
    let response: Response;
    for (let redirects = 0; ; redirects++) {
      response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(120_000) });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      if (!location || redirects >= 3) throw new MinimaxError(502, 'MiniMax 下载重定向无效。');
      url = publicUrl(new URL(location, url).href).href;
    }
    if (!response.ok || !response.body) throw new MinimaxError(502, `MiniMax 结果下载失败（HTTP ${response.status}），可恢复查询以刷新链接。`);
    // The native API serializes byte_length as a decimal string (database bigint).
    // Normalize it before comparing with the numeric count of downloaded bytes.
    const declaredLength = output.byte_length ?? response.headers.get('content-length');
    const expected = declaredLength == null ? undefined : Number(declaredLength), limit = 512 * 1024 * 1024;
    if (expected !== undefined && (!Number.isSafeInteger(expected) || expected <= 0)) throw new MinimaxError(502, 'MiniMax 返回了无效的视频文件大小。');
    if (expected !== undefined && expected > limit) throw new MinimaxError(502, 'MiniMax 视频超过 512 MiB 保存上限。');
    const file = await open(destination, 'w', 0o600);
    let size = 0;
    try {
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > limit) throw new MinimaxError(502, 'MiniMax 视频超过 512 MiB 保存上限。');
        await file.writeFile(chunk);
      }
      if (!size || expected !== undefined && size !== expected) throw new MinimaxError(502, `MiniMax 视频下载不完整（预期 ${expected ?? '未知'} 字节，实际 ${size} 字节），请恢复查询后重试下载。`);
    } catch (error) { await file.close(); await unlink(destination).catch(() => {}); throw error; }
    await file.close();
    return size;
  }
}
