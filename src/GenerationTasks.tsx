import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Clock3, Copy, Download, Eye, Film, Image as ImageIcon, Inbox, LoaderCircle, RefreshCw, Search, X } from 'lucide-react';
import { generationStatusLabels, generationTaskActive, type GenerationTask, type GenerationTaskList, type GenerationTaskStatus } from '../shared/generation-task';
import { api } from './api';
import './generation-tasks.css';

type StatusFilter = 'all' | 'active' | 'attention' | 'completed';
const PAGE_SIZE = 30;
const stages = [{ id: 'prepare', title: '生成前', description: '准备素材与提交请求' }, { id: 'generate', title: '生成中', description: '排队与模型生成' }, { id: 'save', title: '生成后', description: '保存与查看结果' }] as const;
const shortId = (id: string) => id.replace(/^(image|video):/, '');
function dateLabel(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return '未记录时间';
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
function elapsed(task: GenerationTask) {
  if (!task.createdAt || !task.finishedAt) return '';
  const seconds = Math.max(0, Math.round((Date.parse(task.finishedAt) - Date.parse(task.createdAt)) / 1000));
  if (!Number.isFinite(seconds)) return '';
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}
function StatusIcon({ status }: { status: GenerationTaskStatus }) {
  return status === 'completed' ? <CircleCheck size={14} /> : status === 'failed' || status === 'needs-attention' ? <CircleAlert size={14} />
    : status === 'queued' ? <Clock3 size={14} /> : <LoaderCircle size={14} className="generation-spin" />;
}
function StatusBadge({ status }: { status: GenerationTaskStatus }) {
  return <span className={`generation-status is-${status}`}><StatusIcon status={status} />{generationStatusLabels[status]}</span>;
}
function Thumbnail({ task }: { task: GenerationTask }) {
  const [broken, setBroken] = useState(false);
  const source = task.kind === 'image' ? task.outputs[0]?.url : task.outputs[0]?.thumbnail;
  return <span className={`generation-thumbnail is-${task.kind}`} aria-hidden="true">
    {source && !broken ? <img src={source} alt="" loading="lazy" onError={() => setBroken(true)} /> : task.kind === 'image' ? <ImageIcon size={20} /> : <Film size={20} />}
  </span>;
}

function useTaskList(query: string, version: number) {
  const [data, setData] = useState<GenerationTaskList | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let pending = false;
    let delay = 12_000;
    const poll = async () => {
      if (controller.signal.aborted || pending) return;
      if (document.hidden) { timer = setTimeout(poll, delay); return; }
      pending = true; setRefreshing(true);
      try {
        const next = await api<GenerationTaskList>(`/api/generation-tasks${query ? `?q=${encodeURIComponent(query)}` : ''}`, { signal: controller.signal });
        if (!controller.signal.aborted) { setData(next); setError(''); delay = next.counts.active ? 3000 : 12_000; }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '任务列表暂时无法读取。');
      } finally {
        pending = false;
        if (!controller.signal.aborted) { setRefreshing(false); timer = setTimeout(poll, delay); }
      }
    };
    const onVisible = () => { if (!document.hidden) { clearTimeout(timer); void poll(); } };
    void poll();
    document.addEventListener('visibilitychange', onVisible);
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [query, version]);
  return { data, error, refreshing };
}

