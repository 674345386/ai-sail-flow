import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AgentInterface, DetailedViewPanel, MarkDownRenderer } from '@openuidev/react-ui';
import { Renderer, type ActionEvent } from '@openuidev/react-lang';
import { agUIAdapter, artifactViewId, useDetailedViewStore, useThread, useThreadContextStore, useThreadList, type ChatLLM, type ChatStorage, type Message, type UserMessage } from '@openuidev/react-headless';
import { ChevronDown, ImagePlus, Plus, Upload, X } from 'lucide-react';
import type { Project } from '../shared/domain';
import type { AgentMessage } from '../shared/agent-message';
import type { CanvasComponent } from '../shared/agent-canvas-ui';
import { AGENT_MODELS, DEFAULT_AGENT_MODEL } from '../shared/agent-models';
import { api } from './api';
import { supabase } from './auth';
import { groupAgentMedia, UNASSIGNED_MEDIA } from './agentMediaTimeline';
import { creativeOpenUILibrary, isValidOpenUIProgram, openuiMedia } from '../shared/openui-creative-library';
import { library as intelligentLibrary, isValidIntelligentUIProgram } from './intelligent-ui/library';
import { intelligentSidePanel } from './intelligent-ui/fallback';
import { runLibraryAction } from './intelligent-ui/actions';
import '@openuidev/react-ui/styles/index.css';
import 'katex/dist/katex.min.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './intelligent-ui/components/theme.css';
import './intelligent-ui/components/components.css';
import './intelligent-ui/components/map/map.css';
import './native-openui-agent.css';

type AgentState = { status: 'idle' | 'running' | 'failed'; model?: string; effort?: string; error?: string; messages: AgentMessage[]; canvasComponents?: CanvasComponent[]; openuiPanel?: { id: string; title: string; source: string; library?: 'intelligent' | 'openui'; createdAt: string } };
type CreativeArtifact = { id: string; kind: 'image' | 'video'; title: string; url: string; poster?: string; updatedAt: string };

function AgentThreadStatus() {
  const error = useThread(state => state.threadError);
  return error && <p className="native-openui-error native-openui-thread-error" role="alert">{error.message}</p>;
}

function ChatAssistantMessage({ message, onAction, toolProvider }: { message: Message; onAction: (event: ActionEvent) => void; toolProvider: Record<string, (args: Record<string, unknown>) => Promise<unknown>> }) {
  const content = typeof message.content === 'string' ? message.content : '';
  const isIntelligent = isValidIntelligentUIProgram(content);
  return <div className={`native-openui-chat-answer${isIntelligent ? ' native-openui-intelligent' : ''}`} data-theme={isIntelligent ? 'dark' : undefined}>
    {isIntelligent || isValidOpenUIProgram(content)
      ? <Renderer response={content} library={isIntelligent ? intelligentLibrary : creativeOpenUILibrary} toolProvider={toolProvider} onAction={onAction} />
      : <MarkDownRenderer textMarkdown={content} variant="clear" />}
  </div>;
}

function CanvasArtifacts({ artifacts }: { artifacts: CreativeArtifact[] }) {
  const detailedView = useDetailedViewStore();
  return <aside className="native-openui-artifacts" aria-label="OpenUI 产物列表">
    <h3>产物 <span>{artifacts.length}</span></h3>
    <div className="native-openui-artifact-list">{artifacts.length ? artifacts.map(item =>
      <button type="button" key={item.id} onClick={() => detailedView.getState().setActiveDetailedView(artifactViewId(item.id, 1))}>
        {item.kind === 'image' ? <img src={item.url} alt="" loading="lazy" /> : item.poster ? <img src={item.poster} alt="" loading="lazy" /> : <span className="native-openui-artifact-placeholder">视频</span>}
        <span><strong>{item.title}</strong><small>{item.kind === 'image' ? '图片' : '视频'}</small></span>
      </button>,
    ) : <p>当前还没有生成的图片或视频。</p>}</div>
  </aside>;
}

