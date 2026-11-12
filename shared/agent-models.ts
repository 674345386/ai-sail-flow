export const AGENT_MODELS = [
  { id: 'deepseek-flash', label: 'DeepSeek-V4.1-Flash-1017' },
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' },
  { id: 'gpt-6-astra', label: 'GPT-6 Astra' },
  { id: 'gpt-6.1-terra', label: 'GPT-6.1 Terra' },
  { id: 'gpt-6-sol', label: 'GPT-6 Sol' },
  { id: 'gpt-6-luna', label: 'GPT-6 Luna' },
] as const;

export type AgentModel = typeof AGENT_MODELS[number]['id'];
export const DEFAULT_AGENT_MODEL: AgentModel = 'deepseek-flash';
export const DEFAULT_AGENT_EFFORT = 'high' as const;

export function isAgentModel(model: unknown): model is AgentModel {
  return AGENT_MODELS.some(item => item.id === model);
}
