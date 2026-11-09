import { Component, Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Renderer, type ActionEvent } from '@openuidev/react-lang';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, Check, ChevronDown, CornerUpRight, ListFilter, ListPlus, LoaderCircle, Package, Plus, SlidersHorizontal, Square, X } from 'lucide-react';
import type { GeneratedVideo, Project } from '../shared/domain';
import type { CanvasComponent } from '../shared/agent-canvas-ui';
import type { AgentMessage } from '../shared/agent-message';
import { agentWorkHistory, createAgentWork } from '../shared/agent-work';
import type { AgentState } from '../shared/intelligent-ui';
import { agentPanelId, htmlPageTitle, parseAgentAnswer, type AgentAnswerPanel } from '../shared/agent-answer';
import { AGENT_MODELS, DEFAULT_AGENT_MODEL } from '../shared/agent-models';
import { AGENT_ADAPTATIONS, normalizeAgentAdaptation, type AgentAdaptation } from '../shared/agent-adaptation';
import { AGENT_PRESENTATIONS, normalizeAgentPresentation, type AgentPresentation } from '../shared/agent-presentation';
import { api } from './api';
import { AgentMessageAttachments, AgentPromptMedia, promptMediaAccept, useAgentPromptMedia } from './AgentPromptMedia';
import { groupAgentMedia, UNASSIGNED_MEDIA, type AgentMedia } from './agentMediaTimeline';
import { supabase } from './auth';
import { library } from './intelligent-ui/library';
import { runLibraryAction } from './intelligent-ui/actions';
import { intelligentUIConversationText } from './intelligent-ui/conversation';
import type { AgentThemeController } from './intelligent-ui/useAgentTheme';
import { AgentWorkSummary } from './intelligent-ui/AgentWorkSummary';
import { AgentAdaptationControl } from './intelligent-ui/AgentAdaptationControl';
import { AgentPresentationControl } from './intelligent-ui/AgentPresentationControl';
import { SandboxedHtml } from './intelligent-ui/components/html-view';
import { AgentArtifacts, AgentArtifactIcon, AgentArtifactPreview, AgentTaskAssets, collectAgentArtifacts, type AgentArtifact } from './intelligent-ui/AgentArtifacts';
import { useAgentWorkspaceSplit } from './intelligent-ui/useAgentWorkspaceSplit';
import { recreateVideoDraft } from './intelligent-ui/video-artifact';
import 'katex/dist/katex.min.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './intelligent-ui/components/theme.css';
import './intelligent-ui/components/components.css';
import './intelligent-ui/components/map/map.css';
import './intelligent-ui-agent.css';
import ExperimentWorkbench from './ExperimentWorkbench';
import AgentQueuedMessages from './AgentQueuedMessages';

class PanelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="alert">界面未能显示，请让 Agent 修正这次界面。</p> : this.props.children; }
}

function ConversationText({ message, onOpenUI }: { message: AgentMessage; onOpenUI: (index: number) => void }) {
  const answer = useMemo(() => message.role === 'assistant' ? parseAgentAnswer(message.text) : { conversation: message.text, panels: [] }, [message.role, message.text]);
  const readable = useMemo(() => [answer.conversation, ...answer.panels.filter(panel => panel.format === 'openui').map(panel => intelligentUIConversationText(panel.source))].filter(Boolean).join('\n\n'), [answer]);
  return <>
    {readable ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{readable.replace(/\uE200cite\uE202.*?\uE201/g, '')}</ReactMarkdown>
      : !!answer.panels.length && <p className="iua-message-note">{answer.panels.some(panel => !panel.complete) ? '正在生成右侧内容…' : '结果已显示在右侧。'}</p>}
    {answer.panels.map((panel, index) => <button type="button" className="iua-answer-link" key={index} onClick={() => onOpenUI(index)}>{panel.format === 'html' ? '查看 HTML 页面' : '查看组件界面'}{answer.panels.length > 1 ? ` ${index + 1}` : ''}</button>)}
  </>;
}