function TaskDetail({ taskId, updatedAt, onClose, onOpenCreative, onOpenStudioProject, busy }: {
  taskId: string; updatedAt?: string; onClose: () => void; onOpenCreative: (id: string) => void; onOpenStudioProject: (id: string) => void; busy: boolean;
}) {
  const [task, setTask] = useState<GenerationTask | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [retry, setRetry] = useState(0);
  const panel = useRef<HTMLElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    panel.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('keydown', escape); clearTimeout(copyTimer.current); };
  }, [onClose]);
  useEffect(() => {
    const controller = new AbortController();
    void api<GenerationTask>(`/api/generation-tasks/${encodeURIComponent(taskId)}`, { signal: controller.signal })
      .then(next => { if (!controller.signal.aborted) { setTask(next); setError(''); } })
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '任务详情暂时无法读取。'); });
    return () => controller.abort();
  }, [taskId, updatedAt, retry]);
  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(task?.requestId || shortId(taskId));
      setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 1800);
    } catch { setError('复制失败，请选中下方请求标识手动复制。'); }
  };
  const stageIndex = task ? stages.findIndex(stage => stage.id === task.stage) : 0;
  const attention = task?.status === 'failed' || task?.status === 'needs-attention';
  return <aside className="generation-detail" ref={panel} tabIndex={-1} aria-label="任务详情">
    <div className="generation-detail-heading"><h2>任务详情</h2><button type="button" className="generation-icon-button" aria-label="关闭任务详情" onClick={onClose}><X size={18} /></button></div>
    {error && <div className="generation-error" role="alert"><CircleAlert size={16} /><span>{error}</span><button type="button" onClick={() => setRetry(value => value + 1)}>重试</button></div>}
    {!task && !error && <div className="generation-empty" role="status"><LoaderCircle size={24} className="generation-spin" /><span>正在读取任务详情…</span></div>}
    {task && <>
      <div className="generation-detail-summary"><StatusBadge status={task.status} /><span>{task.kind === 'image' ? '图片' : '视频'} · {task.source}</span></div>
      <ol className="generation-stages" aria-label="生成阶段">
        {stages.map((stage, index) => {
          const complete = task.status === 'completed' || index < stageIndex;
          const current = index === stageIndex && task.status !== 'completed';
          return <li key={stage.id} className={`${complete ? 'is-done' : ''} ${current ? 'is-current' : ''} ${current && attention ? 'is-attention' : ''}`} aria-current={current ? 'step' : undefined}>
            <span className="generation-stage-mark">{complete ? <Check size={13} /> : current && attention ? <CircleAlert size={13} /> : current ? <StatusIcon status={task.status} /> : <span />}</span>
            <div><strong>{stage.title}</strong><span>{stage.description}</span></div>
          </li>;
        })}
      </ol>
      <p className={`generation-detail-message ${attention ? 'is-attention' : ''}`} role="status">{task.message}</p>
      {task.status === 'needs-attention' && <p className="generation-detail-hint">先核对原任务或在所属创意中恢复查询，避免重复提交。</p>}
      {task.warning && <p className="generation-detail-hint">{task.warning}</p>}
      {task.outputs.length > 0 && <div className="generation-outputs">
        {task.outputs.map((output, index) => <div className="generation-output" key={output.id}>
          <div className="generation-preview">
            {task.kind === 'image' ? <a href={output.url} target="_blank" rel="noreferrer" aria-label="打开原图"><img src={output.url} alt={task.prompt.slice(0, 160) || '生成的图片'} onError={() => setMediaError(true)} /></a>
              : <video key={output.url} src={output.url} poster={output.thumbnail} controls playsInline preload="metadata" onError={() => setMediaError(true)} />}
          </div>
          <a className="generation-button generation-download" href={output.url} download={output.filename}><Download size={14} />下载{task.kind === 'image' ? '图片' : '视频'}{task.outputs.length > 1 ? ` ${index + 1}` : ''}</a>
        </div>)}
        {mediaError && <p className="generation-detail-hint" role="alert">预览暂时无法加载，可以尝试下载原文件或打开所属创意查看。</p>}
      </div>}
      <dl className="generation-metadata">
        <div><dt>模型</dt><dd>{task.model}</dd></div>
        <div><dt>所属创意</dt><dd>{task.projectTitle && `${task.projectTitle} / `}{task.creativeTitle}{task.archived && '（已归档）'}</dd></div>
        <div><dt>创建时间</dt><dd>{dateLabel(task.createdAt)}</dd></div>
        <div><dt>{task.finishedAt ? '结束时间' : '更新时间'}</dt><dd>{dateLabel(task.finishedAt || task.updatedAt)}{elapsed(task) && ` · ${elapsed(task)}`}</dd></div>
        {(task.aspectRatio || task.resolution || task.size || task.duration) && <div><dt>生成规格</dt><dd>{[task.aspectRatio, task.resolution || task.size, task.duration ? `${task.duration.toFixed(1).replace(/\.0$/, '')} 秒` : ''].filter(Boolean).join(' · ')}</dd></div>}
        {task.width && task.height && <div><dt>实际尺寸</dt><dd>{task.width} × {task.height}</dd></div>}
        {task.quality && <div><dt>生成质量</dt><dd>{task.quality}</dd></div>}
        {task.referenceCount !== undefined && <div><dt>参考素材</dt><dd>{task.referenceCount} 张</dd></div>}
        {task.credits && <div><dt>额度</dt><dd>已扣 {task.credits.charged} · 预留 {task.credits.held}</dd></div>}
        <div className="generation-request-id"><dt>任务 ID</dt><dd>{shortId(task.id)}</dd></div>
        {task.requestId && <div className="generation-request-id"><dt>请求标识</dt><dd>{task.requestId}</dd></div>}
      </dl>
      <button type="button" className="generation-button generation-copy" onClick={() => void copyId()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? '已复制' : task.requestId ? '复制请求标识' : '复制任务 ID'}</button>
      <details className="generation-prompt" open><summary>生成提示词</summary><pre>{task.prompt || (generationTaskActive(task.status) ? '请求尚在准备，提交后可查看完整提示词。' : '历史任务未保留完整提示词。')}</pre></details>
      {task.creativeId && <button type="button" className="generation-button generation-open-creative" disabled={busy} onClick={() => onOpenCreative(task.creativeId!)}>打开所属创意<ArrowUpRight size={15} /></button>}
      {task.studioProjectId && <button type="button" className="generation-button generation-open-creative" disabled={busy} onClick={() => onOpenStudioProject(task.studioProjectId!)}>打开工作室项目<ArrowUpRight size={15} /></button>}
    </>}
  </aside>;
}

