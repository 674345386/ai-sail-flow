import { intelligentUIResponse } from './intelligent-ui';

export type AgentAnswerPanel = { format: 'openui' | 'html'; source: string; complete: boolean };
export type AgentAnswer = { conversation: string; panels: AgentAnswerPanel[] };

// Recognise renderable fences without inspecting fences nested inside other
// code blocks. Incomplete HTML is collected but never executed by the view.
export function parseAgentAnswer(text: string): AgentAnswer {
  const panels: AgentAnswerPanel[] = [];
  const prose: string[] = [];
  const opening = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?\n/gm;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = opening.exec(text))) {
    const bodyStart = opening.lastIndex;
    const fence = match[1];
    const closing = new RegExp('^ {0,3}' + fence[0] + '{' + fence.length + ',}[ \\t]*\\r?$', 'gm');
    closing.lastIndex = bodyStart;
    const end = closing.exec(text);
    const body = text.slice(bodyStart, end?.index ?? text.length);
    const language = match[2].trim().toLowerCase();
    const format = /^(?:html|htm)$/.test(language) ? 'html'
      : /^(?:openui|openui-lang)$/.test(language) ? 'openui' : null;
    if (format) {
      prose.push(text.slice(cursor, match.index));
      panels.push({ format, source: body.trim(), complete: !!end });
      cursor = end ? closing.lastIndex : text.length;
    }
    // Skip every code fence, including unrecognised languages, so an HTML
    // example inside a longer Markdown code sample remains ordinary text.
    opening.lastIndex = end ? closing.lastIndex : text.length;
    if (!end) break;
  }
  if (panels.length) {
    prose.push(text.slice(cursor));
    return { conversation: prose.join('\n').trim(), panels };
  }
  const source = intelligentUIResponse(text);
  if (source) return { conversation: '', panels: [{ format: 'openui', source, complete: true }] };
  const raw = text.trim();
  if (/^(?:<!doctype\s+html\b[^>]*>\s*)?<html\b/i.test(raw) || /^<!doctype\s+html\b/i.test(raw)) {
    const close = /<\/html\s*>\s*$/i.test(raw);
    return { conversation: '', panels: [{ format: 'html', source: raw, complete: close }] };
  }
  return { conversation: text, panels: [] };
}

export function agentPanelId(messageId: string, index: number): string {
  return `ui:${messageId}${index ? `:${index}` : ''}`;
}

export function htmlPageTitle(source: string): string {
  return source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'HTML 页面';
}
