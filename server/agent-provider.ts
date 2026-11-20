import { fileURLToPath } from 'node:url';
import { DEFAULT_AGENT_EFFORT, DEFAULT_AGENT_MODEL } from '../shared/agent-models';
import { accountWorkspacesEnabled, workspaceDirectory } from './workspace-storage';
import path from 'node:path';
import fs from 'node:fs';
import { ensureSystemSkills } from './system-skills';

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

export const agentSandbox = accountWorkspacesEnabled ? 'read-only' : 'danger-full-access';
export const agentSandboxPolicy = accountWorkspacesEnabled ? { type: 'readOnly', networkAccess: false } : { type: 'dangerFullAccess' };
// The embedded agents have no approval UI. Their first-party MCP servers enforce workspace access.
export const agentApprovalPolicy = 'never';
export const agentMcpApprovalMode = 'approve';
export const creativeAgentEnabled = !accountWorkspacesEnabled || process.env.SOP_AGENT_ENABLED === 'true' && !!process.env.SOP_AGENT_CODEX_HOME;

export function agentCodexHome(dataDirectory: string) {
  const serviceHome = process.env.SOP_AGENT_CODEX_HOME || path.join(dataDirectory, 'agent-codex');
  const directory = accountWorkspacesEnabled && custom ? workspaceDirectory('agent-codex') : serviceHome;
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  ensureSystemSkills(directory);
  return directory;
}

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
  if (accountWorkspacesEnabled) {
    for (const feature of ['shell_tool', 'unified_exec', 'code_mode', 'apply_patch_freeform', 'skill_mcp_dependency_install']) config[`features.${feature}`] = false;
    config['features.skip_host_skill_discovery'] = true;
  }
  return Object.entries(config).flatMap(([key, value]) => ['-c', `${key}=${JSON.stringify(value)}`]);
}