export default function GenerationTasks({ theme, onOpenCreative, onOpenStudioProject, busy = false }: { theme?: string; onOpenCreative: (id: string) => void; onOpenStudioProject: (id: string) => void; busy?: boolean }) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'all' | 'video' | 'image'>('all');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState('newest');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [page, setPage] = useState(0);
  const closeDetail = useMemo(() => () => setSelectedId(null), []);
  useEffect(() => { const timer = setTimeout(() => setSearch(query.trim()), 250); return () => clearTimeout(timer); }, [query]);
  const { data, error, refreshing } = useTaskList(search, version);
  const tasks = useMemo(() => {
    const list = (data?.tasks || []).filter(task => (kind === 'all' || kind === task.kind)
      && (filter === 'all' || filter === 'active' && generationTaskActive(task.status) || filter === 'completed' && task.status === 'completed' || filter === 'attention' && (task.status === 'failed' || task.status === 'needs-attention')));
    return sort === 'oldest' ? [...list].reverse() : list;
  }, [data, kind, filter, sort]);
  useEffect(() => setPage(0), [search, kind, filter, sort]);
  const lastPage = Math.max(0, Math.ceil(tasks.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const displayed = tasks.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const counts = data?.counts;
  const clearFilters = () => { setQuery(''); setSearch(''); setKind('all'); setFilter('all'); };
  return <section className="generation-tasks intelligent-ui-surface" data-theme={theme || 'dark'}>
    <header className="generation-heading"><div><h1>任务进度</h1><p>查看图片与视频的生成状态、处理记录和结果。</p></div><div className="generation-live"><span className={error ? 'is-offline' : ''} />{error ? '更新已暂停' : refreshing ? '正在更新' : '自动更新'}<button type="button" className="generation-icon-button" aria-label="刷新任务进度" disabled={refreshing} onClick={() => setVersion(value => value + 1)}><RefreshCw size={16} className={refreshing ? 'generation-spin' : ''} /></button></div></header>
    <div className="generation-counts" aria-label="任务状态筛选">
      {([{ id: 'active', label: '进行中', count: counts?.active, tone: 'active' }, { id: 'attention', label: '需处理', count: counts?.attention, tone: 'attention' }, { id: 'completed', label: '已完成', count: counts?.completed, tone: 'completed' }] as const).map(item => <button type="button" key={item.id} className={`generation-count is-${item.tone} ${filter === item.id ? 'is-selected' : ''}`} aria-pressed={filter === item.id} onClick={() => setFilter(current => current === item.id ? 'all' : item.id)}><span className="generation-count-dot" /><strong>{item.count ?? '—'}</strong><span>{item.label}</span><ChevronRight size={15} /></button>)}
    </div>
    <div className="generation-toolbar"><div className="generation-kind-tabs" role="group" aria-label="生成类型">
      {([{ id: 'all', label: '全部任务' }, { id: 'video', label: '视频', Icon: Film }, { id: 'image', label: '图片', Icon: ImageIcon }] as const).map(item => <button type="button" key={item.id} aria-pressed={kind === item.id} onClick={() => setKind(item.id)}>{'Icon' in item && <item.Icon size={15} />}{item.label}</button>)}
    </div><label className="generation-search"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索提示词、创意或任务 ID" aria-label="搜索提示词、创意或任务 ID" maxLength={500} />{query && <button type="button" aria-label="清空搜索" onClick={() => setQuery('')}><X size={14} /></button>}</label><select className="generation-sort" value={sort} onChange={event => setSort(event.target.value)} aria-label="任务排序"><option value="newest">最新创建优先</option><option value="oldest">最早创建优先</option></select></div>
    <div className="generation-list-caption"><span>{filter !== 'all' && <button type="button" className="generation-filter-tag" onClick={() => setFilter('all')}>{filter === 'active' ? '进行中' : filter === 'attention' ? '需处理' : '已完成'}<X size={12} /></button>}{data ? `${tasks.length} 个任务` : '正在读取任务'}</span><span>{data && `更新于 ${dateLabel(data.updatedAt)}`}</span></div>
    {error && <div className="generation-error" role="alert"><CircleAlert size={16} /><span>{error} 已加载的任务会继续保留。</span><button type="button" onClick={() => setVersion(value => value + 1)}>重新连接</button></div>}
    <div className={`generation-layout ${selectedId ? 'has-detail' : ''}`}>
      <div className="generation-list">
        <div className="generation-table-scroll"><table className="generation-table"><thead><tr><th scope="col">任务</th><th scope="col">状态</th><th scope="col">更新于</th><th scope="col">操作</th></tr></thead><tbody>
          {displayed.map(task => <tr key={task.id} className={selectedId === task.id ? 'is-selected' : ''} onClick={() => setSelectedId(task.id)}>
            <td><div className="generation-task-cell"><Thumbnail task={task} /><div className="generation-task-text"><button type="button" className="generation-task-title" onClick={() => setSelectedId(task.id)} title={task.prompt || task.source}>{task.prompt || task.source}</button><span className="generation-task-model">{task.model}<span>{task.source}</span></span><span className="generation-task-origin" title={`${task.creativeTitle} · ${shortId(task.id)}`}>{task.creativeTitle}<span>· {shortId(task.id).slice(0, 8)}</span>{task.archived && <small>已归档</small>}</span></div></div></td>
            <td><StatusBadge status={task.status} /><span className="generation-task-message" title={task.message}>{task.message}</span></td>
            <td className="generation-date"><time dateTime={task.updatedAt || undefined}>{dateLabel(task.updatedAt)}</time>{task.finishedAt && <small>已结束</small>}</td>
            <td><div className="generation-row-actions"><button type="button" className="generation-button" aria-label={`查看${task.kind === 'image' ? '图片' : '视频'}任务 ${shortId(task.id).slice(0, 8)}`} onClick={() => setSelectedId(task.id)}><Eye size={15} /><span>查看</span></button>{task.outputs.length === 1 && <a className="generation-button generation-row-download" href={task.outputs[0].url} download={task.outputs[0].filename} onClick={event => event.stopPropagation()} aria-label={`下载${task.kind === 'image' ? '图片' : '视频'}`}><Download size={15} /><span>下载</span></a>}</div></td>
          </tr>)}
        </tbody></table></div>
        {!data && !error && <div className="generation-empty" role="status"><LoaderCircle size={26} className="generation-spin" /><strong>正在读取生成任务…</strong></div>}
        {data && !tasks.length && <div className="generation-empty"><Inbox size={32} strokeWidth={1.4} /><strong>{counts?.total ? '没有符合条件的任务' : '还没有生成任务'}</strong><p>{counts?.total ? '试试其他关键词，或清除筛选查看全部任务。' : '在创意中生成图片或视频后，任务会出现在这里。'}</p>{!!counts?.total && <button type="button" className="generation-button" onClick={clearFilters}>清除筛选</button>}</div>}
        {tasks.length > PAGE_SIZE && <nav className="generation-pagination" aria-label="任务列表分页"><span>{currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, tasks.length)} / {tasks.length}</span><button type="button" className="generation-icon-button" aria-label="上一页" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button><button type="button" className="generation-icon-button" aria-label="下一页" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></nav>}
      </div>
      {selectedId && <TaskDetail key={selectedId} taskId={selectedId} updatedAt={data?.updatedAt} onClose={closeDetail} onOpenCreative={onOpenCreative} onOpenStudioProject={onOpenStudioProject} busy={busy} />}
    </div>
    <p className="generation-footnote">任务在后台继续执行，离开此页后仍可回来查看。</p>
  </section>;
}