function toOpenUIMessages(state: AgentState, project: Project): Message[] {
  const grouped = groupAgentMedia(state.messages, project.agentImages || [], project.generatedVideos);
  const result: Message[] = [];
  const appendMedia = (anchor: string) => {
    for (const item of grouped.get(anchor) || []) {
      if (!item.value.url) continue;
      result.push({ id: `media:${item.value.id}`, role: 'assistant', content: openuiMedia(item.kind, item.value.url, item.kind === 'image' ? item.value.prompt.slice(0, 100) : item.value.filename || '生成视频', item.kind === 'video' ? item.value.thumbnail : undefined) });
    }
  };
  for (const message of state.messages) {
    if (message.role === 'user') {
      result.push({ id: message.id, role: 'user', content: message.text });
      if (message.images?.length) result.push({ id: `references:${message.id}`, role: 'assistant', content: `root = Stack([ImageGallery(${JSON.stringify(message.images.map(image => ({ src: image.url, alt: `参考图：${image.name}` })))})])` });
    } else if (message.text.trim()) result.push({ id: message.id, role: 'assistant', content: message.text });
    appendMedia(message.id);
  }
  appendMedia(UNASSIGNED_MEDIA);
  return result;
}

function SelectCreativeThread({ id }: { id: string }) {
  const selectThread = useThreadList(state => state.selectThread);
  useEffect(() => { selectThread(id); }, [id, selectThread]);
  return null;
}
function CanvasDraftPrompt({ draft, onConsumed }: { draft?: { text: string; version: number } | null; onConsumed: () => void }) {
  const processMessage = useThread(state => state.processMessage);
  const isRunning = useThread(state => state.isRunning);
  return draft && <div className="native-openui-canvas-draft"><span>{draft.text}</span><button type="button" disabled={isRunning} onClick={() => { onConsumed(); void processMessage({ role: 'user', content: draft.text }); }}>发送参数给 Agent</button></div>;
}
function AgentActionBridge({ register }: { register: (handler: (event: ActionEvent) => void) => void }) {
  const processMessage = useThread(state => state.processMessage);
  useEffect(() => {
    register(event => {
      const details = Object.keys(event.params || {}).length || Object.keys(event.formState || {}).length
        ? `\n${JSON.stringify({ action: event.type, params: event.params, formState: event.formState })}` : '';
      void processMessage({ role: 'user', content: `${event.humanFriendlyMessage || event.type}${details}` });
    });
    return () => register(() => {});
  }, [processMessage, register]);
  return null;
}
function CreativeArtifactBridge({ projectId, artifacts }: { projectId: string; artifacts: CreativeArtifact[] }) {
  const selectedThreadId = useThreadList(state => state.selectedThreadId);
  const context = useThreadContextStore();
  useEffect(() => {
    if (selectedThreadId !== projectId) return;
    for (const item of artifacts) context.getState().registerArtifact({ id: item.id, version: 1, heading: item.title, type: item.kind === 'image' ? 'creative_image' : 'creative_video', updatedAt: item.updatedAt });
    return () => { for (const item of artifacts) context.getState().unregisterArtifact(item.id, 1); };
  }, [artifacts, context, projectId, selectedThreadId]);
  return <>{artifacts.map(item => <DetailedViewPanel key={item.id} viewId={artifactViewId(item.id, 1)} title={item.title}>
    {item.kind === 'image' ? <img className="native-openui-artifact-image" src={item.url} alt={item.title} /> : <video className="native-openui-artifact-video" src={item.url} poster={item.poster} controls playsInline preload="metadata" />}
  </DetailedViewPanel>)}</>;
}

