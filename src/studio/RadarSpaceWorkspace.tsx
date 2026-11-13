import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Activity, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Bookmark, CalendarDays, Check, ChevronDown, ChevronRight, Copy, Download, Ellipsis, Expand, ExternalLink, FileText, FolderOpen, History, ImagePlus, Layers3, LoaderCircle, MessageCircle, Minimize2, PanelLeftClose, Pencil, Plus, Radar, Radio, RefreshCw, ScanSearch, Settings2, SlidersHorizontal, Square, Upload, X, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, downloadBlob } from '../api';
import { RADAR_KINDS, RADAR_WORKFLOWS, formatRadarCount, type RadarInput, type RadarRun, type RadarSourceStatus, type RadarWorkflow, type ScoredRadarItem } from '../../shared/radar';
import type { AgentMessageImage, AgentWork } from '../../shared/agent-message';
import type { RadarSpaceState } from '../../shared/radar-space';
import { bookmarkRadarItem, radarConfig, radarLibrary, radarRuns, type RadarRunSummary } from './studioApi';
import SpaceCanvas, { type SpaceCanvasSettings, type SpaceNode } from './space-ui/SpaceCanvas';
import SpaceDialog from './space-ui/SpaceDialog';
import RadarCommands, { type RadarButtonAction } from './space-ui/RadarCommands';
import { SPACE_API, useRadarSpace } from './space-ui/useRadarSpace';
import './space-ui/shell.css';
import './space-ui/radar-space.css';

const avatar = '/studio/space-ui/agent-radar.png';
const workflowIcons = { top: Layers3, product: ScanSearch, breakout: Activity, resonance: Radio, calendar: CalendarDays };
const defaultSettings = { showGrid: true, snapToGrid: false, focusSelected: false, focusNew: false, showExecution: true, enterForNewline: false, fontSize: 15 };
const initialScope: RadarInput = { workflow: 'top', query: '', platforms: ['Google Trends', 'Google News', 'TikTok', 'X', 'YouTube', 'Amazon', 'RSSHub'], region: 'US', days: 7, category: '全部领域', kind: 'all' };
type Modal = 'history' | 'sources' | 'settings' | 'rename' | 'references' | null;
type SavedWorkspace = NonNullable<RadarSpaceState['workspace']>;

