export const AGENT_ADAPTATIONS = [
  { value: 0, label: '原生', description: '沿用 Codex 默认表达习惯，内容自由展开。' },
  { value: 1, label: '轻适配', description: '增加中文和当前创意语境，自然解释内容。' },
  { value: 2, label: '均衡', description: '充分解释，补充必要的背景、例子与步骤。' },
  { value: 3, label: '创作优先', description: '围绕素材、分镜和制作步骤组织回答。' },
] as const;

export type AgentAdaptation = typeof AGENT_ADAPTATIONS[number]['value'];
export const DEFAULT_AGENT_ADAPTATION: AgentAdaptation = 0;

export function isAgentAdaptation(value: unknown): value is AgentAdaptation {
  return AGENT_ADAPTATIONS.some(option => option.value === value);
}

export function normalizeAgentAdaptation(value: unknown): AgentAdaptation {
  return isAgentAdaptation(value) ? value : DEFAULT_AGENT_ADAPTATION;
}
