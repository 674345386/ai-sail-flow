import { useMemo } from 'react';
import ReactMarkdown, { type AllowElement } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseAgentAnswer } from '../../shared/agent-answer';
import type { AgentMessage } from '../../shared/agent-message';

function hideGeneratedImages(urls: ReadonlySet<string>): AllowElement {
  const origin = globalThis.location?.origin || 'http://localhost';
  const isGeneratedImage = (src: string) => {
    if (urls.has(src)) return true;
    try {
      const url = new URL(src, origin);
      return url.origin === origin && urls.has(url.pathname);
    } catch {
      return false;
    }
  };

  // Remove standalone previews, including Markdown links that only wrap an image.
  const isRedundant = (node: Parameters<AllowElement>[0]): boolean => {
    if (node.tagName === 'img') return typeof node.properties.src === 'string' && isGeneratedImage(node.properties.src);
    if (node.tagName !== 'p' && node.tagName !== 'a') return false;
    const content = node.children.filter(child => child.type !== 'text' || child.value.trim());
    return content.length > 0 && content.every(child => child.type === 'element' && isRedundant(child));
  };
  return node => !isRedundant(node);
}

export function AgentConversationText({ message, generatedImageUrls, hidePanelLinks = false, onOpenUI }: { message: AgentMessage; generatedImageUrls?: ReadonlySet<string>; hidePanelLinks?: boolean; onOpenUI: (index: number) => void }) {
  const answer = useMemo(() => message.role === 'assistant' ? parseAgentAnswer(message.text) : { conversation: message.text, panels: [] }, [message.role, message.text]);
  const readable = answer.conversation.replace(/\uE200cite\uE202.*?\uE201/g, '');
  const allowElement = message.role === 'assistant' && generatedImageUrls?.size ? hideGeneratedImages(generatedImageUrls) : undefined;
  return <>
    {readable ? <ReactMarkdown remarkPlugins={[remarkGfm]} allowElement={allowElement}>{readable}</ReactMarkdown>
      : !!answer.panels.length && <p className="iua-message-note">{answer.panels.some(panel => !panel.complete) ? '正在生成右侧内容…' : '结果已显示在右侧。'}</p>}
    {!hidePanelLinks && answer.panels.map((panel, index) => <button type="button" className="iua-answer-link" key={index} onClick={() => onOpenUI(index)}>{panel.format === 'html' ? '查看 HTML 页面' : '查看组件界面'}{answer.panels.length > 1 ? ` ${index + 1}` : ''}</button>)}
  </>;
}