export default function IntelligentUIAgentWorkspace({ theme, project, canvas, disabled, steerDisabled = disabled, onProjectUpdate, onBeforeSend, onCanvasState, canvasDraft, onCanvasDraftConsumed, taskAssetsOpen, onOpenTaskAssets, onCloseTaskAssets, entryDraft, onEntryDraftConsumed }: {
  theme: AgentThemeController;
  project: Project; canvas: ReactNode; disabled: boolean; steerDisabled?: boolean;
  onProjectUpdate: (project: Project) => void; onBeforeSend: () => Promise<unknown>; onCanvasState: (components: CanvasComponent[]) => void;
  canvasDraft?: { text: string; version: number } | null; onCanvasDraftConsumed: () => void;
  taskAssetsOpen: boolean; onOpenTaskAssets: () => void; onCloseTaskAssets: () => void;
  entryDraft?: { id: string; text: string } | null; onEntryDraftConsumed?: () => void;
}) {
  const [agent, setAgent] = useState<AgentState>({ status: 'idle', messages: [] });
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [queueSaving, setQueueSaving] = useState(false);
  const queueSavingRef = useRef(false);
  const [queueEnabled, setQueueEnabled] = useState(() => {
    try { return localStorage.getItem(`sail-agent-queue-enabled:${project.id}`) !== 'false'; }
    catch { return true; }
  });
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [pendingUser, setPendingUser] = useState<(AgentMessage & { afterCount: number }) | null>(null);
  const [modelDraft, setModelDraft] = useState<string>(DEFAULT_AGENT_MODEL);
  const [modelMenu, setModelMenu] = useState(false);
  const [modelSaving, setModelSaving] = useState(false);
  const modelMenuId = useId();
  const modelInputId = useId();
  const modelPicker = useRef<HTMLDivElement>(null);
  const modelToggle = useRef<HTMLButtonElement>(null);
  const [adaptationSaving, setAdaptationSaving] = useState(false);
  const [presentationSaving, setPresentationSaving] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const preferencesId = useId();
  const preferencesToggle = useRef<HTMLButtonElement>(null);
  const preferencesPanel = useRef<HTMLDivElement>(null);
  const preferenceSavingRef = useRef(false);
  const [models, setModels] = useState<{ model: string; displayName?: string }[]>([]);
  const [rightView, setRightView] = useState('lab');
  const [tabs, setTabs] = useState<string[]>(['lab', 'canvas', 'ui']);
  const [tabMenu, setTabMenu] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [panelError, setPanelError] = useState('');
  const split = useAgentWorkspaceSplit();
  const summaryToggle = useRef<HTMLButtonElement>(null);
  const panelHistory = useRef<{ loaded: boolean; id?: string }>({ loaded: false });
  const output = useRef<HTMLDivElement>(null);
  const tabStrip = useRef<HTMLElement>(null);
  const taskAssetsPanel = useRef<HTMLDivElement>(null);
  const closeTaskAssets = useRef(onCloseTaskAssets);
  closeTaskAssets.current = onCloseTaskAssets;
  const scroll = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const sendingRef = useRef(false);
  const mediaInput = useRef<HTMLInputElement>(null);
  const composerText = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!entryDraft) return;
    setDraft(entryDraft.text);
    composerText.current?.focus({ preventScroll: true });
    onEntryDraftConsumed?.();
  }, [entryDraft?.id]);
  const loadVideoDetails = useCallback((id: string, signal: AbortSignal) => api<GeneratedVideo>(`/api/projects/${project.id}/agent/videos/${id}/details`, { signal }), [project.id]);
  const onProjectUpdateRef = useRef(onProjectUpdate);
  onProjectUpdateRef.current = onProjectUpdate;
  const running = sending || agent.status === 'running';
  const steering = agent.status === 'running';
  const queueByDefault = steering && queueEnabled;
  const queuedMessages = agent.queue || [];
  const currentModel = agent.model || DEFAULT_AGENT_MODEL;
  const modelOptions = (models.length ? models : AGENT_MODELS.map(model => ({ model: model.id, displayName: model.label }))).map(model => ({
    ...model,
    label: (model.displayName !== model.model && model.displayName) || AGENT_MODELS.find(option => option.id === model.model)?.label || model.model,
  }));
  const currentModelLabel = modelOptions.find(model => model.model === currentModel)?.label || currentModel;
  const adaptation = normalizeAgentAdaptation(agent.adaptation);
  const presentation = normalizeAgentPresentation(agent.presentation);
  const preferencesTitle = `结果呈现：${AGENT_PRESENTATIONS.find(option => option.value === presentation)!.label}；创作适配：${AGENT_ADAPTATIONS[adaptation].label}`;
  const media = useAgentPromptMedia({ project, messages: agent.messages, disabled: disabled || running || !historyLoaded, onBeforeChange: onBeforeSend, onProjectUpdate, onError: setError });
  const mediaDisabled = disabled || running || media.working || !historyLoaded;
  const queueDisabled = steerDisabled || sending || queueSaving || !historyLoaded || media.working || adaptationSaving || presentationSaving || modelSaving;
  const sendDisabled = (steering ? steerDisabled : disabled) || sending || queueSaving || !historyLoaded || media.working || adaptationSaving || presentationSaving || modelSaving || (steering && !agent.turnId);
  const messages = useMemo(() => pendingUser && !agent.messages.slice(pendingUser.afterCount).some(message => message.role === 'user' && message.text === pendingUser.text)
    ? [...agent.messages, pendingUser] : agent.messages, [agent.messages, pendingUser]);
  const groupedMedia = useMemo(() => groupAgentMedia(messages, project.agentImages || [], project.generatedVideos), [messages, project.agentImages, project.generatedVideos]);
  const workHistory = useMemo(() => agentWorkHistory(messages, running), [messages, running]);
  const artifacts = useMemo(() => collectAgentArtifacts(project, agent.messages, agent.intelligentPanel, agent.experiment), [project.assets, project.agentImages, project.generatedVideos, project.composedVideos, agent.messages, agent.intelligentPanel, agent.experiment]);
  const taskAssetCount = artifacts.filter(artifact => artifact.kind !== 'ui').length;
  const activeArtifact = artifacts.find(artifact => artifact.id === rightView);
  const openTaskAssets = () => { onOpenTaskAssets(); setTabMenu(false); };
  const activate = (tab: string, automatic = false) => {
    if (automatic && taskAssetsOpen) return;
    closeTaskAssets.current(); setTabs(current => current.includes(tab) ? current : [...current, tab]); setRightView(tab); setTabMenu(false); setPanelError('');
  };
  const closeTab = (tab: string) => {
    const index = tabs.indexOf(tab);
    const next = tabs.filter(value => value !== tab);
    setTabs(next);
    if (rightView === tab) {
      setRightView(next[Math.min(index, next.length - 1)] || '');
      if (!next.length) openTaskAssets();
    }
  };
  useEffect(() => {
    const strip = tabStrip.current;
    const active = strip?.querySelector<HTMLElement>('.active');
    if (!strip || !active) return;
    const viewport = strip.getBoundingClientRect();
    const tab = active.getBoundingClientRect();
    if (tab.left < viewport.left) strip.scrollLeft += tab.left - viewport.left - 8;
    else if (tab.right > viewport.right) strip.scrollLeft += tab.right - viewport.right + 8;
  }, [rightView, tabs, taskAssetsOpen]);
  const closeSummary = () => { setSummaryOpen(false); summaryToggle.current?.focus(); };
  const openArtifact = (artifact: AgentArtifact) => {
    activate(artifact.id);
    if ((output.current?.clientWidth || 1200) <= 720) setSummaryOpen(false);
  };
  const openCanvas = () => { activate('canvas'); if ((output.current?.clientWidth || 1200) <= 720) setSummaryOpen(false); };

  useEffect(() => {
    if (!taskAssetsOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = taskAssetsPanel.current;
    panel?.focus({ preventScroll: true });
    return () => {
      if ((document.activeElement === document.body || panel?.contains(document.activeElement)) && previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [taskAssetsOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (modelMenu) { setModelMenu(false); modelToggle.current?.focus(); return; }
      if (preferencesOpen) { setPreferencesOpen(false); preferencesToggle.current?.focus(); return; }
      if (taskAssetsOpen) { closeTaskAssets.current(); return; }
      setModelMenu(false);
      setTabMenu(false);
      if (summaryOpen) { setSummaryOpen(false); summaryToggle.current?.focus(); }
    };
    const onOutsideInteraction = (event: PointerEvent | FocusEvent) => {
      if (preferencesOpen && event.target instanceof Node && !preferencesPanel.current?.contains(event.target) && !preferencesToggle.current?.contains(event.target)) setPreferencesOpen(false);
      if (modelMenu && event.target instanceof Node && !modelPicker.current?.contains(event.target)) setModelMenu(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onOutsideInteraction);
    window.addEventListener('focusin', onOutsideInteraction);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('pointerdown', onOutsideInteraction); window.removeEventListener('focusin', onOutsideInteraction); };
  }, [summaryOpen, preferencesOpen, taskAssetsOpen, modelMenu]);
  useEffect(() => {
    if (!modelMenu) return;
    const selected = modelPicker.current?.querySelector<HTMLElement>('.iua-model-option[aria-pressed="true"]') || modelPicker.current?.querySelector<HTMLElement>('.iua-model-option');
    selected?.focus();
    return () => {
      if (document.activeElement === document.body || modelPicker.current?.contains(document.activeElement)) modelToggle.current?.focus();
    };
  }, [modelMenu]);
  useEffect(() => {
    if (preferencesOpen) preferencesPanel.current?.querySelector<HTMLElement>('select:not(:disabled), button')?.focus();
  }, [preferencesOpen]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const path = `/api/projects/${project.id}/agent`;
    let liveRevision = 0;
    const loadHistory = async () => {
      const revision = liveRevision;
      try {
        const state = await api<AgentState>(path, { signal: controller.signal });
        if (cancelled) return;
        if (revision === liveRevision) setAgent(state);
        setHistoryLoaded(true); setHistoryError('');
      } catch (failure) {
        if (!cancelled && liveRevision === 0) setHistoryError(failure instanceof Error ? failure.message : '对话加载失败，请刷新重试。');
      }
    };
    void loadHistory();
    const connect = async () => {
      try {
        const session = supabase ? (await supabase.auth.getSession()).data.session : null;
        const response = await fetch(`${path}/events`, { signal: controller.signal, headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} });
        if (!response.ok || !response.body) throw new Error('无法连接实时对话，请刷新或稍后重试。');
        if (cancelled) return;
        setConnected(true);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!cancelled) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          let index: number;
          while ((index = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, index); buffer = buffer.slice(index + 2);
            const data = frame.split('\n').find(line => line.startsWith('data: '));
            if (data && !cancelled) {
              const state = JSON.parse(data.slice(6)) as AgentState;
              liveRevision++; setAgent(state); setHistoryLoaded(true); setHistoryError('');
            }
          }
        }
      } catch { /* The next connection starts with the full saved/live state. */ }
      if (!cancelled) { setConnected(false); void loadHistory(); retry = setTimeout(() => void connect(), 2000); }
    };
    void connect();
    return () => { cancelled = true; controller.abort(); clearTimeout(retry); };
  }, [project.id]);
  useEffect(() => { onCanvasState(agent.canvasComponents || []); }, [agent.canvasComponents, onCanvasState]);
  useEffect(() => { setModelDraft(agent.model || DEFAULT_AGENT_MODEL); }, [agent.model]);
  useEffect(() => { void api<{ model: string; displayName?: string }[]>(`/api/projects/${project.id}/agent/models`).then(setModels).catch(() => {}); }, [project.id]);
  useEffect(() => {
    if (scroll.current && nearBottom.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages, agent.activity, sending]);
  const hasRunningMedia = Boolean(project.agentImages?.some(image => image.status === 'running') || project.generatedVideos.some(video => video.status === 'running'));
  useEffect(() => {
    let cancelled = false;
    const refresh = () => void api<Project>(`/api/projects/${project.id}`).then(fresh => { if (!cancelled) onProjectUpdateRef.current(fresh); }).catch(() => {});
    refresh();
    const timer = agent.status === 'running' || hasRunningMedia ? setInterval(refresh, 3000) : undefined;
    return () => { cancelled = true; clearInterval(timer); };
  }, [agent.status, project.id, hasRunningMedia]);

  const updateQueue = async (suffix: string, method: 'POST' | 'PATCH' | 'DELETE', body?: { prompt?: string; expectedTurnId?: string }) => {
    if (queueDisabled || queueSavingRef.current || sendingRef.current || media.busy.current || preferenceSavingRef.current) return false;
    queueSavingRef.current = true; setQueueSaving(true); setError('');
    try {
      await api<AgentState>(`/api/projects/${project.id}/agent/queue${suffix}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      try { setAgent(await api<AgentState>(`/api/projects/${project.id}/agent`)); }
      catch { /* The queue was saved; SSE restores the latest state on reconnect. */ }
      return true;
    } catch (failure) { setError(failure instanceof Error ? failure.message : '队列更新失败，请重试。'); return false; }
    finally { queueSavingRef.current = false; setQueueSaving(false); }
  };
  const queueDraft = async () => {
    const text = draft;
    if (!text.trim()) return;
    if (!steering && media.attachments.length) { setError('队列仅支持文字，请先发送或移除附件。'); return; }
    if (await updateQueue('', 'POST', { prompt: text })) setDraft(current => current === text ? '' : current);
  };
  const send = async (text: string) => {
    const attachments = steering ? [] : media.attachments.slice();
    const prompt = text.trim() ? text : attachments.length ? '请查看附件中的参考素材。' : '';
    if (!prompt.trim() || sendDisabled || media.busy.current || sendingRef.current || queueSavingRef.current || preferenceSavingRef.current) return;
    const images = attachments.filter(asset => asset.kind === 'product');
    const videos = attachments.filter(asset => asset.kind === 'video');
    const attachmentOrder = attachments.map(asset => asset.id);
    sendingRef.current = true; setSending(true); setError(''); nearBottom.current = true;
    const createdAt = new Date().toISOString();
    setPendingUser({ id: `pending:${crypto.randomUUID()}`, role: 'user', text: prompt, createdAt, images, videos, attachmentOrder, attachmentsSent: false, work: createAgentWork(createdAt), afterCount: agent.messages.length });
    try {
      if (!steering) await onBeforeSend();
      await api<AgentState>(`/api/projects/${project.id}/agent/${steering ? 'steer' : 'turns'}`, { method: 'POST', body: JSON.stringify(steering ? { prompt, expectedTurnId: agent.turnId } : { prompt, imageIds: images.map(image => image.id), videoIds: videos.map(video => video.id), attachmentOrder }) });
      media.markSent(attachmentOrder);
      setDraft(current => current === text ? '' : current);
      // Refresh from the source instead of applying the POST snapshot, which may
      // arrive after newer SSE deltas. On reconnect the same GET recovers history.
      try {
        setAgent(await api<AgentState>(`/api/projects/${project.id}/agent`));
        setPendingUser(null);
      } catch { /* Already accepted: SSE will recover history without resending attachments. */ }
    } catch (failure) { setPendingUser(null); setError(failure instanceof Error ? failure.message : '发送失败，请重试。'); }
    finally { sendingRef.current = false; setSending(false); }
  };
  const submitDraft = () => queueByDefault ? queueDraft() : send(draft);
  const toggleQueuing = () => setQueueEnabled(current => {
    const next = !current;
    try { localStorage.setItem(`sail-agent-queue-enabled:${project.id}`, String(next)); } catch { /* Keep the setting for this page. */ }
    return next;
  });
  const onAction = (event: ActionEvent) => {
    const local = runLibraryAction(event);
    if (local) { void local.then(ok => { if (!ok) setError('复制未成功，请重试。'); }); return; }
    const fields = Object.keys(event.params || {}).length || Object.keys(event.formState || {}).length
      ? `\n${JSON.stringify({ action: event.type, params: event.params, formState: event.formState })}` : '';
    void send(`${event.humanFriendlyMessage || event.type}${fields}`);
  };
  const tools = useMemo(() => Object.fromEntries(
    ['get_creative', 'show_intelligent_ui', 'show_canvas_component', 'analyze_reference', 'generate_image', 'generate_video', 'generate_minimax_video', 'generate_first_last_frame_video', 'recover_video', 'edit_grid_prompt', 'generate_grid_video', 'update_experiment', 'import_experiment_skill', 'bind_experiment_source'].flatMap(name =>
      [name, `sail_creation/${name}`].map(alias => [alias, (args: Record<string, unknown>) => api(`/api/projects/${project.id}/agent/intelligent-tool`, { method: 'POST', body: JSON.stringify({ name, args }) })]),
    ),
  ), [project.id]);
  const latestUser = messages.filter(message => message.role === 'user').at(-1);
  const programs = useMemo(() => agent.messages.flatMap(message => message.role === 'assistant'
    ? parseAgentAnswer(message.text).panels.map((panel, index) => ({ ...panel, id: agentPanelId(message.id, index), messageId: message.id, createdAt: message.createdAt })) : []), [agent.messages]);
  const latestProgram = programs.filter(program => !latestUser || program.createdAt >= latestUser.createdAt).at(-1);
  const currentPanels = programs.filter(program => !latestUser || program.createdAt >= latestUser.createdAt);
  const published = agent.intelligentPanel && (!latestUser || agent.intelligentPanel.createdAt >= latestUser.createdAt) ? agent.intelligentPanel : undefined;
  const shownPanels: (AgentAnswerPanel & { id: string })[] = activeArtifact?.kind === 'ui' && activeArtifact.source
    ? [{ id: activeArtifact.id, format: activeArtifact.format || 'openui', source: activeArtifact.source, complete: activeArtifact.complete ?? true }]
    : latestProgram && (!published || latestProgram.createdAt >= published.createdAt) ? currentPanels
    : published ? [{ ...published, format: 'openui', complete: true }] : [];
  const latestPanelId = latestProgram?.id || published?.id;
  useEffect(() => {
    if (!historyLoaded) return;
    const previous = panelHistory.current;
    panelHistory.current = { loaded: true, id: latestPanelId };
    setPanelError('');
    if (previous.loaded && latestPanelId && latestPanelId !== previous.id) activate('ui', true);
  }, [historyLoaded, latestPanelId]);

  const canvasVersion = agent.canvasComponents?.map(component => component.updatedAt).join('|');
  const previousCanvas = useRef(canvasVersion);
  useEffect(() => { if (canvasVersion && previousCanvas.current !== undefined && previousCanvas.current !== canvasVersion) activate('canvas', true); previousCanvas.current = canvasVersion; }, [canvasVersion]);
  const experimentRevision = agent.experiment?.revision;
  const previousExperiment = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (experimentRevision !== undefined && previousExperiment.current !== undefined && experimentRevision !== previousExperiment.current) activate('lab', true);
    previousExperiment.current = experimentRevision;
  }, [experimentRevision]);
  const changeModel = async (model: string) => {
    if (disabled || running || preferenceSavingRef.current) return;
    preferenceSavingRef.current = true; setModelSaving(true);
    try {
      const state = await api<AgentState>(`/api/projects/${project.id}/agent/model`, { method: 'POST', body: JSON.stringify({ model }) });
      setAgent(current => ({ ...current, model: state.model, effort: state.effort }));
      setModelMenu(false); setError(''); modelToggle.current?.focus();
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : '切换模型失败'); }
    finally { preferenceSavingRef.current = false; setModelSaving(false); }
  };
  const changeAdaptation = async (adaptation: AgentAdaptation) => {
    if (preferenceSavingRef.current || sendingRef.current || agent.status === 'running') return false;
    preferenceSavingRef.current = true; setAdaptationSaving(true); setError('');
    try {
      const state = await api<AgentState>(`/api/projects/${project.id}/agent/adaptation`, { method: 'POST', body: JSON.stringify({ adaptation }) });
      setAgent(current => ({ ...current, adaptation: state.adaptation }));
      return true;
    } catch (failure) { setError(failure instanceof Error ? failure.message : '创作适配未能保存，请重试。'); return false; }
    finally { preferenceSavingRef.current = false; setAdaptationSaving(false); }
  };
  const changePresentation = async (presentation: AgentPresentation) => {
    if (preferenceSavingRef.current || sendingRef.current || agent.status === 'running') return;
    preferenceSavingRef.current = true; setPresentationSaving(true); setError('');
    try {
      const state = await api<AgentState>(`/api/projects/${project.id}/agent/presentation`, { method: 'POST', body: JSON.stringify({ presentation }) });
      setAgent(current => ({ ...current, presentation: state.presentation }));
    } catch (failure) { setError(failure instanceof Error ? failure.message : '结果呈现未能保存，请重试。'); }
    finally { preferenceSavingRef.current = false; setPresentationSaving(false); }
  };

  const renderMedia = (items: AgentMedia[] = []) => items.map(item => <figure className="iua-chat-media" key={item.value.id}>
    {item.value.url ? item.kind === 'image' ? <img src={item.value.url} alt={item.value.prompt} loading="lazy" /> : <video src={item.value.url} controls playsInline preload="metadata" /> : <p>{item.value.status === 'running' ? '媒体正在生成…' : '媒体生成失败，请核对任务状态。'}</p>}
    <button type="button" onClick={() => { activate(`${item.kind}:${item.value.id}`); }}>查看创作产物</button>
  </figure>);
  return <section className="intelligent-agent" data-workspace-background={theme.preferences.workspaceBackground ? 'on' : 'off'} aria-label="Open Intelligent UI 创作工作区">
    <div className={`iua-workspace${split.resizing ? ' is-resizing' : ''}`} ref={split.workspace} style={split.style}>
      <div className="iua-conversation intelligent-ui-surface" data-theme={theme.chatTheme} style={{ ...theme.backgroundStyle, ...theme.chatTextStyle }} ref={split.conversation} id="iua-conversation">
        <div className="iua-messages" ref={scroll} role="log" aria-label="与创作 Agent 的对话" aria-live="polite" onScroll={() => { const el = scroll.current; if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}>
          {!messages.length && <p className="iua-empty">{historyError || (historyLoaded ? '描述你的创作目标，或提出一个问题。' : '正在加载对话记录…')}</p>}
          {!!groupedMedia.get(UNASSIGNED_MEDIA)?.length && <div aria-label="更早的创作产物">
            <p className="iua-message-note">更早的创作产物</p>
            {renderMedia(groupedMedia.get(UNASSIGNED_MEDIA))}
          </div>}
          {messages.map(message => <Fragment key={message.id}><article className={`iua-message iua-message-${message.role}`}>
            {message.role === 'user' ? <>
              {(!!message.images?.length || !!message.videos?.length) && <div className="iua-user-attachments" role="group" aria-label="本条消息的附件"><AgentMessageAttachments message={message} /></div>}
              {!!message.text.trim() && <div className="iua-user-bubble"><ConversationText message={message} onOpenUI={index => activate(agentPanelId(message.id, index))} /></div>}
              {renderMedia(groupedMedia.get(message.id))}
            </> : <>
              <ConversationText message={message} onOpenUI={index => activate(agentPanelId(message.id, index))} />
              {renderMedia(groupedMedia.get(message.id))}
              <AgentMessageAttachments message={message} />
            </>}
          </article>{message.role === 'user' && <AgentWorkSummary work={workHistory.get(message.id)!} />}</Fragment>)}
          {(error || agent.error) && <p className="iua-error" role="alert">{error || agent.error}</p>}
        </div>
        <div className="iua-composer-area">
          <AgentQueuedMessages messages={queuedMessages} paused={!!agent.queuePaused} disabled={queueDisabled} canSteer={steering && !!agent.turnId} queueEnabled={queueEnabled} onResume={() => updateQueue('/resume', 'POST')} onRemove={id => updateQueue(`/${encodeURIComponent(id)}`, 'DELETE')} onSteer={id => updateQueue(`/${encodeURIComponent(id)}/steer`, 'POST', { expectedTurnId: agent.turnId })} onEdit={(id, text) => updateQueue(`/${encodeURIComponent(id)}`, 'PATCH', { prompt: text })} onAdd={text => updateQueue('', 'POST', { prompt: text })} onToggleQueue={toggleQueuing} />
          <form className="iua-composer" data-custom-surface={theme.preferences.surfaces.composer.enabled ? 'on' : 'off'} style={theme.surfaceStyle('composer')} onSubmit={event => { event.preventDefault(); void submitDraft(); }} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = mediaDisabled ? 'none' : 'copy'; } }} onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); media.upload(Array.from(event.dataTransfer.files)); } }} onPaste={event => { if (event.clipboardData.files.length) { if (!event.clipboardData.getData('text/plain')) event.preventDefault(); media.upload(Array.from(event.clipboardData.files)); } }}>
            {canvasDraft && <div className="iua-canvas-draft"><span>{canvasDraft.text}</span><button type="button" onClick={() => { setDraft(canvasDraft.text); onCanvasDraftConsumed(); }}>填入输入框</button></div>}
            <input ref={mediaInput} type="file" accept={promptMediaAccept} multiple hidden aria-label="添加图片或视频附件" disabled={mediaDisabled} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; media.upload(files); }} />
            <AgentPromptMedia assets={media.attachments} pending={media.pending} disabled={mediaDisabled} onRemove={media.remove} />
            <textarea ref={composerText} aria-label="发送给创作 Agent 的消息" aria-description={queueByDefault ? 'Enter 加入队列，Alt + Enter 立即调整，Shift + Enter 换行' : steering ? 'Enter 立即调整，Alt + Enter 加入队列，Shift + Enter 换行' : 'Enter 发送，Shift + Enter 换行'} placeholder={queueByDefault ? '继续输入，消息将在当前任务结束后发送…' : steering ? '补充要求，立即调整当前任务…' : '描述你想创作的图片、视频，或直接提问…'} maxLength={6000} rows={3} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (steering && (queueEnabled ? !event.altKey : event.altKey)) void queueDraft(); else void send(draft); } }} />
            <div className="iua-composer-actions">
              <button type="button" className="iua-attach-button" aria-label={media.working ? '正在处理附件' : '添加图片或视频'} title="添加图片或视频，也可拖入或粘贴" disabled={mediaDisabled} onClick={() => mediaInput.current?.click()}>{media.working ? <LoaderCircle size={18} className="spin" /> : <Plus size={20} />}</button>
              <button type="button" className="iua-preferences-toggle" ref={preferencesToggle} aria-label={`回答设置，${preferencesTitle}`} title={preferencesTitle} aria-expanded={preferencesOpen} aria-controls={preferencesId} onClick={() => { setPreferencesOpen(open => !open); setModelMenu(false); }}><SlidersHorizontal size={16} aria-hidden="true" /><span>回答设置</span></button>
              {!connected && <span role="status">正在重新连接…</span>}
              <div className="iua-model-picker" ref={modelPicker}><button type="button" ref={modelToggle} disabled={disabled || running || adaptationSaving || presentationSaving || modelSaving} title={currentModel} aria-label="选择 Agent 模型" aria-expanded={modelMenu} aria-controls={modelMenuId} aria-haspopup="dialog" onClick={() => { setModelMenu(open => !open); setPreferencesOpen(false); }}><span>{currentModelLabel}</span><small>{agent.effort || 'high'}</small>{modelSaving ? <LoaderCircle size={13} className="spin" /> : <ChevronDown size={13} />}</button>
                {modelMenu && <div className="iua-menu iua-model-menu" id={modelMenuId} role="dialog" aria-label="选择 Agent 模型" aria-busy={modelSaving}>
                  <header><span>选择模型</span><small>{agent.effort || 'high'}</small></header>
                  <div className="iua-model-options" role="group" aria-label="可用模型">{modelOptions.map(model => <button type="button" className="iua-model-option" key={model.model} disabled={modelSaving} aria-pressed={model.model === currentModel} title={model.model} onClick={() => void changeModel(model.model)}><span><strong>{model.label}</strong>{model.label !== model.model && <small data-no-i18n>{model.model}</small>}</span>{model.model === currentModel && <Check size={16} aria-hidden="true" />}</button>)}</div>
                  <div className="iua-model-custom"><label htmlFor={modelInputId}>自定义模型</label><div><input id={modelInputId} aria-label="自定义模型名称" placeholder="输入模型 ID" autoComplete="off" disabled={modelSaving} value={modelDraft} onChange={event => setModelDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); if (modelDraft.trim()) void changeModel(modelDraft.trim()); } }} /><button type="button" disabled={modelSaving || !modelDraft.trim()} onClick={() => void changeModel(modelDraft.trim())}>使用此模型</button></div></div>
                </div>}
              </div>
              {steering && <button type="button" className="iua-composer-secondary" aria-label={queueByDefault ? '立即调整（Alt + Enter）' : '加入队列（Alt + Enter）'} title={queueByDefault ? '立即调整（Alt + Enter）' : '加入队列（Alt + Enter）'} disabled={(queueByDefault ? sendDisabled : queueDisabled) || !draft.trim()} onClick={() => { if (queueByDefault) void send(draft); else void queueDraft(); }}>{queueByDefault ? <CornerUpRight size={17} /> : <ListPlus size={18} />}<span>{queueByDefault ? 'Steer' : '排队'}</span></button>}
              {running && <button type="button" className="iua-stop-button" aria-label="停止生成" title="停止生成" disabled={!agent.turnId} onClick={() => void api(`/api/projects/${project.id}/agent/interrupt`, { method: 'POST' }).catch(failure => setError(failure.message))}><Square size={15} fill="currentColor" /></button>}
              <button type="submit" aria-label={queueByDefault ? '加入队列（Enter）' : steering ? '立即调整（Enter）' : '发送消息'} title={queueByDefault ? '加入队列（Enter）' : steering ? '立即调整（Enter）' : '发送消息'} disabled={queueByDefault ? queueDisabled || !draft.trim() : sendDisabled || (!draft.trim() && (steering || !media.attachments.length))}>{sending || queueSaving ? <LoaderCircle size={19} className="spin" /> : queueByDefault ? <ListPlus size={19} /> : steering ? <CornerUpRight size={19} /> : <ArrowUp size={19} />}</button>
            </div>
          </form>
        </div>
        {preferencesOpen && <div className="iua-preferences-panel" id={preferencesId} ref={preferencesPanel} role="region" aria-labelledby={`${preferencesId}-title`}>
            <header><strong id={`${preferencesId}-title`}>回答设置</strong><button type="button" className="iua-icon-button iua-preferences-close" aria-label="收起回答设置" onClick={() => { setPreferencesOpen(false); preferencesToggle.current?.focus(); }}><X size={16} aria-hidden="true" /></button></header>
            <p className="iua-preferences-description">保存后，对后续发送的消息生效。</p>
            <AgentPresentationControl value={presentation} disabled={disabled || running || adaptationSaving || !historyLoaded} saving={presentationSaving} onChange={value => { void changePresentation(value); }} />
            <AgentAdaptationControl value={adaptation} disabled={disabled || running || presentationSaving || !historyLoaded} saving={adaptationSaving} onChange={changeAdaptation} />
        </div>}
      </div>
      <div className="iua-resizer intelligent-ui-surface" data-theme={theme.chatTheme} style={theme.backgroundStyle} role="separator" aria-label="调整对话与工作区宽度" aria-orientation="vertical" aria-controls="iua-conversation" aria-valuemin={split.bounds.minimum} aria-valuemax={split.bounds.maximum} aria-valuenow={split.bounds.width} aria-valuetext={`对话区宽度 ${split.bounds.width} 像素`} title="左右拖拽调整宽度，双击恢复默认" tabIndex={0} {...split.separator} />
      <div className="iua-output intelligent-ui-surface" data-theme={theme.resultsTheme} style={{ ...theme.backgroundStyle, ...theme.resultsTextStyle }} ref={output}>
        <header className="iua-output-toolbar"><button type="button" className="iua-icon-button iua-summary-toggle" ref={summaryToggle} title="Toggle summary" aria-label={summaryOpen ? '收起产物' : '展开产物'} aria-expanded={!taskAssetsOpen && summaryOpen} aria-controls="iua-artifact-summary" onClick={() => { closeTaskAssets.current(); setSummaryOpen(open => !open); }}><ListFilter size={19} aria-hidden="true" /></button>
          <button type="button" className={`iua-task-assets-tab${taskAssetsOpen ? ' active' : ''}`} aria-pressed={taskAssetsOpen} aria-controls="iua-task-assets" title="任务素材" onClick={openTaskAssets}><Package size={15} aria-hidden="true" /><span>任务素材</span><span className="iua-tab-count">{taskAssetCount}</span></button>
          <nav className="iua-tabs" ref={tabStrip} aria-label="右侧工作区标签页">{tabs.map(tab => {
          const artifact = artifacts.find(item => item.id === tab);
          const title = tab === 'lab' ? '创作实验台' : tab === 'canvas' ? '视频画布' : tab === 'ui' ? '生成结果' : artifact?.title || '产物';
          return <div className={!taskAssetsOpen && rightView === tab ? 'active' : ''} key={tab}><button type="button" className="iua-tab-title" aria-pressed={!taskAssetsOpen && rightView === tab} title={title} onClick={() => activate(tab)}>{artifact && <AgentArtifactIcon kind={artifact.kind} />}<span>{title}</span></button><button type="button" className="iua-tab-close" aria-label={`关闭${title}`} onClick={() => closeTab(tab)}><X size={14} /></button></div>;
        })}</nav><div className="iua-tab-add"><button type="button" className="iua-icon-button" aria-label="添加标签页" aria-expanded={tabMenu} onClick={() => setTabMenu(open => !open)}><Plus size={19} /></button>{tabMenu && <div className="iua-menu"><button type="button" onClick={() => activate('lab')}>创作实验台</button><button type="button" onClick={() => activate('canvas')}>视频画布</button><button type="button" onClick={() => activate('ui')}>生成结果</button><button type="button" onClick={() => { closeTaskAssets.current(); setSummaryOpen(true); setTabMenu(false); }}>打开产物列表</button></div>}</div></header>
        <div className="iua-task-assets-panel" id="iua-task-assets" ref={taskAssetsPanel} hidden={!taskAssetsOpen} tabIndex={-1} role="region" aria-label="任务素材"><AgentTaskAssets artifacts={artifacts} active={taskAssetsOpen} onOpen={openArtifact} onClose={tabs.length ? onCloseTaskAssets : undefined} /></div>
        <div className="iua-output-body" hidden={taskAssetsOpen}>
          {summaryOpen && <AgentArtifacts artifacts={artifacts} activeId={rightView} onOpen={openArtifact} onCanvas={openCanvas} onClose={closeSummary} />}
          <div className="iua-panels">
            <div className="iua-experiment-tab" hidden={rightView !== 'lab' || !tabs.includes('lab')}><ExperimentWorkbench project={project} graph={agent.experiment} onGraph={experiment => setAgent(current => ({ ...current, experiment }))} onDraft={text => setDraft(text)} disabled={disabled || !historyLoaded} active={rightView === 'lab'} /></div>
            <div className="iua-generated" hidden={(rightView !== 'ui' && activeArtifact?.kind !== 'ui') || !tabs.includes(rightView)} onClick={event => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
              const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-iui-media]');
              const artifact = link && artifacts.find(artifact => artifact.url === link.getAttribute('href') && artifact.kind === 'image');
              if (artifact) { event.preventDefault(); openArtifact(artifact); }
            }}>
              {shownPanels.length ? shownPanels.map(panel => {
                const streaming = agent.status === 'running' && currentPanels.some(current => current.id === panel.id);
                return <section className="iua-generated-panel" key={panel.id} aria-label={panel.format === 'html' ? htmlPageTitle(panel.source) : '组件界面'}><PanelBoundary>
                  {panel.format === 'html' ? panel.complete
                    ? <SandboxedHtml html={panel.source} title={htmlPageTitle(panel.source)} streaming={streaming} />
                    : <p className="iua-message-note" role="status">{streaming ? '正在生成 HTML 页面…' : 'HTML 页面尚未生成完整，请让 Agent 继续完成。'}</p>
                    : <Renderer response={panel.source} library={library} isStreaming={streaming} toolProvider={tools} onAction={onAction} onError={failure => { if (!streaming) setPanelError(failure.map(item => item.message).join('；')); }} />}
                </PanelBoundary></section>;
              }) : <p className="iua-empty">{running ? '正在准备回答，生成结果会显示在这里。' : '组件界面、HTML 页面和混合结果会显示在这里。'}</p>}
              {panelError && <p className="iua-error" role="alert">界面生成有误：{panelError}</p>}
            </div>
            <div className="iua-canvas-tab" hidden={rightView !== 'canvas' || !tabs.includes('canvas')}><div className="iua-canvas">{canvas}</div></div>
            {activeArtifact && activeArtifact.kind !== 'ui' && <AgentArtifactPreview key={activeArtifact.id} artifact={activeArtifact} onOpen={activate} onLoadVideo={loadVideoDetails} disabled={disabled || running} onRecreate={video => { setDraft(current => [current.trim(), recreateVideoDraft(video)].filter(Boolean).join("\n\n")); composerText.current?.focus({ preventScroll: true }); }} />}
            {tabs.includes(rightView) && !['lab', 'ui', 'canvas'].includes(rightView) && !activeArtifact && <p className="iua-empty">这份产物已不在当前创意中，可以关闭标签页并从产物列表重新选择。</p>}
            {!tabs.length && <p className="iua-empty">点击 + 打开工作区标签页。</p>}
          </div>
        </div>
      </div>
    </div>
  </section>;
}
