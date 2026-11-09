export const AGENT_PRESENTATIONS = [
  { value: 'openui', label: 'Open Intelligent UI 组件', description: '使用已有组件组织右侧结果。' },
  { value: 'html', label: 'HTML 动态生成', description: '直接生成 HTML 页面，在右侧自由呈现结果。' },
  { value: 'auto', label: '自动（混合）', description: '由模型选择组件、HTML，或在一次回答中混合使用。' },
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
  openui: '请用已有的 Open Intelligent UI 组件充分承载本次回答，在右侧展示。输出以 root = 开头的完整组件程序；也可以先用文字解释，再把程序放在 openui 代码块中。使用已提供的组件，不使用 HtmlView 或另写 HTML。保持信息完整，不因组件排版省略必要解释。',
  html: '请生成一个完整、自包含的 HTML 页面，更好地承载本次回答，并在右侧展示。按内容自由选择排版和必要的交互，充分解释结果。使用内联 CSS，必要时加入 JavaScript；将页面放在 html 代码块中。无需使用 Open Intelligent UI 组件语法。可以在代码块外补充自然语言说明。',
  auto: '请按内容选择最合适的方式承载右侧结果：已有 Open Intelligent UI 组件、动态 HTML 页面，或两者混合。组件程序放在 openui 代码块中，完整 HTML 页面放在 html 代码块中；混合时分别输出对应区块，右侧会按顺序展示。也可以用一个 Open Intelligent UI 程序组合组件和 HtmlView。不要为了套用界面省略必要解释；简单对话可以直接用文字。',
};

export function appendPresentationRequest(prompt: string, presentation: AgentPresentation): string {
  const label = AGENT_PRESENTATIONS.find(option => option.value === presentation)!.label;
  return `${prompt}\n\n[本次结果呈现：${label}]\n${presentationRequests[presentation]}`;
}
