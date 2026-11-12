import { z } from 'zod';

export const GPT_MODELS = ['gpt-6.1-sol', 'gpt-6.1-terra'] as const;
export const gptRequestSchema = z.object({
  model: z.enum(GPT_MODELS).optional(),
  input: z.union([z.string().min(1).refine(value => !!value.trim(), '请输入消息。'), z.array(z.object({
    role: z.enum(['system', 'developer', 'user', 'assistant']), content: z.string().min(1),
  })).min(1)]),
  instructions: z.string().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  reasoningEffort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']).optional(),
  jsonSchema: z.object({ name: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), schema: z.record(z.string(), z.unknown()), strict: z.boolean().default(true) }).optional(),
});
export type GptRequest = z.input<typeof gptRequestSchema>;
export type LlmOptions = { signal?: AbortSignal; timeoutMs?: number };
export type GptResponse = {
  provider: 'gpt'; id: string; model: string; text: string; data?: unknown;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
};
export class GptError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'GptError'; }
}

function connection() {
  const apiKey = (process.env.SOP_GPT_API_KEY || '').trim();
  let address: URL;
  try { address = new URL(process.env.SOP_GPT_BASE_URL || 'https://maiai.ai'); }
  catch { throw new GptError(503, 'SOP_GPT_BASE_URL 必须是有效的 HTTPS 地址。'); }
  if (address.protocol !== 'https:' || address.username || address.password || address.search || address.hash) throw new GptError(503, 'SOP_GPT_BASE_URL 必须是有效的 HTTPS 地址。');
  const root = address.pathname.replace(/\/+$/, '').replace(/\/v1(?:\/responses)?$/, '');
  address.pathname = `${root}/v1`;
  const baseUrl = address.href.replace(/\/+$/, '');
  const model = process.env.SOP_GPT_MODEL || GPT_MODELS[0];
  if (!GPT_MODELS.includes(model as typeof GPT_MODELS[number])) throw new GptError(503, 'SOP_GPT_MODEL 仅支持 gpt-6.1-sol、gpt-6.1-terra。');
  return { apiKey, baseUrl, endpoint: `${baseUrl}/responses`, model: model as typeof GPT_MODELS[number] };
}
export function gptStatus() {
  const { apiKey, ...config } = connection();
  return { provider: 'gpt' as const, configured: !!apiKey, ...config, models: GPT_MODELS };
}

const responseSchema = z.object({
  id: z.string().min(1), model: z.string().min(1), status: z.string(),
  output: z.array(z.object({ type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional(), refusal: z.string().optional() })).optional() })),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number(), total_tokens: z.number() }).nullish(),
});

/** One Responses request; no model substitution or automatic paid retries. */
export async function generateGpt(input: GptRequest, options: LlmOptions = {}): Promise<GptResponse> {
  const request = gptRequestSchema.parse(input);
  const config = connection();
  if (!config.apiKey) throw new GptError(503, '请先在服务端配置 SOP_GPT_API_KEY。');
  const safeMessage = (value: unknown) => String(value || '请求未完成').split(config.apiKey).join('[REDACTED]').replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]').slice(0, 300);
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 120_000);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  try {
    const response = await fetch(config.endpoint, {
      method: 'POST', redirect: 'manual', signal,
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model || config.model, input: request.input, instructions: request.instructions,
        store: false, stream: false, max_output_tokens: request.maxOutputTokens ?? 2048,
        ...(request.reasoningEffort ? { reasoning: { effort: request.reasoningEffort } } : {}),
        ...(request.jsonSchema ? { text: { format: { type: 'json_schema', ...request.jsonSchema } } } : {}),
      }),
    });
    const payload = await response.json().catch(error => { if (signal.aborted) throw error; return null; });
    if (!response.ok) throw new GptError(response.status, `GPT 接口 HTTP ${response.status}：${safeMessage(payload?.error?.message || payload?.message || response.statusText)}`);
    if (payload?.error) throw new GptError(502, `GPT 接口：${safeMessage(payload.error.message)}`);
    const parsed = responseSchema.safeParse(payload);
    if (!parsed.success) throw new GptError(502, 'GPT 接口未返回有效的 Responses JSON。');
    const result = parsed.data;
    if (result.status !== 'completed') throw new GptError(502, `GPT 响应未完成（${safeMessage(result.status)}${payload?.incomplete_details?.reason ? `：${safeMessage(payload.incomplete_details.reason)}` : ''}）。`);
    const content = result.output.filter(item => item.type === 'message').flatMap(item => item.content || []);
    if (content.some(part => part.type === 'refusal')) throw new GptError(422, 'GPT 拒绝了本次请求。');
    const text = content.filter(part => part.type === 'output_text').map(part => part.text || '').join('');
    if (!text.trim()) throw new GptError(502, 'GPT 未返回文本。');
    let data: unknown;
    if (request.jsonSchema) {
      try { data = JSON.parse(text); } catch { throw new GptError(502, 'GPT 未返回有效的结构化 JSON。'); }
    }
    return { provider: 'gpt', id: result.id, model: result.model, text, ...(request.jsonSchema ? { data } : {}),
      ...(result.usage ? { usage: { inputTokens: result.usage.input_tokens, outputTokens: result.usage.output_tokens, totalTokens: result.usage.total_tokens } } : {}) };
  } catch (error) {
    if (error instanceof GptError) throw error;
    if (options.signal?.aborted) throw new GptError(499, 'GPT 请求已取消。');
    if (timeout.aborted) throw new GptError(504, 'GPT 请求超时。');
    throw new GptError(502, `GPT 连接失败：${safeMessage(error instanceof Error ? error.message : error)}`);
  }
}
