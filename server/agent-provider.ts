import { fileURLToPath } from 'node:url';
import { DEFAULT_AGENT_EFFORT, DEFAULT_AGENT_MODEL } from '../shared/agent-models';

// Codex owns the conversation, streaming and tools. Providers only supply
// connection settings and, when needed, a model catalog for Codex.
const id = process.env.SOP_AGENT_PROVIDER?.trim() || 'deepseek';
if (!/^[a-zA-Z][\w-]{0,63}$/.test(id)) throw new Error('SOP_AGENT_PROVIDER 格式无效。');
const custom = id !== 'codex';
const baseUrl = process.env.SOP_AGENT_BASE_URL?.trim().replace(/\/+$/, '') || (id === 'deepseek' ? 'https://api.deepseek.com' : undefined);

export const agentProvider = {
  id,
  custom,
  key: custom ? `${id}@${baseUrl || ''}` : id,
  model: process.env.SOP_AGENT_MODEL?.trim() || (id === 'deepseek' ? DEFAULT_AGENT_MODEL : 'gpt-6.1-terra'),
  effort: process.env.SOP_AGENT_EFFORT?.trim() || DEFAULT_AGENT_EFFORT,
  baseUrl,
  apiKeyEnv: process.env.SOP_AGENT_API_KEY_ENV?.trim() || (id === 'deepseek' ? 'DEEPSEEK_API_KEY' : 'SOP_AGENT_API_KEY'),
  catalog: process.env.SOP_AGENT_MODEL_CATALOG?.trim() || (id === 'deepseek' ? fileURLToPath(new URL('./providers/deepseek-models.json', import.meta.url)) : undefined),
};

export function agentProviderArgs(): string[] {
  const config: Record<string, string | boolean> = { model: agentProvider.model, model_reasoning_effort: agentProvider.effort };
  if (custom) {
    if (!baseUrl) throw new Error('自定义 Agent provider 需要配置 SOP_AGENT_BASE_URL。');
    if (!process.env[agentProvider.apiKeyEnv]?.trim()) throw new Error(`请在服务端配置 ${agentProvider.apiKeyEnv}。`);
    // Prefix avoids collisions with Codex's reserved built-in provider IDs.
    const providerId = `sop_${id}`;
    Object.assign(config, {
      model_provider: providerId,
      [`model_providers.${providerId}.name`]: id,
      [`model_providers.${providerId}.base_url`]: baseUrl,
      [`model_providers.${providerId}.env_key`]: agentProvider.apiKeyEnv,
      [`model_providers.${providerId}.wire_api`]: 'responses',
      [`model_providers.${providerId}.requires_openai_auth`]: false,
      [`model_providers.${providerId}.supports_websockets`]: false,
    });
  }
  if (agentProvider.catalog) config.model_catalog_json = agentProvider.catalog;
  // Passed directly to spawn, never through a shell; credentials stay in env.
  return Object.entries(config).flatMap(([key, value]) => ['-c', `${key}=${JSON.stringify(value)}`]);
}
