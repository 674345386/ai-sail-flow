export const AGENT_PRESENTATIONS = [
  { value: 'openui', label: 'Intelligent AIGC UI 组件', description: '使用已有组件组织右侧结果。' },
  { value: 'html', label: 'HTML 动态生成', description: '直接生成 HTML 页面，在右侧自由呈现结果。' },
  { value: 'auto', label: '自动（混合）', description: '聊天默认用 Markdown，按需在右侧展示组件或 HTML。' },
] as const;

export type AgentPresentation = typeof AGENT_PRESENTATIONS[number]['value'];
export const DEFAULT_AGENT_PRESENTATION: AgentPresentation = 'auto';

export function isAgentPresentation(value: unknown): value is AgentPresentation {
  return AGENT_PRESENTATIONS.some(option => option.value === value);
}

export function normalizeAgentPresentation(value: unknown): AgentPresentation {
  return isAgentPresentation(value) ? value : DEFAULT_AGENT_PRESENTATION;
}

const presentationRequests: Record<AgentPresentation, string> = {
  openui: '先用 Markdown 简要说明结论或成果，再把完整的 Open Intelligent UI 程序放在 openui 代码块中供右侧展示。使用已提供的组件，不使用 HtmlView 或另写 HTML。',
  html: '先用 Markdown 简要说明结论或成果，再把完整、自包含的 HTML 页面放在 html 代码块中供右侧展示。使用内联 CSS，必要时加入 JavaScript。',
  auto: '聊天正文默认用 Markdown 直接回答。识图、解释、建议和普通对比用段落、列表或表格即可。用户要求独立的页面、可视化或交互界面，或者任务需要这类成果时，再把组件程序放在 openui 代码块中、完整 HTML 页面放在 html 代码块中供右侧展示。聊天正文概括主要结论或成果。',
};

export function appendPresentationRequest(prompt: string, presentation: AgentPresentation): string {
  const label = AGENT_PRESENTATIONS.find(option => option.value === presentation)!.label;
  return `${prompt}\n\n[本次结果呈现：${label}]\n${presentationRequests[presentation]}\n视频复刻分析的场景表使用工作区自带组件，聊天简述结果即可。`;
}
