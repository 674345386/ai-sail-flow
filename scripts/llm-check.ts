import assert from 'node:assert/strict';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const live = process.argv.includes('--live');
if (live) {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
  const setProxy = (http as typeof http & { setGlobalProxyFromEnv?: (env: NodeJS.ProcessEnv) => () => void }).setGlobalProxyFromEnv;
  if (process.env.NODE_USE_ENV_PROXY === '1') setProxy?.(process.env);
}
const { generateLlm, llmStatus } = await import('../server/llm');
const { GPT_MODELS, GptError } = await import('../server/gpt');
const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };

if (live) {
  assert(llmStatus().providers.gpt.configured, 'Configure SOP_GPT_API_KEY before the live check.');
  let failed = false;
  for (const model of GPT_MODELS) {
    const started = Date.now();
    try {
      const json = model === 'gpt-6.1-terra';
      const result = await generateLlm({ provider: 'gpt', model, reasoningEffort: 'low', maxOutputTokens: 512,
        instructions: 'Follow the requested response format exactly.',
        input: json ? [{ role: 'user', content: 'Return a JSON object with ok set to true.' }] : 'Reply with exactly SOP_GPT_OK.',
        ...(json ? { jsonSchema: { name: 'provider_check', schema } } : {}),
      }, { timeoutMs: 90_000 });
      if (json) assert.deepEqual(result.data, { ok: true });
      else assert.equal(result.text.trim(), 'SOP_GPT_OK');
      console.log(JSON.stringify({ check: 'live', requestedModel: model, responseModel: result.model, id: result.id, text: result.text, usage: result.usage, elapsedMs: Date.now() - started, passed: true }));
    } catch (error) {
      failed = true;
      console.error(JSON.stringify({ check: 'live', requestedModel: model, elapsedMs: Date.now() - started, passed: false, error: error instanceof Error ? error.message : String(error) }));
    }
  }
  if (failed) process.exitCode = 1;
} else {
  const originalFetch = globalThis.fetch;
  const names = ['SOP_GPT_API_KEY', 'SOP_GPT_BASE_URL', 'SOP_GPT_MODEL'] as const;
  const saved = names.map(name => process.env[name]);
  const key = 'sk-test-gpt-provider-only';
  const calls: { url: string; body: Record<string, any> }[] = [];
  const response = (overrides: Record<string, unknown> = {}) => ({ id: 'resp_check', model: GPT_MODELS[0], status: 'completed',
    output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: 'SOP_' }] }, { type: 'message', content: [{ type: 'output_text', text: 'GPT_OK' }] }],
    usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 }, ...overrides });
  const isError = (status: number, pattern: RegExp) => (error: unknown) => error instanceof GptError && error.status === status && pattern.test(error.message);
  try {
    process.env.SOP_GPT_API_KEY = key;
    process.env.SOP_GPT_MODEL = GPT_MODELS[0];
    globalThis.fetch = (async (url, init) => {
      assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${key}`);
      assert.equal(init?.method, 'POST');
      assert.equal(init?.redirect, 'manual');
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Response.json(response());
    }) as typeof fetch;
    for (const base of ['https://models.example.test', 'https://models.example.test/v1/', 'https://models.example.test/v1/responses']) {
      process.env.SOP_GPT_BASE_URL = base;
      const result = await generateLlm({ input: 'hello', maxOutputTokens: 128, reasoningEffort: 'low', instructions: 'Be brief.' });
      assert.equal(result.text, 'SOP_GPT_OK', 'Extract every text item, even when reasoning comes first.');
      assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 4, totalTokens: 16 });
      assert.equal(calls.at(-1)?.url, 'https://models.example.test/v1/responses');
      assert.deepEqual(calls.at(-1)?.body, { model: GPT_MODELS[0], input: 'hello', instructions: 'Be brief.', store: false, stream: false, max_output_tokens: 128, reasoning: { effort: 'low' } });
    }
    assert(!JSON.stringify(llmStatus()).includes(key), 'Status must never include the API Key.');
    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, GPT_MODELS[1]);
      assert.deepEqual(body.input, [{ role: 'user', content: 'json' }]);
      assert.deepEqual(body.text, { format: { type: 'json_schema', name: 'check', schema, strict: true } });
      return Response.json(response({ model: GPT_MODELS[1], output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }] }));
    }) as typeof fetch;
    assert.deepEqual((await generateLlm({ model: GPT_MODELS[1], input: [{ role: 'user', content: 'json' }], jsonSchema: { name: 'check', schema } })).data, { ok: true });
    let attempts = 0;
    globalThis.fetch = (async () => { attempts++; return Response.json({ error: { message: `invalid ${key}` } }, { status: 401 }); }) as typeof fetch;
    await assert.rejects(generateLlm({ input: 'hello' }), error => isError(401, /\[REDACTED\]/)(error) && !(error as Error).message.includes(key));
    assert.equal(attempts, 1, 'An upstream error must not trigger a retry.');
    globalThis.fetch = (async () => Response.json(response({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }))) as typeof fetch;
    await assert.rejects(generateLlm({ input: 'hello' }), isError(502, /max_output_tokens/));
    globalThis.fetch = (async () => Response.json(response({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }))) as typeof fetch;
    await assert.rejects(generateLlm({ input: 'hello' }), isError(422, /拒绝/));
    globalThis.fetch = (async () => new Response('<html>bad gateway</html>', { status: 502 })) as typeof fetch;
    await assert.rejects(generateLlm({ input: 'hello' }), isError(502, /HTTP 502/));
    const cancelled = new AbortController();
    globalThis.fetch = async () => {
      const result = Response.json({});
      result.json = async () => { cancelled.abort(); throw cancelled.signal.reason; };
      return result;
    };
    await assert.rejects(generateLlm({ input: 'hello' }, { signal: cancelled.signal }), isError(499, /取消/));
    globalThis.fetch = async (_url, init) => {
      const result = Response.json({});
      result.json = () => new Promise((_resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout was not enforced.')), 100);
        init!.signal!.addEventListener('abort', () => { clearTimeout(timer); reject(init!.signal!.reason); }, { once: true });
      });
      return result;
    };
    await assert.rejects(generateLlm({ input: 'hello' }, { timeoutMs: 5 }), isError(504, /超时/));
    globalThis.fetch = (async () => { throw new Error('Validation must prevent this request.'); }) as typeof fetch;
    await assert.rejects(generateLlm({ input: 'hello', model: 'other' as any }), /Invalid option/);
    await assert.rejects(generateLlm({ input: 'hello', provider: 'other' as any }), /Invalid input/);
    process.env.SOP_GPT_API_KEY = '';
    await assert.rejects(generateLlm({ input: 'hello' }), isError(503, /SOP_GPT_API_KEY/));
    console.log('PASS LLM routing, both model request formats, URL normalization, Responses extraction, JSON, usage, redaction and failure handling (no paid calls).');
  } finally {
    globalThis.fetch = originalFetch;
    names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; });
  }
}