function IconButton({ title, children, active, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { title: string; active?: boolean }) {
  return <button type="button" title={title} aria-label={title} className={`icon-button ${active ? 'active' : ''} ${className}`} {...props}>{children}</button>;
}
function AgentAvatar() { return <img className="agent-avatar" src={avatar} alt="" />; }
function Markdown({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a> }}>{children}</ReactMarkdown>;
}
function sourceUrl(value?: string) {
  try { const url = new URL(value || ''); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}
function Thumb({ src, title }: { src?: string; title: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && sourceUrl(src) && !failed ? <img className="rs-result-image" src={src} alt={title} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : null;
}
function WorkDetails({ work, activity }: { work: AgentWork; activity?: string }) {
  const seconds = Math.max(0, Math.round(((work.finishedAt ? Date.parse(work.finishedAt) : Date.now()) - Date.parse(work.startedAt)) / 1000));
  const label = work.status === 'running' ? activity || '正在研究…' : work.status === 'completed' ? `研究完成 · ${seconds} 秒` : work.status === 'interrupted' ? '研究已停止' : '本轮执行未完成';
  return <details className="rs-work-detail"><summary>{work.status === 'running' ? <LoaderCircle size={13} className="spin" /> : <Check size={13} />}<span>{label}</span><ChevronDown size={12} /></summary><div className="execution-detail">{work.steps.map((step, index) => <span key={`${step.at}-${index}`}><small>{new Date(step.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</small>{step.label}</span>)}</div></details>;
}
function signalNodes(run: RadarRun | null, agent: RadarSpaceState, columns: number): SpaceNode[] {
  const nodes: SpaceNode[] = (run?.items || []).slice(0, 180).map((item, index) => ({ id: `signal:${item.id}`, type: 'result', name: item.title.slice(0, 500), description: item.excerpt || '', x: 20 + index % columns * 390, y: 20 + Math.floor(index / columns) * 565, width: 366, item, runId: run!.id }));
  for (const [index, event] of (agent.calendar?.events || []).entries()) nodes.push({ id: `event:${event.id}`, type: 'event', name: event.name, description: event.angle, x: 20 + index % columns * 390, y: 20 + Math.floor(index / columns) * 290, width: 366, event });
  const markdown = agent.report?.markdown || run?.report;
  if (markdown) nodes.push({ id: 'research-report', type: 'report', name: agent.report?.title || '热点研究报告', description: '', x: 20, y: 20, width: Math.min(780, Math.max(366, columns * 390 - 24)), markdown });
  return nodes;
}

/** Shell DOM/classes, composer and floating-panel behavior follow the supplied App.jsx. */
export default function RadarSpaceWorkspace({ onBackWorkspace, onHome, onOpenTasks, initialWorkflow = 'top' }: { onBackWorkspace: () => void; onHome: () => void; onOpenTasks: () => void; initialWorkflow?: RadarWorkflow }) {
  const space = useRadarSpace();
  const { agent, busy } = space;
  const [scope, setScope] = useState<RadarInput>({ ...initialScope, workflow: initialWorkflow });
  const [input, setInput] = useState(''), [attached, setAttached] = useState<AgentMessageImage[]>([]), [uploading, setUploading] = useState(false);
  const [nodes, setNodes] = useState<SpaceNode[]>([]), [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'canvas' | 'list'>('canvas'), [collapsed, setCollapsed] = useState(false), [chatWide, setChatWide] = useState(false);
  const [settings, setSettings] = useState<Record<string, boolean | number>>(defaultSettings), [hiddenIds, setHiddenIds] = useState<string[]>([]), [candidates, setCandidates] = useState<string[]>([]);
  const [compact, setCompact] = useState(false), [reportView, setReportView] = useState(false), [onlySaved, setOnlySaved] = useState(false), [sort, setSort] = useState<'heat' | 'potential' | 'recent'>('heat'), [layoutRevision, setLayoutRevision] = useState(0);
  const [run, setRun] = useState<RadarRun | null>(null), [runLoading, setRunLoading] = useState(false), [bookmarks, setBookmarks] = useState<string[]>([]);
  const [records, setRecords] = useState<RadarRunSummary[]>([]), [sources, setSources] = useState<RadarSourceStatus[]>([]), [modalLoading, setModalLoading] = useState(false);
  const [modal, setModal] = useState<Modal>(null), [menu, setMenu] = useState(''), [rename, setRename] = useState(''), [toast, setToast] = useState(''), [saveStatus, setSaveStatus] = useState('已保存');
  const rootRef = useRef<HTMLDivElement>(null), commandsRef = useRef<HTMLDivElement>(null), chatRef = useRef<HTMLDivElement>(null), inputRef = useRef<HTMLTextAreaElement>(null), uploadRef = useRef<HTMLInputElement>(null);
  const hydrated = useRef(''), loadedRun = useRef(''), activeId = useRef(''), hiddenRef = useRef(hiddenIds), pendingWorkspace = useRef<SavedWorkspace | null>(null), savedJson = useRef('');
  const saveChain = useRef(Promise.resolve()), toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), stickToBottom = useRef(true);
  activeId.current = agent?.id || ''; hiddenRef.current = hiddenIds;
  const notify = useCallback((text: string) => { setToast(text); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 3200); }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    if (!agent || hydrated.current === agent.id) return;
    const saved = agent.workspace;
    hydrated.current = agent.id; loadedRun.current = ''; pendingWorkspace.current = null; savedJson.current = saved ? JSON.stringify(saved) : '';
    setNodes(saved?.nodes || []); setHiddenIds(saved?.hiddenIds || []); hiddenRef.current = saved?.hiddenIds || [];
    setCandidates(saved?.candidates || []); setViewMode(saved?.viewMode || 'canvas'); setCollapsed(saved?.collapsed || false); setChatWide(saved?.chatWide || false);
    setSettings({ ...defaultSettings, ...saved?.settings }); setScope(agent.scope); setRun(null); setReportView(false); setOnlySaved(false); setSelectedNode(null); setAttached([]); setInput(''); setSaveStatus('已保存');
    stickToBottom.current = true;
  }, [agent?.id]);
  const serverScope = JSON.stringify(agent?.scope);
  useEffect(() => { if (agent?.scope) setScope(agent.scope); }, [agent?.id, serverScope]);
  useEffect(() => {
    if (!agent) return;
    const controller = new AbortController(), id = agent.id, runId = agent.activeRunId;
    if (!runId) { setRun(null); loadedRun.current = id; return; }
    setRunLoading(true);
    void api<RadarRun>(`${SPACE_API}/${id}/results/${runId}`, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted && activeId.current === id) { loadedRun.current = id; setRun(value); }
    }).catch(error => { if (!controller.signal.aborted) space.setError(error instanceof Error ? error.message : '研究结果无法读取'); }).finally(() => { if (!controller.signal.aborted) setRunLoading(false); });
    return () => controller.abort();
  }, [agent?.id, agent?.activeRunId]);
  useEffect(() => {
    if (!agent || (agent.activeRunId && (!run || run.id !== agent.activeRunId))) return;
    const columns = Math.max(1, Math.min(3, Math.floor((window.innerWidth - 590) / 390)));
    const generated = signalNodes(run, agent, columns), byId = new Map(generated.map(node => [node.id, node]));
    setNodes(previous => {
      const old = new Map(previous.map(node => [node.id, node]));
      const auto = generated.filter(node => !hiddenRef.current.includes(node.id)).map(node => { const layout = old.get(node.id); return { ...node, ...(layout ? { x: layout.x, y: layout.y, width: layout.width, height: layout.height } : {}) }; });
      const custom = previous.flatMap(node => {
        if (['note', 'frame'].includes(node.type)) return [node];
        const original = node.sourceId && byId.get(node.sourceId);
        return original && !byId.has(node.id) ? [{ ...original, ...node, item: original.item, event: original.event, markdown: original.markdown }] : [];
      });
      return [...auto, ...custom].slice(0, 250);
    });
  }, [agent?.id, run, agent?.calendar?.updatedAt, agent?.report?.updatedAt, layoutRevision]);

  useEffect(() => {
    if (!agent || hydrated.current !== agent.id || runLoading || (agent.activeRunId && loadedRun.current !== agent.id)) return;
    const workspace: SavedWorkspace = { nodes: nodes.map(({ id, type, name, description, x, y, width, height, sourceId }) => ({ id, type, name: name.slice(0, 500), description: description.slice(0, 12000), x, y, width, ...(height ? { height } : {}), ...(sourceId ? { sourceId } : {}) })), hiddenIds, viewMode, collapsed, chatWide, settings, candidates };
    pendingWorkspace.current = workspace;
    const json = JSON.stringify(workspace), id = agent.id;
    if (json === savedJson.current) return;
    const timer = setTimeout(() => {
      setSaveStatus('保存中…');
      saveChain.current = saveChain.current.catch(() => {}).then(async () => {
        await api(`${SPACE_API}/${id}/workspace`, { method: 'PATCH', body: json, keepalive: true });
        if (activeId.current === id) { savedJson.current = json; setSaveStatus('已保存'); }
      }).catch(() => { if (activeId.current === id) setSaveStatus('布局保存失败'); });
    }, 700);
    return () => clearTimeout(timer);
  }, [agent?.id, nodes, hiddenIds, viewMode, collapsed, chatWide, settings, candidates, runLoading]);
  useEffect(() => {
    const resize = () => { if (rootRef.current && commandsRef.current) rootRef.current.style.setProperty('--rs-content-top', `${commandsRef.current.offsetTop + commandsRef.current.offsetHeight + 18}px`); };
    const observer = new ResizeObserver(resize); if (commandsRef.current) observer.observe(commandsRef.current); resize(); return () => observer.disconnect();
  }, [collapsed, chatWide, space.loading]);
  useEffect(() => { if (stickToBottom.current) chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight }); }, [agent?.messages, agent?.activity]);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!(event.target as Element).closest('[data-popover]')) setMenu(''); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(''); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, []);
  useEffect(() => { void radarLibrary().then(value => setBookmarks(value.bookmarks)).catch(() => {}); }, []);

  const openModal = (value: Modal) => {
    setMenu(''); setModal(value);
    if (value === 'rename') setRename(agent?.title || '');
    if (value === 'history') { setModalLoading(true); void Promise.all([space.reloadSessions(), radarRuns().then(setRecords)]).catch(error => space.setError(error.message)).finally(() => setModalLoading(false)); }
    if (value === 'sources') { setModalLoading(true); void radarConfig().then(value => setSources(value.sources)).catch(error => space.setError(error.message)).finally(() => setModalLoading(false)); }
  };
  const flushWorkspace = async () => {
    await saveChain.current;
    if (agent && pendingWorkspace.current) await api(`${SPACE_API}/${agent.id}/workspace`, { method: 'PATCH', body: JSON.stringify(pendingWorkspace.current) });
  };
  const switchSession = async (id?: string) => {
    try { await flushWorkspace(); if (id) await space.openSession(id); else await space.newSession(); setModal(null); setMenu(''); }
    catch { space.setError('布局尚未保存，请稍后重试。'); }
  };
  const send = async (text?: string, nextScope = scope, action = 'research') => {
    if (busy || uploading || !agent) return;
    const prompt = text || input.trim() || (attached.length ? '根据图片中的可见线索进行反向探索，检索相关热点与创作选题。' : '');
    if (!prompt) return;
    if (!nextScope.platforms.length) { space.setError('请至少选择一个研究平台。'); return; }
    stickToBottom.current = true; setMenu('');
    if (await space.send(prompt, nextScope, attached.map(image => image.id), action)) { if (!text) setInput(''); setAttached([]); }
  };
  const act = (action: RadarButtonAction, next = scope) => {
    setReportView(action === 'report');
    const workflow = RADAR_WORKFLOWS.find(item => item.id === next.workflow)!;
    const prompt = action === 'source-check' ? '检查当前筛选平台的数据源可用性，说明可取得的真实指标、缺失项与接入限制。' : action === 'report' ? '请读取本研究已有证据，生成并保存综合研究报告：观察事实、传播机制假设、创作选题、证据缺口与验证方法；重要结论附来源。' : action === 'calendar' ? '查询目标市场未来的节日与营销节点并展示到画布，给出内容准备方向，明确区分规则日期与真实热点。' : `执行「${workflow.name}」${action === 'category' ? `，聚焦「${next.category}」领域` : ''}。${next.query ? `研究主题：${next.query}。` : attached.length ? '从本次附件提取检索线索。' : '按当前条件发现热点；若此方式必须提供主题且上下文没有，请简短询问。'}请调用真实工具，将线索显示到右侧画布，并基于证据给出创作选题。`;
    void send(prompt, next, action);
  };
  const uploadFiles = async (files: File[]) => {
    if (busy || uploading || !files.length) return;
    if (attached.length + files.length > 4) { space.setError('每条消息最多附上 4 张图片。'); return; }
    setUploading(true); setMenu('');
    try { for (const file of files) { const image = await space.upload(file); setAttached(previous => [...previous, image]); } inputRef.current?.focus(); }
    catch (error) { space.setError(error instanceof Error ? error.message : '图片未能上传'); }
    finally { setUploading(false); }
  };
  const toggleBookmark = async (item: ScoredRadarItem) => {
    try { const value = await bookmarkRadarItem(item.id, !bookmarks.includes(item.id)); setBookmarks(value.bookmarks); }
    catch (error) { space.setError(error instanceof Error ? error.message : '收藏未完成'); }
  };
  const exportReport = () => {
    const markdown = agent?.report?.markdown || run?.report;
    if (!markdown) { notify('取得研究证据后即可导出报告'); return; }
    downloadBlob(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), `热点研究-${new Date().toISOString().slice(0, 10)}.md`);
  };
  const visibleNodes = useMemo(() => {
    const filtered = nodes.filter(node => {
      if (node.type === 'report') return reportView;
      if (reportView) return false;
      if (node.type === 'event') return scope.workflow === 'calendar' || !run;
      if (node.item) return (!onlySaved || bookmarks.includes(node.item.id)) && (scope.kind === 'all' || scope.kind === node.item.kind);
      return true;
    });
    return filtered.sort((a, b) => {
      if (!a.item || !b.item) return 0;
      return sort === 'recent' ? (b.item.publishedAt || b.item.capturedAt).localeCompare(a.item.publishedAt || a.item.capturedAt) : (b.item.signal[sort] ?? -1) - (a.item.signal[sort] ?? -1);
    });
  }, [nodes, reportView, scope.workflow, scope.kind, onlySaved, bookmarks, sort, run]);
  const visibleRef = useRef(visibleNodes); visibleRef.current = visibleNodes;
  const changeCanvasNodes: Dispatch<SetStateAction<SpaceNode[]>> = useCallback(change => {
    const current = visibleRef.current, next = typeof change === 'function' ? change(current) : change;
    if (next.length > 250) { notify('当前画布节点已达上限，请新建研究'); return; }
    const shown = new Set(current.map(node => node.id)), remaining = new Set(next.map(node => node.id));
    const removed = current.filter(node => !remaining.has(node.id) && !['note', 'frame'].includes(node.type)).map(node => node.id);
    if (removed.length) setHiddenIds(previous => [...new Set([...previous, ...removed])].slice(-1000));
    setNodes(previous => [...previous.filter(node => !shown.has(node.id)), ...next].slice(0, 250));
  }, [notify]);
  const canvasAction = (action: string, payload: Record<string, unknown> = {}) => {
    if (action === 'researchWorkflow') { const next = { ...scope, workflow: payload.workflow as RadarWorkflow }; setScope(next); act(next.workflow === 'calendar' ? 'calendar' : 'workflow', next); }
    else if (action === 'uploadReference') uploadRef.current?.click();
    else if (action === 'openHistory' || action === 'openLibrary') openModal('history');
    else if (action === 'addNode') {
      const type = payload.type === 'frame' ? 'frame' : 'note';
      setNodes(previous => [...previous, { id: crypto.randomUUID(), type, name: type === 'note' ? '研究笔记' : '选题分组', description: type === 'note' ? '点击记录观察、假设或待验证的问题…' : '双击标题命名分组', x: 30 + previous.length % 3 * 40, y: 40, width: type === 'note' ? 320 : 720, ...(type === 'frame' ? { height: 440 } : {}) }].slice(0, 250));
    } else if (action === 'settings' || action === 'openSettings') openModal('settings');
    else if (action === 'updateSettings') setSettings(previous => ({ ...previous, ...Object.fromEntries(Object.entries(payload).filter((entry): entry is [string, boolean | number] => typeof entry[1] === 'boolean' || typeof entry[1] === 'number')) }));
    else if (action === 'export') exportReport();
  };
  const renderContent = (node: SpaceNode): ReactNode => {
    if (node.type === 'report') return <div className="rs-report" data-native-scroll><div className="rs-report-tools"><span>{agent?.report ? 'Agent 综合报告' : '工具证据报告'}</span><button type="button" onClick={exportReport}><Download size={13} />导出报告</button><button type="button" disabled={busy} onClick={() => act('report')}><Zap size={13} />深入分析</button></div><div className="rs-markdown"><Markdown>{node.markdown || ''}</Markdown></div></div>;
    if (node.event) { const event = node.event; return <div className="rs-event"><span className="rs-event-date"><CalendarDays size={18} />{event.date}<small>{event.daysUntil === 0 ? '今天' : `${event.daysUntil} 天后`}</small></span><p>{event.angle}</p><div className="rs-tags">{event.tags.map(tag => <span key={tag}>{tag}</span>)}</div><small>规则节点 · {event.region} · 热度待验证</small><footer><a href={sourceUrl(event.sourceUrl)} target="_blank" rel="noreferrer">日期来源<ExternalLink size={12} /></a><button type="button" disabled={busy} onClick={() => { const next = { ...scope, workflow: 'resonance' as const, query: event.name }; setScope(next); void send(`围绕 ${event.date} 的「${event.name}」探索创作选题，查询实际需求与讨论证据。`, next, 'calendar-topic'); }}>探索选题<ArrowUpRight size={13} /></button></footer></div>; }
    const item = node.item;
    if (!item) return null;
    const saved = bookmarks.includes(item.id), candidate = candidates.includes(item.id);
    return <div className="rs-signal"><Thumb src={item.thumbnail} title={item.title} /><div className="rs-signal-main"><div className="rs-signal-source"><span><i className={item.platform.toLowerCase().replace(/\s+/g, '-')} />{item.platform}</span><small>{RADAR_KINDS[item.kind]} · {item.provenance === 'demo' ? '示例' : item.provenance === 'import' ? '导入证据' : '实际采集'}</small></div><p className="rs-signal-excerpt">{item.excerpt || item.topic || '打开原始来源查看完整内容。'}</p><div className="rs-signal-scores"><span>热度分位<strong>{item.signal.heat ?? '—'}</strong></span><span>潜力指数<strong>{item.signal.potential ?? '—'}</strong></span><span>跨源印证<strong>{item.signal.crossPlatforms}<small>平台</small></strong></span></div><dl className="rs-metrics">{([['views', '播放'], ['likes', '点赞'], ['comments', '评论'], ['saves', '收藏'], ['shares', '分享'], [item.kind === 'product' ? 'rank' : 'searchVolume', item.kind === 'product' ? '商品排名' : '搜索量']] as const).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{formatRadarCount(item.metrics[key])}</dd></div>)}</dl><details className="rs-evidence" data-native-scroll><summary>证据构成与缺口<ChevronDown size={13} /></summary><div>{item.signal.dimensions.map(dimension => <p key={dimension.key}><strong>{dimension.label} · {dimension.score ?? '待验证'}</strong>{dimension.evidence}</p>)}{item.signal.gaps.length > 0 && <ul>{item.signal.gaps.map(gap => <li key={gap}>{gap}</li>)}</ul>}{item.comments?.length ? <blockquote>{item.comments.slice(0, 3).map((comment, index) => <p key={index}>{comment}</p>)}</blockquote> : null}<small>潜力指数用于同类比较，不代表爆款概率或传播因果。</small></div></details><div className="rs-captured">{item.author && `${item.author} · `}{item.sourceLabel} · 采集于 {new Date(item.capturedAt).toLocaleString('zh-CN')}</div><footer><a href={sourceUrl(item.url)} target="_blank" rel="noreferrer">原始来源<ExternalLink size={12} /></a><IconButton title={saved ? '取消收藏' : '收藏线索'} active={saved} onClick={() => void toggleBookmark(item)}><Bookmark size={14} fill={saved ? 'currentColor' : 'none'} /></IconButton><IconButton title={candidate ? '移出选题候选' : '加入选题候选'} active={candidate} onClick={() => setCandidates(previous => candidate ? previous.filter(id => id !== item.id) : [...previous, item.id])}><Check size={14} /></IconButton><button type="button" disabled={busy} onClick={() => void send(`深入研究这条线索：「${item.title}」（来源 ${item.url}，线索 ID ${item.id}，研究记录 ${node.runId}）。先读取现有报告，区分观察与假设，给出值得创作的具体角度并保存报告。`, scope, 'deepen')}>深入研究<ArrowUpRight size={13} /></button></footer></div></div>;
  };
  const currentWorkflow = RADAR_WORKFLOWS.find(item => item.id === scope.workflow)!;
  const effectiveError = space.error || agent?.error;
  const toggleMenu = (value: string) => setMenu(previous => previous === value ? '' : value);

  return <div ref={rootRef} className={`radar-space ${compact ? 'rs-compact' : ''} ${run && !visibleNodes.length ? 'rs-filter-empty' : ''}`} style={{ '--chat-font': `${settings.fontSize}px` } as CSSProperties}>
    <div className={`studio ${collapsed ? 'chat-collapsed' : ''} ${chatWide ? 'chat-wide' : ''}`}>
      <SpaceCanvas key={agent?.id || 'loading'} nodes={visibleNodes} setNodes={changeCanvasNodes} selectedNode={selectedNode} setSelectedNode={setSelectedNode} viewMode={viewMode} setViewMode={setViewMode} onAction={canvasAction} settings={settings as SpaceCanvasSettings} collapsed={collapsed} renderContent={renderContent} />
      <header className="studio-header"><div className="header-left" data-popover><button type="button" className={`brand-button ${menu === 'home' ? 'is-open' : ''}`} aria-label="爆款工作室菜单" aria-expanded={menu === 'home'} onClick={() => toggleMenu('home')}><span className="oii-logo"><Radar size={23} /><span>雷达</span><span className="logo-dots">••</span></span><ChevronDown size={12} /></button><button type="button" className="project-name" title="重命名研究" disabled={!agent} onClick={() => openModal('rename')}>{agent?.title || '爆款工作室'}</button><IconButton title="更多研究操作" active={menu === 'more'} onClick={() => toggleMenu('more')}><Ellipsis size={19} /></IconButton>
        {menu === 'home' && <div className="dropdown home-dropdown"><button type="button" className="menu-item" onClick={() => void switchSession()}><Plus size={16} /><span>新建研究</span></button><button type="button" className="menu-item" onClick={() => openModal('history')}><History size={16} /><span>研究空间与记录</span></button><div className="menu-line" /><button type="button" className="menu-item" onClick={onBackWorkspace}><ArrowLeft size={16} /><span>返回创意工作台</span></button><button type="button" className="menu-item" onClick={onHome}><FolderOpen size={16} /><span>工作室首页</span></button><button type="button" className="menu-item" onClick={onOpenTasks}><Activity size={16} /><span>任务进度</span></button></div>}
        {menu === 'more' && <div className="dropdown more-dropdown"><button type="button" className="menu-item" onClick={() => openModal('settings')}><Settings2 size={16} /><span>画布与对话设置</span></button><button type="button" className="menu-item" onClick={() => openModal('sources')}><Radio size={16} /><span>数据源与方法</span></button><button type="button" className="menu-item" onClick={() => openModal('rename')}><Pencil size={16} /><span>重命名研究</span></button><button type="button" className="menu-item" onClick={() => { setHiddenIds([]); hiddenRef.current = []; setNodes(previous => previous.filter(node => !node.sourceId)); setLayoutRevision(previous => previous + 1); setMenu(''); }}><RefreshCw size={16} /><span>恢复画布线索</span></button><button type="button" className="menu-item" onClick={exportReport}><Download size={16} /><span>导出研究报告</span></button><button type="button" className="menu-item" disabled={!agent} onClick={() => { downloadBlob(new Blob([JSON.stringify({ session: agent, run, workspace: pendingWorkspace.current }, null, 2)], { type: 'application/json' }), '雷达研究证据.json'); setMenu(''); }}><FileText size={16} /><span>导出研究证据</span></button></div>}
      </div><div className="header-right"><span className="save-indicator"><span className={saveStatus === '保存中…' ? 'saving' : ''} />{saveStatus}</span><button type="button" className="publish-button" onClick={exportReport}><Download size={14} />导出报告</button></div></header>

      {collapsed ? <button type="button" className="reopen-chat" onClick={() => setCollapsed(false)}><AgentAvatar /><span>雷达 Agent</span><ChevronRight size={16} /></button> : <aside className="chat-panel" aria-label="雷达 Agent 对话">
        <div className="chat-header" data-popover><button type="button" className={`apps-button ${menu === 'apps' ? 'active' : ''}`} onClick={() => toggleMenu('apps')}><Zap size={14} />研究</button><button type="button" className="chat-tab" onClick={() => inputRef.current?.focus()}>雷达 Agent</button><span className="header-spacer" /><IconButton title="研究空间与记录" onClick={() => openModal('history')}><Ellipsis size={17} /></IconButton><IconButton title="对话偏好" active={menu === 'preferences'} onClick={() => toggleMenu('preferences')}><SlidersHorizontal size={15} /></IconButton><IconButton title={chatWide ? '还原对话宽度' : '加宽对话'} onClick={() => setChatWide(previous => !previous)}>{chatWide ? <Minimize2 size={15} /> : <Expand size={15} />}</IconButton><IconButton title="收起对话" className="chat-collapse-control" onClick={() => setCollapsed(true)}><PanelLeftClose size={15} /></IconButton>
          {menu === 'apps' && <div className="dropdown apps-dropdown"><span className="dropdown-label">Agent 研究动作</span>{RADAR_WORKFLOWS.map(workflow => { const Icon = workflowIcons[workflow.id]; return <button type="button" key={workflow.id} className="menu-item" disabled={busy} onClick={() => { const next = { ...scope, workflow: workflow.id }; setScope(next); act(workflow.id === 'calendar' ? 'calendar' : 'workflow', next); }}><Icon size={16} /><span>{workflow.name}</span></button>; })}<div className="menu-line" /><button type="button" className="menu-item" disabled={busy} onClick={() => act('source-check')}><Radio size={16} /><span>检查数据源</span></button></div>}
          {menu === 'preferences' && <div className="dropdown confirmations-dropdown"><span className="dropdown-label">对话偏好</span><label className="confirmation-toggle"><span>显示真实执行详情</span><input type="checkbox" checked={Boolean(settings.showExecution)} onChange={event => setSettings(previous => ({ ...previous, showExecution: event.target.checked }))} /></label><label className="confirmation-toggle"><span>Enter 换行<small>开启后使用 ⌘ / Ctrl + Enter 发送</small></span><input type="checkbox" checked={Boolean(settings.enterForNewline)} onChange={event => setSettings(previous => ({ ...previous, enterForNewline: event.target.checked }))} /></label><button type="button" className="quiet-button" onClick={() => openModal('settings')}>全部设置<ArrowUpRight size={12} /></button></div>}
        </div>
        <div className="chat-scroll" ref={chatRef} onScroll={() => { const el = chatRef.current; if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}><div className="ai-notice">基于可追溯证据研究热点 · 数据缺失会明确标注</div>
          {space.loading ? <div className="rs-chat-loading"><LoaderCircle className="spin" size={18} />正在打开研究空间…</div> : !agent ? <div className="rs-chat-loading"><p>研究空间暂时无法打开</p><button type="button" onClick={() => void space.retry()}>重试连接<RefreshCw size={14} /></button></div> : !agent.messages.length && <article className="agent-message rs-welcome"><div className="agent-message-header"><span className="agent-name"><AgentAvatar />雷达 Agent</span><span className="rs-live-label"><i />研究就绪</span></div><div className="agent-copy"><h2>下一条值得做的内容，<br />从一个信号开始。</h2><p>告诉我你关注的主题、商品或创作方向。我会连接可用数据源，查找当下热点、潜力线索与跨平台证据。</p><p>也可以点击右侧的研究方式或分类，直接开始。</p></div><div className="agent-choices">{['发现近 7 天值得跟进的科技内容', '看看美国接下来有哪些内容节点', '检查当前能使用哪些数据源'].map((text, index) => <button type="button" key={text} onClick={() => void send(text, index === 1 ? { ...scope, workflow: 'calendar' } : scope, index === 2 ? 'source-check' : 'research')}>{text}<ArrowUpRight size={13} /></button>)}</div></article>}
          {agent?.messages.map(message => message.role === 'event' ? <div className="handoff-event" key={message.id}><History size={13} />{message.text}</div> : message.role === 'user' ? <Fragment key={message.id}><div className="user-message">{message.images?.map(image => <img key={image.id} src={image.url} alt={image.name} />)}<span>{message.text}</span></div>{message.work && settings.showExecution && <WorkDetails work={message.work} activity={agent.activity} />}</Fragment> : <article key={message.id} className="agent-message"><div className="agent-message-header"><span className="agent-name"><AgentAvatar />雷达 Agent</span>{message.phase === 'commentary' && <span className="rs-message-phase">研究进展</span>}</div><div className="agent-copy rs-markdown"><Markdown>{message.text}</Markdown></div><div className="message-actions"><IconButton title="复制回答" onClick={() => void navigator.clipboard.writeText(message.text).then(() => notify('已复制回答')).catch(() => notify('无法访问剪贴板，请手动复制'))}><Copy size={13} /></IconButton><IconButton title="继续编辑这条内容" onClick={() => { setInput(message.text); inputRef.current?.focus(); }}><Pencil size={13} /></IconButton></div></article>)}
          {busy && <div className="rs-agent-status" role="status"><LoaderCircle size={14} className="spin" /><span>{agent?.activity || '正在连接研究工具…'}</span>{!space.connected && <small>正在重连进度</small>}</div>}
          {effectiveError && <div className="rs-error" role="alert"><p>{effectiveError}</p><button type="button" onClick={() => { space.setError(''); if (!agent) void space.retry(); else inputRef.current?.focus(); }}>{agent ? '继续输入' : '重新连接'}<ArrowRight size={13} /></button></div>}
        </div>
        <button type="button" className="scroll-to-latest" title="滚动到最新消息" onClick={() => { stickToBottom.current = true; chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' }); }}><ArrowUp size={18} /></button>
        <div className={`composer ${attached.length ? 'has-attachments' : ''}`} onDragOver={event => { event.preventDefault(); event.currentTarget.classList.add('drag-over'); }} onDragLeave={event => event.currentTarget.classList.remove('drag-over')} onDrop={event => { event.preventDefault(); event.currentTarget.classList.remove('drag-over'); void uploadFiles(Array.from(event.dataTransfer.files)); }}>
          {attached.length > 0 && <div className="attachment-strip">{attached.map(image => <div key={image.id}><img src={image.url} alt={image.name} /><span>{image.name}</span><button type="button" aria-label={`移除 ${image.name}`} onClick={() => setAttached(previous => previous.filter(value => value.id !== image.id))}><X size={12} /></button></div>)}</div>}
          <textarea ref={inputRef} value={input} disabled={!agent || busy || uploading} maxLength={12000} aria-label="向雷达 Agent 提问" placeholder="发现什么正在流行，或上传图片开始反向探索…" onChange={event => setInput(event.target.value)} onPaste={event => { const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); void uploadFiles(files); } }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && (event.metaKey || event.ctrlKey || !settings.enterForNewline)) { event.preventDefault(); void send(); } }} />
          <div className="composer-toolbar" data-popover><IconButton title="添加图片线索" active={menu === 'upload'} disabled={!agent || busy || uploading} onClick={() => toggleMenu('upload')}>{uploading ? <LoaderCircle size={18} className="spin" /> : <Plus size={20} />}</IconButton><span className="toolbar-divider" /><button type="button" className="skill-select has-skill" aria-expanded={menu === 'skills'} onClick={() => toggleMenu('skills')}><Zap size={16} /><span>{currentWorkflow.name}</span><ChevronDown size={11} /></button><button type="button" className="toolbar-text" onClick={() => openModal('sources')}><Radio size={15} /><span>数据源</span></button><button type="button" className="toolbar-text" onClick={() => openModal('history')}><History size={15} /><span>记录</span></button><span className="header-spacer" /><IconButton title={busy ? '停止研究' : '发送研究要求'} className={`send-button ${input.trim() || attached.length || busy ? 'ready' : ''}`} disabled={!busy && (!agent || uploading || (!input.trim() && !attached.length))} onClick={() => busy ? void space.stop() : void send()}>{busy ? <Square size={17} fill="currentColor" /> : <ArrowUp size={20} />}</IconButton>
            {menu === 'upload' && <div className="dropdown upload-dropdown"><button type="button" className="menu-item" onClick={() => uploadRef.current?.click()}><Upload size={16} /><span>上传商品或线索图片</span></button><button type="button" className="menu-item" onClick={() => openModal('references')}><ImagePlus size={16} /><span>从本研究图片中选择</span></button></div>}
            {menu === 'skills' && <div className="dropdown upload-dropdown"><span className="dropdown-label">选择下一轮研究方式</span>{RADAR_WORKFLOWS.map(workflow => { const Icon = workflowIcons[workflow.id]; return <button type="button" className="menu-item" key={workflow.id} onClick={() => { setScope(previous => ({ ...previous, workflow: workflow.id })); setMenu(''); inputRef.current?.focus(); }}><Icon size={16} /><span>{workflow.name}</span>{scope.workflow === workflow.id && <Check size={13} />}</button>; })}</div>}
          </div>
        </div>
      </aside>}

      <div ref={commandsRef} className="rs-command-position"><RadarCommands scope={scope} onScope={setScope} onAction={act} busy={busy || !agent || uploading} run={run} recordCount={agent?.runIds.length || 0} onHistory={() => openModal('history')} onSources={() => openModal('sources')} onUpload={() => uploadRef.current?.click()} viewMode={viewMode} onViewMode={setViewMode} onlySaved={onlySaved} onOnlySaved={() => setOnlySaved(previous => !previous)} reportView={reportView} onReportView={value => { setReportView(value); if (value && run && !agent?.report && !busy) act('report'); }} compact={compact} onCompact={() => setCompact(previous => !previous)} sort={sort} onSort={setSort} /></div>
      {runLoading && <div className="rs-canvas-status" role="status"><LoaderCircle size={15} className="spin" />正在恢复研究证据…</div>}
      {!runLoading && run && !visibleNodes.length && <div className="rs-canvas-status">{onlySaved ? '本次研究还没有收藏线索' : reportView ? '报告正在整理，研究证据已保存' : run.items.length ? '当前条件下没有展示的线索，可调整内容形式或恢复画布线索。' : '本次研究未取得匹配内容，查看左侧说明或数据源与方法。'}</div>}
      {modal && <SpaceDialog title={{ history: '研究空间与记录', sources: '数据源与分析方法', settings: '画布与对话设置', rename: '重命名研究', references: '本研究的图片线索' }[modal]} onClose={() => setModal(null)}>
        {modalLoading && <div className="rs-modal-loading"><LoaderCircle size={17} className="spin" />正在读取…</div>}
        {modal === 'history' && <div className="rs-history"><div className="rs-modal-heading"><h3>Agent 研究空间</h3><button type="button" onClick={() => void switchSession()}><Plus size={14} />新建研究</button></div>{space.sessions.map(session => <button type="button" className="rs-history-row" key={session.id} onClick={() => void switchSession(session.id)}><MessageCircle size={17} /><span><strong>{session.title}</strong><small>{new Date(session.updatedAt).toLocaleString('zh-CN')} · {session.count} 份证据记录{session.status === 'running' ? ' · 研究中' : ''}</small></span>{session.id === agent?.id ? <Check size={16} /> : <ChevronRight size={15} />}</button>)}<h3>已有热点研究记录</h3>{records.length ? records.map(record => <button type="button" className="rs-history-row" disabled={busy} key={record.id} onClick={() => { void flushWorkspace().then(() => space.adoptRun(record.id)).then(() => { setReportView(false); setModal(null); }).catch(() => space.setError('研究记录恢复失败，请重试。')); }}><History size={17} /><span><strong>{record.input.query || RADAR_WORKFLOWS.find(workflow => workflow.id === record.input.workflow)?.name}</strong><small>{new Date(record.createdAt).toLocaleString('zh-CN')} · {record.input.region} · {record.count} 条线索</small></span><ChevronRight size={15} /></button>) : !modalLoading && <p className="rs-muted">完成首次研究后，记录会出现在这里。</p>}</div>}
        {modal === 'sources' && <div className="rs-sources"><p className="rs-muted">可用表示已配置或可尝试，采集成功与返回数量以每次研究记录为准。</p>{(run?.sources || sources).map(source => <div className="rs-source-row" key={source.platform}><span className={`rs-source-state ${source.state}`} /><div><strong>{source.platform}<small>{{ ready: '可尝试', unconfigured: '未配置', error: '本次失败', success: '本次成功' }[source.state]}{source.state === 'success' ? ` · ${source.count} 条` : ''}</small></strong><p>{source.detail}</p></div><a href={sourceUrl(source.url)} target="_blank" rel="noreferrer" aria-label={`${source.platform} 数据源文档`}><ExternalLink size={14} /></a></div>)}<button type="button" className="rs-primary" disabled={busy} onClick={() => { setModal(null); act('source-check'); }}><Radio size={15} />让 Agent 检查数据源</button><h3>评分如何得出</h3><p>热度按同平台、同形式、同领域与相近发布时间的样本计算分位。潜力综合增长动能（45%）、互动质量（30%）、跨源印证（15%）与时效（10%）。增长或互动证据不足时，潜力保持未知。</p><p>加权互动指数 =（点赞 + 2 × 评论 + 3 × 分享 + 3 × 收藏）÷ 播放量。缺失字段单独标注，评论正文与留存缺失时不能推断传播原因。Google Trends 当前采用 Trending Now RSS；新闻排序与规则日期不代表热度。</p><p className="rs-muted">完整的来源状态、分析过程与缺口保存在每份报告中。</p></div>}
        {modal === 'settings' && <div className="rs-settings">{[['showGrid', '显示画布网点'], ['snapToGrid', '拖动时吸附网格'], ['focusSelected', '选中时聚焦节点'], ['focusNew', '自动聚焦新节点'], ['showExecution', '显示真实工具执行详情'], ['enterForNewline', 'Enter 换行，⌘ / Ctrl + Enter 发送']].map(([key, label]) => <label key={key}><span>{label}</span><input type="checkbox" checked={Boolean(settings[key])} onChange={event => setSettings(previous => ({ ...previous, [key]: event.target.checked }))} /></label>)}<label><span>对话文字大小</span><select value={Number(settings.fontSize)} onChange={event => setSettings(previous => ({ ...previous, fontSize: Number(event.target.value) }))}><option value={15}>标准 · 15px</option><option value={16}>中号 · 16px</option><option value={18}>大号 · 18px</option></select></label><p className="rs-muted">画布快捷键：空格拖动画布；⌘ / Ctrl + 滚轮缩放；选中节点后 Delete 移除展示。原始研究证据仍保存在记录中。</p></div>}
        {modal === 'rename' && <form className="rs-rename" onSubmit={event => { event.preventDefault(); if (rename.trim()) void space.update({ title: rename.trim() }).then(() => setModal(null)).catch(error => space.setError(error.message)); }}><label htmlFor="rs-title">研究名称</label><input id="rs-title" autoFocus value={rename} maxLength={160} onChange={event => setRename(event.target.value)} /><button type="submit" className="rs-primary" disabled={!rename.trim()}>保存名称<Check size={14} /></button></form>}
        {modal === 'references' && <div className="rs-reference-grid">{agent?.images.length ? agent.images.map(image => <button type="button" key={image.id} disabled={attached.length >= 4 || busy} onClick={() => { setAttached(previous => previous.some(value => value.id === image.id) ? previous : [...previous, image]); setModal(null); inputRef.current?.focus(); }}><img src={image.url} alt={image.name} /><span>{image.name}</span></button>) : <p className="rs-muted">还没有图片线索，可以上传商品、图片或内容参考。</p>}<button type="button" className="rs-reference-add" disabled={busy} onClick={() => { setModal(null); uploadRef.current?.click(); }}><Plus size={24} /><span>上传图片</span></button></div>}
      </SpaceDialog>}
      <input ref={uploadRef} type="file" hidden multiple accept="image/jpeg,image/png,image/webp" onChange={event => { void uploadFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
      {toast && <div className="toast" role="status"><Check size={15} />{toast}</div>}
    </div>
  </div>;
}
