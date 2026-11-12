import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { ArrowUp, LoaderCircle, Plus, Square, Upload, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Project } from '../shared/domain';
import type { AgentMessage as Message } from '../shared/agent-message';
import type { CanvasComponent } from '../shared/agent-canvas-ui';
import { AGENT_MODELS, DEFAULT_AGENT_EFFORT, DEFAULT_AGENT_MODEL } from '../shared/agent-models';
import { api } from './api';
import { supabase } from './auth';
import { groupAgentMedia, UNASSIGNED_MEDIA, type AgentMedia } from './agentMediaTimeline';
import './agent-workspace.css';

type AgentState = { status: 'idle' | 'running' | 'failed'; model?: string; effort?: string; error?: string; messages: Message[]; canvasComponents?: CanvasComponent[] };
const empty: AgentState = { status: 'idle', model: DEFAULT_AGENT_MODEL, effort: DEFAULT_AGENT_EFFORT, messages: [] };

export default function AgentWorkspace({ project, disabled, onUploadVideo, onUploadImage, onOpenLibrary, onRemoveImage, onProjectUpdate, onBeforeSend, onCanvasState, canvasDraft }: {
  project: Project; disabled: boolean; onUploadVideo: () => void; onUploadImage: () => void;
  onOpenLibrary: () => void;
  onRemoveImage: (id: string) => void;
  onProjectUpdate: (project: Project) => void; onBeforeSend: () => Promise<unknown>;
  onCanvasState?: (components: CanvasComponent[]) => void; canvasDraft?: { text: string; version: number } | null;
}) {
  const [agent, setAgent] = useState<AgentState>(empty);
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sentImageIds, setSentImageIds] = useState<Set<string>>(new Set());
  const [previewImageId, setPreviewImageId] = useState<string | null>(null);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [models, setModels] = useState<{ model: string; displayName?: string }[]>([]);
  const [chatWidth, setChatWidth] = useState<number | null>(() => {
    try { const value = Number(localStorage.getItem('sail-agent-chat-width')); return Number.isFinite(value) && value >= 280 ? value : null; }
    catch { return null; }
  });
  const [resizing, setResizing] = useState(false);
  const chatPanel = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const resizeChat = (width: number) => {
    const available = chatPanel.current?.parentElement?.clientWidth || 1200;
    const next = Math.round(Math.max(280, Math.min(width, 900, available - 240)));
    setChatWidth(next);
    try { localStorage.setItem('sail-agent-chat-width', String(next)); } catch { /* Storage may be unavailable. */ }
  };
  const bottom = useRef<HTMLDivElement>(null);
  const video = project.assets.find(asset => asset.kind === 'video');
  const images = project.assets.filter(asset => asset.kind === 'product' && !sentImageIds.has(asset.id));
  const previewImage = images.find(asset => asset.id === previewImageId);
  const imageRunning = project.agentImages?.some(image => image.status === 'running') || false;
  const videoRunning = project.generatedVideos.some(video => video.status === 'running');
  const mediaByMessage = groupAgentMedia(agent.messages, project.agentImages || [], project.generatedVideos);
  const mediaVersion = [...mediaByMessage.values()].flat().map(result => `${result.kind}:${result.value.id}:${result.value.status}`).join('|');
  const modelOptions = models.length ? models : [{ model: agent.model || DEFAULT_AGENT_MODEL, displayName: AGENT_MODELS.find(item => item.id === (agent.model || DEFAULT_AGENT_MODEL))?.label }];
  const modelLabel = modelOptions.find(item => item.model === agent.model)?.displayName || agent.model || DEFAULT_AGENT_MODEL;
  useEffect(() => {
    const controller = new AbortController();
    setModels([]);
    void api<{ model: string; displayName?: string }[]>(`/api/projects/${project.id}/agent/models`, { signal: controller.signal }).then(setModels).catch(() => {});
    return () => controller.abort();
  }, [project.id]);
  useEffect(() => { onCanvasState?.(agent.canvasComponents || []); }, [agent.canvasComponents, onCanvasState]);
  useEffect(() => { if (canvasDraft) setPrompt(canvasDraft.text); }, [canvasDraft?.version]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const path = `/api/projects/${project.id}/agent`;
    void api<AgentState>(path).then(state => { if (!cancelled) {
      setAgent(state);
      setSentImageIds(new Set(state.messages.flatMap(message => message.images?.map(image => image.id) || [])));
    } }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Agent 暂不可用'); });
    void (async () => {
      while (!cancelled) try {
        const session = supabase ? (await supabase.auth.getSession()).data.session : null;
        const headers: Record<string, string> = {};
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
        const response = await fetch(`${path}/events`, { headers, signal: controller.signal });
        if (!response.ok || !response.body) return;
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
            if (data && !cancelled) { try { setAgent(JSON.parse(data.slice(6)) as AgentState); } catch { /* Incomplete event. */ } }
          }
        }
      } catch { /* Reconnect after a transient stream error. */ }
      finally { if (!cancelled) await new Promise(resolve => setTimeout(resolve, 2000)); }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [project.id]);

  useEffect(() => {
    if (agent.status !== 'running' && !imageRunning && !videoRunning) return;
    let cancelled = false;
    const poll = async () => {
      try { const fresh = await api<Project>(`/api/projects/${project.id}`); if (!cancelled) onProjectUpdate(fresh); }
      catch { /* Next update will retry. */ }
    };
    void poll();
    const timer = setInterval(() => void poll(), 1800);
    return () => { cancelled = true; clearInterval(timer); };
  }, [agent.status, imageRunning, videoRunning, project.id, onProjectUpdate]);
  useEffect(() => { if (agent.status === 'idle' && agent.messages.length) void api<Project>(`/api/projects/${project.id}`).then(onProjectUpdate).catch(() => {}); }, [agent.status, agent.messages.length, project.id, onProjectUpdate]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [agent.messages.length, agent.messages.at(-1)?.text, mediaVersion]);
  useEffect(() => {
    if (!showModelSelector) return;
    const close = (event: MouseEvent) => { if (!(event.target as Element).closest('.agent-model-selector, .agent-model-menu')) setShowModelSelector(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setShowModelSelector(false); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', closeOnEscape); };
  }, [showModelSelector]);

  const sendText = async (text: string, clearPrompt = false) => {
    if (!text || sending || agent.status === 'running') return;
    const imageIds = images.map(image => image.id);
    setError(''); setSending(true);
    try {
      await onBeforeSend();
      const state = await api<AgentState>(`/api/projects/${project.id}/agent/turns`, { method: 'POST', body: JSON.stringify({ prompt: text, imageIds }) });
      setAgent(state); if (clearPrompt) setPrompt('');
      setSentImageIds(previous => new Set([...previous, ...imageIds]));
      setPreviewImageId(null);
    } catch (e) { setError(e instanceof Error ? e.message : '消息发送失败'); }
    finally { setSending(false); }
  };
  const send = (event: FormEvent) => { event.preventDefault(); void sendText(prompt.trim(), true); };
  const stop = async () => {
    try { await api(`/api/projects/${project.id}/agent/interrupt`, { method: 'POST' }); }
    catch (e) { setError(e instanceof Error ? e.message : '停止失败'); }
  };
  const changeModel = async (model: string) => {
    try {
      const response = await api<AgentState>(`/api/projects/${project.id}/agent/model`, { method: 'POST', body: JSON.stringify({ model }) });
      setAgent(response);
      setError('');
      setShowModelSelector(false);
    } catch (e) { setError(e instanceof Error ? e.message : '切换模型失败'); }
  };

  const renderMedia = (result: AgentMedia) => {
    if (result.kind === 'image') {
      const image = result.value;
      return <figure className="agent-inline-media" key={`image:${image.id}`}>
        {image.url ? <a href={image.url} target="_blank" rel="noreferrer" aria-label="打开生成图片"><img src={image.url} alt={image.prompt} loading="lazy" /></a>
          : <span className="agent-inline-media-status">{image.error || '正在生成图片…'}</span>}
        {image.url && <figcaption><a href={image.url} download={image.filename || 'image.png'}>下载图片</a></figcaption>}
      </figure>;
    }
    const video = result.value;
    return <figure className="agent-inline-media" key={`video:${video.id}`}>
      {video.url ? <video src={video.url} poster={video.thumbnail} controls playsInline preload="metadata" aria-label="生成视频" />
        : <span className="agent-inline-media-status">{video.error || '正在生成视频…'}</span>}
      {video.url && <figcaption><a href={video.url} download={video.filename || 'video.mp4'}>下载视频</a></figcaption>}
    </figure>;
  };

  return <aside ref={chatPanel} className={`agent-chat${resizing ? ' is-resizing' : ''}`} style={chatWidth === null ? undefined : { '--agent-chat-width': `${chatWidth}px` } as CSSProperties} aria-label="创作 Agent 对话">
    <div className="agent-chat-resizer" role="separator" aria-label="调整聊天区宽度" aria-orientation="vertical" aria-valuemin={280} aria-valuemax={900} aria-valuenow={chatWidth ?? undefined} tabIndex={0}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag.current = { x: event.clientX, width: chatPanel.current?.getBoundingClientRect().width || 390 };
        event.currentTarget.setPointerCapture(event.pointerId);
        setResizing(true);
      }}
      onPointerMove={event => { if (drag.current) resizeChat(drag.current.width + event.clientX - drag.current.x); }}
      onPointerUp={event => { drag.current = null; setResizing(false); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { drag.current = null; setResizing(false); }}
      onLostPointerCapture={() => { drag.current = null; setResizing(false); }}
      onKeyDown={event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        resizeChat((chatPanel.current?.getBoundingClientRect().width || 390) + (event.key === 'ArrowRight' ? 24 : -24));
      }} />
    <div className="agent-chat-scroll" role="log" aria-label="Agent 对话">
      {mediaByMessage.get(UNASSIGNED_MEDIA)?.map(renderMedia)}
      {agent.messages.map(message => <div className={`agent-message is-${message.role}`} key={message.id}>{message.role === 'assistant' ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ table: ({ children }) => <div className="agent-table-scroll"><table>{children}</table></div> }}>{message.text}</ReactMarkdown> : <>{message.role === 'event' && <span>创意状态</span>}{message.role === 'user' && !!message.images?.length && <div className="agent-message-images">{message.images.map((image, index) => <a key={image.id} href={image.url} target="_blank" rel="noreferrer" aria-label={`查看参考图${index + 1}：${image.name}`} title={image.name}><img src={image.url} alt={image.name} loading="lazy" /><span>参考图{index + 1}</span></a>)}</div>}<p>{message.text}</p></>}{mediaByMessage.get(message.id)?.map(renderMedia)}</div>)}
      {agent.status === 'running' && <div className="agent-thinking"><LoaderCircle className="spin" size={15} /><span>{project.job?.status === 'running' ? project.job.message : '正在思考与执行…'}</span></div>}
      <div ref={bottom} />
    </div>
    <div className="agent-chat-footer">{agent.messages.length > 0 && !video && <button type="button" className="agent-chat-add-source" disabled={disabled} onClick={onUploadVideo}><Upload size={14} />为「{project.title}」选择参考视频</button>}
      {images.length > 0 && <div className="agent-reference-images" role="group" aria-label="图片参考">
        {images.map(image => <div className="agent-reference-image" key={image.id}
          onMouseEnter={() => setPreviewImageId(image.id)} onMouseLeave={() => setPreviewImageId(null)}
          onFocus={() => setPreviewImageId(image.id)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPreviewImageId(null); }}>
          <button type="button" className="agent-reference-thumbnail" aria-label={`预览图片：${image.name}`} onClick={() => setPreviewImageId(image.id)}>
            <img src={image.url} alt={image.name} />
          </button>
          <button type="button" className="agent-reference-remove" aria-label={`移除图片：${image.name}`} title="移除图片" disabled={disabled || sending || agent.status === 'running'} onClick={() => { setPreviewImageId(null); onRemoveImage(image.id); }}><X size={12} /></button>
        </div>)}
        {images.length < 3 && <button type="button" className="agent-reference-add" disabled={disabled} onClick={onUploadImage} aria-label={`添加图片参考（${images.length}/3）`} title={`添加图片参考（${images.length}/3）`}>
          <Plus size={18} />
        </button>}
        {previewImage && <div className="agent-reference-preview" aria-hidden="true"><img src={previewImage.url} alt="" /><span>{previewImage.name}</span></div>}
      </div>}
      <form className="agent-composer agent-composer-live" onSubmit={event => void send(event)}>
        <textarea aria-label="给创作 Agent 发送消息" placeholder="描述你想创作的图片或视频，输入 @ 选择素材…" value={prompt} onChange={event => {
          const input = event.nativeEvent as InputEvent;
          const { value, selectionStart } = event.target;
          if (!disabled && !input.isComposing && input.data === '@' && value[selectionStart - 1] === '@') {
            setPrompt(value.slice(0, selectionStart - 1) + value.slice(selectionStart));
            onOpenLibrary();
          } else setPrompt(value);
        }} onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === '@' && !disabled) { event.preventDefault(); onOpenLibrary(); }
          else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
        }} />
        <div className="agent-composer-live-actions">
          <button type="button" className="agent-model-selector" disabled={disabled || agent.status === 'running'} onClick={() => setShowModelSelector(!showModelSelector)} title="切换模型" aria-haspopup="listbox" aria-expanded={showModelSelector}>{modelLabel} · {agent.effort || DEFAULT_AGENT_EFFORT}</button>
          {agent.status === 'running' ? <button type="button" onClick={() => void stop()} aria-label="停止 Agent"><Square size={16} /></button> : <button type="submit" disabled={!prompt.trim() || sending} aria-label="发送消息"><ArrowUp size={17} /></button>}
        </div>
        {showModelSelector && <div className="agent-model-menu">
          <div className="agent-model-menu-header"><span>选择创作模型</span><button type="button" className="agent-model-menu-close" aria-label="关闭模型选择" title="关闭" onClick={() => setShowModelSelector(false)}><X size={16} /></button></div>
          <div className="agent-model-options" role="listbox" aria-label="选择创作模型">
            {modelOptions.map(model => <button key={model.model} type="button" role="option" aria-selected={model.model === agent.model} className={model.model === agent.model ? 'is-active' : ''} onClick={() => void changeModel(model.model)}>{model.displayName || model.model} · {agent.effort || DEFAULT_AGENT_EFFORT}</button>)}
          </div>
        </div>}
      </form>
      {(error || agent.error) && <p className="agent-error" role="alert">{error || agent.error}</p>}
    </div>
  </aside>;
}