export default function NativeOpenUIAgentWorkspace({ project, canvas, disabled, onUploadVideo, onUploadImage, onOpenLibrary, onProjectUpdate, onBeforeSend, onCanvasState, canvasDraft, onCanvasDraftConsumed }: {
  project: Project; canvas: ReactNode; disabled: boolean; onUploadVideo: () => void; onUploadImage: () => void; onOpenLibrary: () => void;
  onProjectUpdate: (project: Project) => void; onBeforeSend: () => Promise<unknown>; onCanvasState: (components: CanvasComponent[]) => void; canvasDraft?: { text: string; version: number } | null; onCanvasDraftConsumed: () => void;
}) {
  const [agent, setAgent] = useState<AgentState>({ status: 'idle', messages: [] });
  const [modelError, setModelError] = useState('');
  const [modelDraft, setModelDraft] = useState<string>(DEFAULT_AGENT_MODEL);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [rightView, setRightView] = useState<'ui' | 'canvas'>('ui');
  const [visibleTabs, setVisibleTabs] = useState<Array<'ui' | 'canvas'>>(['canvas', 'ui']);
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<{ model: string; displayName?: string }[]>([]);
  const artifacts = useMemo<CreativeArtifact[]>(() => [
    ...(project.agentImages || []).filter(image => image.status === 'completed' && image.url).map(image => ({ id: `creative-image:${image.id}`, kind: 'image' as const, title: image.prompt.slice(0, 60) || '生成图片', url: image.url!, updatedAt: image.createdAt })),
    ...project.generatedVideos.filter(video => video.status === 'completed' && video.url).map(video => ({ id: `creative-video:${video.id}`, kind: 'video' as const, title: video.filename || '生成视频', url: video.url!, poster: video.thumbnail, updatedAt: video.finishedAt || video.startedAt })),
    ...(project.composedVideos || []).filter(video => video.url).map(video => ({ id: `creative-composed:${video.id}`, kind: 'video' as const, title: video.filename || '合成视频', url: video.url, updatedAt: video.finishedAt })),
  ], [project.agentImages, project.generatedVideos, project.composedVideos]);
  const actionHandler = useRef<(event: ActionEvent) => void>(() => {});
  const canvasVersionRef = useRef<string | null>(null);
  const onProjectUpdateRef = useRef(onProjectUpdate);
  onProjectUpdateRef.current = onProjectUpdate;
  const registerActionHandler = useMemo(() => (handler: (event: ActionEvent) => void) => { actionHandler.current = handler; }, []);
  const handleOpenUIAction = (event: ActionEvent) => { if (!runLibraryAction(event)) actionHandler.current(event); };
  const openuiTools = useMemo<Record<string, (args: Record<string, unknown>) => Promise<unknown>>>(() => Object.fromEntries(
    ['get_creative', 'show_openui_ui', 'show_canvas_component', 'analyze_reference', 'generate_image', 'generate_video', 'generate_first_last_frame_video', 'recover_video', 'edit_grid_prompt', 'generate_grid_video'].flatMap(name =>
      [name, `sail_creation/${name}`].map(alias => [alias, (args: Record<string, unknown>) => api(`/api/projects/${project.id}/agent/openui-tool`, { method: 'POST', body: JSON.stringify({ name, args }) })]),
    ),
  ), [project.id]);
  const storage = useMemo<ChatStorage>(() => ({ thread: {
    async listThreads() { return { threads: [{ id: project.id, title: project.title, createdAt: new Date().toISOString() }] }; },
    async createThread(_firstMessage: UserMessage) { return { id: project.id, title: project.title, createdAt: new Date().toISOString() }; },
    async getMessages() {
      const [state, freshProject] = await Promise.all([api<AgentState>(`/api/projects/${project.id}/agent`), api<Project>(`/api/projects/${project.id}`)]);
      return toOpenUIMessages(state, freshProject);
    },
    async updateThread(thread) { return thread; },
    async deleteThread() { throw new Error('请通过创意导航管理对话。'); },
  } }), [project.id, project.title]);
  const llm = useMemo<ChatLLM>(() => ({
    streamProtocol: agUIAdapter(),
    async send({ messages, signal }) {
      const last = [...messages].reverse().find(message => message.role === 'user');
      const prompt = typeof last?.content === 'string' ? last.content.trim() : '';
      if (!prompt) throw new Error('请输入消息。');
      await onBeforeSend();
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      const response = await fetch(`/api/projects/${project.id}/agent/openui-stream`, {
        method: 'POST', signal, headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ prompt }),
      });
      return response;
    },
  }), [project.id, onBeforeSend]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const path = `/api/projects/${project.id}/agent`;
    void api<AgentState>(path).then(state => { if (!cancelled) setAgent(state); }).catch(() => {});
    void (async () => {
      while (!cancelled) {
        try {
          const session = supabase ? (await supabase.auth.getSession()).data.session : null;
          const response = await fetch(`${path}/events`, { signal: controller.signal, headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} });
          if (!response.ok || !response.body) break;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (!cancelled) {
            const chunk = await reader.read(); if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            let index: number;
            while ((index = buffer.indexOf('\n\n')) >= 0) {
              const frame = buffer.slice(0, index); buffer = buffer.slice(index + 2);
              const data = frame.split('\n').find(line => line.startsWith('data: '));
              if (data && !cancelled) { try { setAgent(JSON.parse(data.slice(6)) as AgentState); } catch { /* Ignore incomplete frames. */ } }
            }
          }
        } catch { /* Reconnect transient streams. */ }
        if (!cancelled) await new Promise(resolve => setTimeout(resolve, 2000));
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [project.id]);
  useEffect(() => { onCanvasState(agent.canvasComponents || []); }, [agent.canvasComponents, onCanvasState]);
  const canvasVersion = (agent.canvasComponents || []).map(component => `${component.id}:${component.updatedAt}`).join('|');
  const activateTab = (tab: 'ui' | 'canvas') => { setVisibleTabs(current => current.includes(tab) ? current : [...current, tab]); setRightView(tab); setTabMenuOpen(false); };
  const closeTab = (tab: 'ui' | 'canvas') => {
    const next = visibleTabs.filter(item => item !== tab);
    setVisibleTabs(next);
    if (rightView === tab && next.length) setRightView(next[next.length - 1]);
  };
  useEffect(() => {
    if (canvasVersionRef.current !== null && canvasVersion && canvasVersion !== canvasVersionRef.current) activateTab('canvas');
    canvasVersionRef.current = canvasVersion;
  }, [canvasVersion]);
  useEffect(() => { setModelDraft(agent.model || DEFAULT_AGENT_MODEL); }, [agent.model]);
  useEffect(() => { void api<{ model: string; displayName?: string }[]>(`/api/projects/${project.id}/agent/models`).then(setAvailableModels).catch(() => {}); }, [project.id]);
  const hasRunningMedia = Boolean(project.agentImages?.some(image => image.status === 'running') || project.generatedVideos.some(video => video.status === 'running'));
  const lastUserIndex = agent.messages.map(message => message.role).lastIndexOf('user');
  const latestUser = agent.messages[lastUserIndex];
  const latestAnswer = lastUserIndex >= 0 ? agent.messages.slice(lastUserIndex + 1).filter(message => message.role === 'assistant' && message.text.trim()).at(-1) : undefined;
  const generatedPanel = agent.openuiPanel && (!latestUser || agent.openuiPanel.createdAt >= latestUser.createdAt) ? agent.openuiPanel : undefined;
  const fallbackPanel = latestAnswer ? intelligentSidePanel(latestUser?.text || '', latestAnswer.text) : undefined;
  const rightSource = generatedPanel?.source || fallbackPanel?.source || '';
  const rightIsIntelligent = generatedPanel ? generatedPanel.library === 'intelligent' : fallbackPanel?.library === 'intelligent';
  useEffect(() => { if (generatedPanel || latestAnswer) activateTab('ui'); }, [generatedPanel?.id, latestAnswer?.id]);
  useEffect(() => {
    if (agent.status !== 'running' && !hasRunningMedia) return;
    let cancelled = false;
    const refresh = () => void api<Project>(`/api/projects/${project.id}`).then(fresh => { if (!cancelled) onProjectUpdateRef.current(fresh); }).catch(() => {});
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [agent.status, project.id, hasRunningMedia]);

  const changeModel = async (model: string) => {
    try { setAgent(await api<AgentState>(`/api/projects/${project.id}/agent/model`, { method: 'POST', body: JSON.stringify({ model }) })); setModelError(''); setModelMenuOpen(false); }
    catch (error) { setModelError(error instanceof Error ? error.message : '切换模型失败'); }
  };

  return <section className="native-openui-agent" aria-label="创作 Agent 工作区">
    <div className="native-openui-toolbar">
      <button type="button" onClick={onUploadImage} disabled={disabled} title="添加参考图片"><ImagePlus size={15} />图片</button>
      <button type="button" onClick={onUploadVideo} disabled={disabled} title="添加参考视频"><Upload size={15} />视频</button>
      <button type="button" onClick={onOpenLibrary} disabled={disabled}>素材库</button>
      <div className="native-openui-model-picker">
        <button type="button" className="native-openui-model-button" aria-label="选择创作 Agent 模型" aria-expanded={modelMenuOpen} aria-haspopup="listbox" disabled={disabled || agent.status === 'running'} onClick={() => setModelMenuOpen(open => !open)}>{agent.model || DEFAULT_AGENT_MODEL} · {agent.effort || 'high'} <ChevronDown size={13} /></button>
        {modelMenuOpen && <div className="native-openui-model-menu" role="listbox" aria-label="可用模型">
          {(availableModels.length ? availableModels : AGENT_MODELS.map(model => ({ model: model.id, displayName: model.label }))).map(model => <button type="button" role="option" aria-selected={model.model === agent.model} key={model.model} onClick={() => void changeModel(model.model)}>{model.displayName || model.model}<small>{model.model}</small></button>)}
          <div className="native-openui-model-custom"><input aria-label="自定义模型名称" placeholder="其他 Provider 模型" value={modelDraft} onChange={event => setModelDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && modelDraft.trim()) void changeModel(modelDraft.trim()); }} /><button type="button" disabled={!modelDraft.trim()} onClick={() => void changeModel(modelDraft.trim())}>使用</button></div>
        </div>}
      </div>
    </div>
    {modelError && <p className="native-openui-error" role="alert">{modelError}</p>}
    <AgentInterface key={project.id} llm={llm} storage={storage} componentLibrary={intelligentLibrary} components={{ AssistantMessage: ({ message }) => <ChatAssistantMessage message={message} toolProvider={openuiTools} onAction={handleOpenUIAction} /> }} onAction={handleOpenUIAction} theme={{ mode: 'dark' }} agentName="创作 Agent" scrollVariant="always">
      <AgentInterface.Sidebar><div /></AgentInterface.Sidebar>
      <AgentInterface.MobileHeader menuButton={false} newChatButton={false} agentName="创作 Agent" />
      <AgentInterface.ThreadHeader showChatActions={false} center="创作 Agent" />
      <AgentInterface.Composer placeholder="描述你想创作的图片、视频，或直接提问…" />
      <AgentInterface.Workspace><div className="native-openui-right"><div className="native-openui-output">
        <nav className="native-openui-output-tabs" aria-label="右侧工作区标签页">{visibleTabs.map(tab => <div className={`native-openui-tab${rightView === tab ? ' active' : ''}`} key={tab}>
          <button type="button" aria-selected={rightView === tab} onClick={() => activateTab(tab)}>{tab === 'canvas' ? '视频画布 · 产物' : 'Agent UI'}</button>
          <button type="button" className="native-openui-tab-close" aria-label={`关闭${tab === 'canvas' ? '视频画布与产物' : 'Agent UI'}标签页`} onClick={() => closeTab(tab)}><X size={12} /></button>
        </div>)}<div className="native-openui-tab-add"><button type="button" aria-label="添加右侧标签页" aria-expanded={tabMenuOpen} onClick={() => setTabMenuOpen(open => !open)}><Plus size={15} /></button>
          {tabMenuOpen && <div className="native-openui-tab-menu"><button type="button" onClick={() => activateTab('canvas')}>视频画布 · 产物</button><button type="button" onClick={() => activateTab('ui')}>Agent UI</button></div>}
        </div></nav>
        <div className={`native-openui-generated${rightIsIntelligent ? ' native-openui-intelligent' : ''}`} data-theme={rightIsIntelligent ? 'dark' : undefined} hidden={rightView !== 'ui' || !visibleTabs.includes('ui')} aria-label="Agent 生成的 OpenUI 界面">{rightSource ? <Renderer key={generatedPanel?.id || latestAnswer?.id} response={rightSource} library={rightIsIntelligent ? intelligentLibrary : creativeOpenUILibrary} toolProvider={openuiTools} onAction={handleOpenUIAction} /> : <p className="native-openui-empty">在左侧提问后，Agent 生成的界面会显示在这里。</p>}</div>
        <div className="native-openui-canvas-tab" hidden={rightView !== 'canvas' || !visibleTabs.includes('canvas')}><div className="native-openui-canvas">{canvas}</div><CanvasArtifacts artifacts={artifacts} /></div>
        {!visibleTabs.length && <div className="native-openui-no-tabs">点击 + 打开右侧工作区标签页。</div>}
      </div></div></AgentInterface.Workspace>
      <AgentThreadStatus />
      <SelectCreativeThread id={project.id} />
      <CreativeArtifactBridge projectId={project.id} artifacts={artifacts} />
      <CanvasDraftPrompt draft={canvasDraft} onConsumed={onCanvasDraftConsumed} />
      <AgentActionBridge register={registerActionHandler} />
    </AgentInterface>
  </section>;
}
