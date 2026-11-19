import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { agentPanelId, htmlPageTitle, parseAgentAnswer } from '../shared/agent-answer';
import type { AgentMessage } from '../shared/agent-message';
import type { AgentImage } from '../shared/domain';
import { demoProject } from '../shared/demo';
import { groupAgentMedia } from '../src/agentMediaTimeline';
import { collectAgentArtifacts } from '../src/intelligent-ui/AgentArtifacts';
import { AgentConversationText } from '../src/intelligent-ui/AgentConversationText';
import { SandboxedHtml } from '../src/intelligent-ui/components/html-view';
import { isValidIntelligentUIProgram } from '../src/intelligent-ui/library';

const ui = 'root = Col([Title("Repository")])';
const html = '<!doctype html><html><head><title>项目说明</title></head><body><h1>完整结果</h1><script>window.ready = true;</script></body></html>';
assert.deepEqual(parseAgentAnswer('普通回答'), { conversation: '普通回答', panels: [] });
assert.equal(parseAgentAnswer(ui).panels[0].format, 'openui');
assert(isValidIntelligentUIProgram('root = Col([Card([Text("模型", "xl"), Text("价格", "xl")])])'));
assert(!isValidIntelligentUIProgram('root = Col([Text("模型", "unknown")])'));
assert.equal(parseAgentAnswer(html).panels[0].source, html);
assert.equal(parseAgentAnswer(html.slice(0, -7)).panels[0].complete, false);
const mixed = `前面的说明\n\n\`\`\`openui\n${ui}\n\`\`\`\n\n中间的说明\n\n\`\`\`html\n${html}\n\`\`\`\n\n后面的说明`;
const parsed = parseAgentAnswer(mixed);
assert.deepEqual(parsed.panels.map(panel => panel.format), ['openui', 'html']);
assert(parsed.panels.every(panel => panel.complete));
assert(parsed.conversation.includes('前面的说明') && parsed.conversation.includes('中间的说明') && parsed.conversation.includes('后面的说明'));
assert(!parsed.conversation.includes('<script>'));
assert.equal(parseAgentAnswer(`说明\n\`\`\`html\n${html}`).panels[0].complete, false);
assert.equal(parseAgentAnswer(`~~~~markdown\n\`\`\`html\n${html}\n\`\`\`\n~~~~`).panels.length, 0);
assert.equal(parseAgentAnswer(`~~~~html\n${html}\n~~~~`).panels[0].complete, true);
assert.equal(parseAgentAnswer(`\`\`\`js\nconst html = "<html></html>";\n\`\`\``).panels.length, 0);
assert.equal(htmlPageTitle(html), '项目说明');

const artifacts = collectAgentArtifacts(demoProject('presentation-check'), [{ id: 'answer', role: 'assistant', text: mixed, createdAt: '2026-11-06T18:00:00Z' }]);
const panels = artifacts.filter(artifact => artifact.kind === 'ui');
assert.equal(panels.length, 2);
assert.equal(panels[0].id, agentPanelId('answer', 0));
assert.equal(panels[1].id, agentPanelId('answer', 1));
assert.equal(panels[1].source, html);
assert.equal(panels[1].title, '项目说明');

const rendered = renderToStaticMarkup(createElement(SandboxedHtml, { html, title: '项目说明' }));
assert(rendered.includes('sandbox="allow-scripts"'));
assert(!rendered.includes('allow-same-origin'));
assert(rendered.includes('Content-Security-Policy'));
assert(rendered.includes('srcDoc=') || rendered.includes('srcdoc='));
const streaming = renderToStaticMarkup(createElement(SandboxedHtml, { html, streaming: true }));
assert(!streaming.includes('<iframe'), 'streaming HTML must not execute');

const firstImage = '/media/agent-image-one.png';
const secondImage = '/media/agent-image-two.png';
const externalImage = `https://example.com${firstImage}`;
const messages: AgentMessage[] = [
  { id: 'prompt', role: 'user', text: '生成图片', createdAt: '2026-11-06T18:00:00Z' },
  { id: 'update', role: 'assistant', text: `![生成图][result]\n\n[result]: ${firstImage}`, createdAt: '2026-11-06T18:00:02Z' },
  { id: 'result', role: 'assistant', text: `已生成。\n\n[![生成图](http://localhost${firstImage}?v=1)](${firstImage})\n\n参考风格 ![参考图](${externalImage})`, createdAt: '2026-11-06T18:00:03Z' },
  { id: 'follow-up', role: 'user', text: '再展示一次', createdAt: '2026-11-06T18:01:00Z' },
  { id: 'follow-up-reply', role: 'assistant', text: `![上一轮结果](${firstImage})`, createdAt: '2026-11-06T18:01:01Z' },
];
const generatedImages: AgentImage[] = [firstImage, secondImage].map(url => ({
  id: url, url, prompt: '生成图片', referenceIds: [], status: 'completed', createdAt: '2026-11-06T18:00:01Z',
}));
const { mediaByMessage, imageUrlsByMessage } = groupAgentMedia(messages, generatedImages, []);
assert.deepEqual(mediaByMessage.get('result')?.map(item => item.value.url), [firstImage, secondImage], 'each distinct image keeps its artifact preview');
const renderReply = (index: number) => renderToStaticMarkup(createElement(AgentConversationText, {
  message: messages[index], generatedImageUrls: imageUrlsByMessage.get(messages[index].id), onOpenUI: () => {},
}));
assert.equal(renderReply(1), '', 'earlier replies in the same turn must not preview the generated image again');
const resultMarkup = renderReply(2);
assert.equal((resultMarkup.match(/<img\b/g) || []).length, 1, 'keep the unrelated inline image only');
assert(resultMarkup.includes(externalImage) && resultMarkup.includes('已生成。'));
assert(!resultMarkup.includes('<p></p>') && !resultMarkup.includes('<a '), 'remove empty wrappers around the duplicate');
assert(renderReply(4).includes(`src="${firstImage}"`), 'a subsequent reply may intentionally show an older result');
const steeredTurn = messages.map(message => message.role === 'user' ? { ...message, work: {
  startedAt: message.createdAt, finishedAt: '2026-11-06T18:01:05Z', status: 'completed' as const, steps: [],
} } : message);
assert(groupAgentMedia(steeredTurn, generatedImages, []).imageUrlsByMessage.get('follow-up-reply')?.has(firstImage), 'steering within a turn keeps the same generated images');
console.log('Agent presentation check passed: HTML and UI rendering, artifact recovery and generated image preview deduplication.');
