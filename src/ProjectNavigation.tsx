import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArchiveRestore, ArrowLeft, CircleAlert, CirclePause, Ellipsis, FolderOpen, FolderPlus, LoaderCircle, MessageCirclePlus, MessageSquare, Pencil, Pin, Plus, Search } from 'lucide-react';
import type { ProjectSummary, WorkspaceProject } from '../shared/domain';
import { agentActivityTime, type AgentActivities, type AgentActivity } from '../shared/agent-activity';

const RECENT_LIMIT = 3;
const MORE_LIST_LIMIT = 20;
const pinsKey = (projectId: string) => `sop-creative-pins:${projectId}`;

function readIds(key: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]) {
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* storage unavailable */ }
}

function TaskBadge({ count, showZero = false }: { count: number; showZero?: boolean }) {
  if (!count && !showZero) return null;
  return <span className="creative-task-badge" title={`进行中任务：${count}`} aria-label={`进行中任务 ${count}`}>
    <MessageSquare size={12} aria-hidden="true" /><em>{count}</em>
  </span>;
}

function UnreadDot() {
  return <span className="creative-unread-dot" role="img" aria-label="已完成，有新结果待查看" title="已完成，有新结果待查看" />;
}

function CreativeActivityStatus({ creative, activity }: { creative: ProjectSummary; activity?: AgentActivity }) {
  if (activity?.status === 'running') return <span className="creative-agent-status" role="img" aria-label="Agent 正在执行" title="Agent 正在执行"><LoaderCircle size={14} className="spin creative-agent-spinner" aria-hidden="true" /></span>;
  if (activity?.status === 'failed') return <span className="creative-agent-status is-failed" role="img" aria-label="Agent 执行失败" title="执行失败，打开会话查看详情"><CircleAlert size={14} aria-hidden="true" /></span>;
  if (activity?.status === 'interrupted') return <span className="creative-agent-status" role="img" aria-label="Agent 已停止" title="Agent 已停止"><CirclePause size={14} aria-hidden="true" /></span>;
  const updatedAt = activity?.updatedAt && activity.updatedAt > creative.updatedAt ? activity.updatedAt : creative.updatedAt;
  return <time className="creative-agent-status" dateTime={updatedAt} title={new Date(updatedAt).toLocaleString()}>{agentActivityTime(updatedAt)}</time>;
}

function NewCreativeButton({ group, current, busy, onCreate }: {
  group: WorkspaceProject; current: boolean; busy: boolean; onCreate: (parentId: string) => void;
}) {
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState<{ top: number; right: number; background: string; color: string; borderColor: string } | null>(null);
  const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
  const showTooltip = (button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    const canvas = style.getPropertyValue('--iui-canvas').trim() || style.getPropertyValue('--panel').trim() || 'Canvas';
    const color = style.getPropertyValue('--iui-ink').trim() || style.color;
    setTooltip({ top: rect.bottom + 44 > window.innerHeight ? rect.top - 38 : rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right), background: `color-mix(in srgb, ${canvas} 88%, ${color})`, color, borderColor: style.getPropertyValue('--iui-border-strong').trim() || style.getPropertyValue('--line').trim() || color });
  };
  useEffect(() => {
    if (!tooltip) return;
    const hide = () => setTooltip(null);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => { window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide); };
  }, [tooltip]);
  return <>
    <button type="button" className="project-tree-action project-tree-new-creative" aria-label={`在${group.title}下新建创意`}
      aria-describedby={tooltip ? tooltipId : undefined} aria-keyshortcuts={current ? 'Meta+N Control+N' : undefined} disabled={busy}
      onMouseEnter={event => showTooltip(event.currentTarget)} onMouseLeave={() => setTooltip(null)}
      onFocus={event => showTooltip(event.currentTarget)} onBlur={() => setTooltip(null)}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setTooltip(null); } }}
      onClick={() => { setTooltip(null); onCreate(group.id); }}><MessageCirclePlus size={17} strokeWidth={1.6} aria-hidden="true" /></button>
    {tooltip && createPortal(<div id={tooltipId} role="tooltip" className="sidebar-new-creative-tooltip" style={tooltip}>
      <span>新建创意</span>{current && <span className="sidebar-new-creative-shortcut" aria-hidden="true"><kbd>{modifier}</kbd><kbd>N</kbd></span>}
    </div>, document.body)}
  </>;
}

function CreativeRow({
  creative, selected, busy, running, showArchived, badge, pinned, onSelect, onArchive, onTogglePin, pinVisible = false, agentMode = false, activity, unread = false,
}: {
  creative: ProjectSummary; selected: boolean; busy: boolean; running: boolean; showArchived: boolean;
  badge: number; pinned?: boolean; onSelect: (id: string) => void; onArchive: (id: string, archived: boolean) => void;
  onTogglePin?: (id: string) => void; pinVisible?: boolean;
  agentMode?: boolean; activity?: AgentActivity; unread?: boolean;
}) {
  return <div className={`project-row ${selected ? 'selected' : ''}${pinned ? ' is-pinned' : ''}`}>
    <button className={`project-link ${selected ? 'selected' : ''}`} aria-current={selected ? 'page' : undefined} onClick={() => onSelect(creative.id)} disabled={busy} title={creative.title}>
      {unread && <UnreadDot />}
      <span className="project-link-title">{creative.title}</span>
      {creative.isDemo && <small>示例</small>}
      {agentMode ? <CreativeActivityStatus creative={creative} activity={activity} /> : <TaskBadge count={badge} />}
    </button>
    {onTogglePin && <button
      type="button"
      className={`project-pin-action${pinned ? ' is-on' : ''}${pinVisible || pinned ? ' is-visible' : ''}`}
      aria-label={pinned ? `取消固定：${creative.title}` : `固定到侧栏：${creative.title}`}
      title={pinned ? '取消固定' : '固定到侧栏'}
      aria-pressed={!!pinned}
      disabled={busy}
      onClick={event => { event.stopPropagation(); onTogglePin(creative.id); }}
    ><Pin size={13} /></button>}
    <button className="project-archive-action" aria-label={`${showArchived ? '恢复' : '归档'}创意：${creative.title}`} title={showArchived ? '恢复创意' : '归档创意'} disabled={busy || activity?.status === 'running' || (selected && running)} onClick={() => onArchive(creative.id, !showArchived)}>{showArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}</button>
  </div>;
}

function MorePopover({
  creatives, pinnedIds, currentId, busy, onSelect, onTogglePin, onViewAll, onClose, anchorRef, agentActivities, unreadIds,
}: {
  creatives: ProjectSummary[]; pinnedIds: Set<string>; currentId: string; busy: boolean;
  onSelect: (id: string) => void; onTogglePin: (id: string) => void; onViewAll: () => void; onClose: () => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
  agentActivities?: AgentActivities; unreadIds?: Set<string>;
}) {
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const place = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(512, window.innerWidth - 24);
      const left = Math.min(rect.right + 10, window.innerWidth - width - 12);
      const top = Math.min(Math.max(12, rect.top), window.innerHeight - 80);
      setCoords({ top, left: Math.max(12, left) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchorRef]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? creatives.filter(item => item.title.toLowerCase().includes(q)) : creatives;
    return list.slice(0, MORE_LIST_LIMIT);
  }, [creatives, query]);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [anchorRef, onClose]);

  return <div className="sidebar-more-popover" ref={panelRef} role="dialog" aria-label="更多创作" style={{ top: coords.top, left: coords.left, maxHeight: `min(420px, calc(100dvh - ${coords.top + 12}px))` }}>
    <div className="sidebar-more-toolbar">
      <label className="sidebar-more-search">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索创作…" aria-label="搜索创作" autoFocus />
      </label>
      <button type="button" className="sidebar-more-view-all" onClick={onViewAll}>查看全部</button>
    </div>
    <div className="sidebar-more-list">
      {filtered.map(creative => {
        const pinned = pinnedIds.has(creative.id);
        return <div key={creative.id} className={`sidebar-more-row${creative.id === currentId ? ' selected' : ''}`}>
          <button type="button" className="sidebar-more-link" disabled={busy} onClick={() => { onSelect(creative.id); onClose(); }} title={creative.title}>
            {unreadIds?.has(creative.id) && <UnreadDot />}
            <span className="sidebar-more-avatar" aria-hidden="true">{creative.title.trim().charAt(0).toUpperCase()}</span><span className="sidebar-more-link-title">{creative.title}</span>
            {agentActivities ? <CreativeActivityStatus creative={creative} activity={agentActivities[creative.id]} /> : <TaskBadge count={creative.inProgressCount || 0} showZero />}
          </button>
          <button
            type="button"
            className={`project-pin-action${pinned ? ' is-on' : ''} is-visible`}
            aria-label={pinned ? `取消固定：${creative.title}` : `固定到侧栏：${creative.title}`}
            title={pinned ? '取消固定' : '固定到侧栏'}
            aria-pressed={pinned}
            disabled={busy}
            onClick={() => onTogglePin(creative.id)}
          ><Pin size={13} /></button>
        </div>;
      })}
      {!filtered.length && <p className="sidebar-more-empty">{query.trim() ? '没有匹配的创作' : '暂无创作'}</p>}
    </div>
  </div>;
}

export default function ProjectNavigation({ groups, creatives, currentId, currentParentId, busy, running, showArchived, onShowArchived, onNewProject, onRenameProject, onNewCreative, onSelect, onArchive, onSearch, collapsed = false, onExpand, agentActivities, unreadIds }: {
  groups: WorkspaceProject[]; creatives: ProjectSummary[]; currentId: string; currentParentId?: string; busy: boolean; running: boolean; showArchived: boolean;
  onShowArchived: (value: boolean) => void; onNewProject: () => void; onRenameProject: (group: WorkspaceProject) => void;
  onNewCreative: (parentId: string) => void; onSelect: (id: string) => void; onArchive: (id: string, archived: boolean) => void;
  collapsed?: boolean; onExpand?: () => void;
  onSearch: () => void;
  agentActivities?: AgentActivities; unreadIds?: Set<string>;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [viewAll, setViewAll] = useState<Record<string, boolean>>({});
  const [pinnedByProject, setPinnedByProject] = useState<Record<string, string[]>>({});
  const [moreOpenFor, setMoreOpenFor] = useState<string | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const createShortcut = (event: KeyboardEvent) => {
      if (busy || !currentParentId || event.defaultPrevented || event.repeat || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'n') return;
      if (document.querySelector('dialog[open], [role="dialog"], [aria-modal="true"]')) return;
      event.preventDefault();
      onNewCreative(currentParentId);
    };
    window.addEventListener('keydown', createShortcut);
    return () => window.removeEventListener('keydown', createShortcut);
  }, [busy, currentParentId, onNewCreative]);

  useEffect(() => { if (currentParentId) setExpanded(previous => ({ ...previous, [currentParentId]: true })); }, [currentId, currentParentId, showArchived]);

  useEffect(() => {
    if (!currentParentId || !currentId) return;
    setPinnedByProject(previous => previous[currentParentId] ? previous : { ...previous, [currentParentId]: readIds(pinsKey(currentParentId)) });
  }, [currentId, currentParentId]);

  const archivedCount = creatives.filter(creative => creative.archivedAt).length;

  const ensurePrefs = (projectId: string) => {
    setPinnedByProject(previous => previous[projectId] ? previous : { ...previous, [projectId]: readIds(pinsKey(projectId)) });
  };

  const togglePin = (projectId: string, creativeId: string) => {
    setPinnedByProject(previous => {
      const current = previous[projectId] || readIds(pinsKey(projectId));
      const next = current.includes(creativeId) ? current.filter(id => id !== creativeId) : [...current, creativeId];
      writeIds(pinsKey(projectId), next);
      return { ...previous, [projectId]: next };
    });
  };

  if (collapsed) return <section className="sidebar-projects sidebar-workspaces sidebar-projects-compact" aria-label="工作空间与创意">
    <button type="button" className="sidebar-rail-button" aria-label="搜索工作空间与创意" title="搜索工作空间与创意（⌘K）" onClick={onSearch}><Search size={17} /></button>
    <button className="sidebar-rail-button" aria-label="新建工作空间" title="新建工作空间" disabled={busy} onClick={onNewProject}><FolderPlus size={17} /></button>
    <div className="sidebar-project-rail">{groups.filter(group => !showArchived || creatives.some(creative => creative.parentProjectId === group.id && creative.archivedAt)).map(group => <button key={group.id} className={`sidebar-rail-button ${group.id === currentParentId ? 'active' : ''}`} title={group.title} aria-label={`打开工作空间：${group.title}`} onClick={() => { setExpanded(previous => ({ ...previous, [group.id]: true })); onExpand?.(); }}><FolderOpen size={17} /></button>)}</div>
    <button className={`sidebar-rail-button ${showArchived ? 'active' : ''}`} aria-label={showArchived ? '返回全部创意' : `已归档创意：${archivedCount}`} title={showArchived ? '返回全部创意' : `已归档创意（${archivedCount}）`} aria-pressed={showArchived} onClick={() => { onShowArchived(!showArchived); onExpand?.(); }}>{showArchived ? <ArrowLeft size={17} /> : <Archive size={17} />}</button>
  </section>;

  return <section className="sidebar-projects sidebar-workspaces" aria-label="工作空间与创意">
    <div className="nav-section-label recent-label sidebar-workspaces-heading"><span>Workspaces</span><div className="sidebar-workspaces-actions"><button type="button" className="icon-btn" aria-label="搜索工作空间与创意" title="搜索工作空间与创意（⌘K）" onClick={onSearch}><Search size={16} /></button><button type="button" className="icon-btn" aria-label="新建工作空间" title="新建工作空间" onClick={onNewProject} disabled={busy}><FolderPlus size={17} /></button></div></div>
    <div className="project-list project-tree">{groups.map(group => {
      const children = creatives.filter(creative => creative.parentProjectId === group.id && (showArchived ? Boolean(creative.archivedAt) : !creative.archivedAt)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || a.id.localeCompare(b.id));
      if (showArchived && !children.length) return null;
      const open = expanded[group.id] ?? false;
      const isCurrentProject = group.id === currentParentId;
      const useCompact = !showArchived && !viewAll[group.id];
      const pinnedIds = pinnedByProject[group.id] || (isCurrentProject ? readIds(pinsKey(group.id)) : []);
      const pinnedSet = new Set(pinnedIds.filter(id => children.some(creative => creative.id === id)));
      const favorites = pinnedIds.map(id => children.find(creative => creative.id === id)).filter((item): item is ProjectSummary => !!item).slice(0, RECENT_LIMIT);
      const recent = children.filter(creative => !pinnedSet.has(creative.id)).slice(0, Math.max(0, RECENT_LIMIT - favorites.length));
      const visibleIds = new Set([...favorites, ...recent].map(item => item.id));
      const showMore = useCompact && children.length > visibleIds.size;

      return <div className="project-tree-group" key={group.id}>
        <div className={`project-tree-heading ${isCurrentProject ? 'current' : ''}`}>
          <button className="project-tree-folder" aria-expanded={open} onClick={() => {
            ensurePrefs(group.id);
            setExpanded(previous => ({ ...previous, [group.id]: !open }));
            if (open) { setMoreOpenFor(null); setViewAll(previous => ({ ...previous, [group.id]: false })); }
          }} title={group.title}>
            <span className="project-tree-indicator" aria-hidden="true"><FolderOpen size={17} /></span>
            <span>{group.title}</span><small>{children.length}</small>
          </button>
          <button className="project-tree-action" aria-label={`重命名工作空间：${group.title}`} title="重命名工作空间" disabled={busy} onClick={() => onRenameProject(group)}><Pencil size={13} /></button>
          <NewCreativeButton group={group} current={isCurrentProject} busy={busy} onCreate={onNewCreative} />
        </div>
        {open && <div className="project-tree-children">
          {useCompact ? <>
            {!!favorites.length && <div className="sidebar-creative-block" aria-label="已固定">
              <div className="sidebar-creative-label"><Pin size={12} aria-hidden="true" /><span>已固定</span></div>
              {favorites.map(creative => <CreativeRow
                key={creative.id}
                creative={creative}
                agentMode={!!agentActivities}
                activity={agentActivities?.[creative.id]}
                unread={unreadIds?.has(creative.id)}
                selected={creative.id === currentId}
                busy={busy}
                running={running}
                showArchived={showArchived}
                badge={creative.inProgressCount || 0}
                pinned
                pinVisible
                onSelect={onSelect}
                onArchive={onArchive}
                onTogglePin={id => togglePin(group.id, id)}
              />)}
            </div>}
            <div className="sidebar-creative-block" aria-label="创意">
              {!!favorites.length && <div className="sidebar-creative-label"><span>创意</span></div>}
              {recent.map(creative => <CreativeRow
                key={creative.id}
                creative={creative}
                agentMode={!!agentActivities}
                activity={agentActivities?.[creative.id]}
                unread={unreadIds?.has(creative.id)}
                selected={creative.id === currentId}
                busy={busy}
                running={running}
                showArchived={showArchived}
                badge={creative.inProgressCount || 0}
                pinned={false}
                onSelect={onSelect}
                onArchive={onArchive}
                onTogglePin={id => togglePin(group.id, id)}
              />)}
              {!children.length && <button className="project-tree-empty" disabled={busy} onClick={() => onNewCreative(group.id)}><Plus size={13} />添加第一个创意</button>}
            </div>
            {showMore && <div className="sidebar-more-wrap">
              <button
                ref={moreOpenFor === group.id ? moreButtonRef : undefined}
                type="button"
                className={`sidebar-more-button${moreOpenFor === group.id ? ' active' : ''}`}
                aria-expanded={moreOpenFor === group.id}
                aria-haspopup="dialog"
                disabled={busy}
                onClick={() => setMoreOpenFor(current => current === group.id ? null : group.id)}
              ><Ellipsis size={14} /><span>More</span></button>
              {moreOpenFor === group.id && <MorePopover
                creatives={children}
                agentActivities={agentActivities}
                unreadIds={unreadIds}
                pinnedIds={pinnedSet}
                currentId={currentId}
                busy={busy}
                anchorRef={moreButtonRef}
                onSelect={onSelect}
                onTogglePin={id => togglePin(group.id, id)}
                onClose={() => setMoreOpenFor(null)}
                onViewAll={() => { setViewAll(previous => ({ ...previous, [group.id]: true })); setMoreOpenFor(null); }}
              />}
            </div>}
          </> : <>
            {children.map(creative => <CreativeRow
              key={creative.id}
              creative={creative}
              agentMode={!!agentActivities}
              activity={agentActivities?.[creative.id]}
              unread={unreadIds?.has(creative.id)}
              selected={creative.id === currentId}
              busy={busy}
              running={running}
              showArchived={showArchived}
              badge={creative.inProgressCount || 0}
              pinned={!showArchived && pinnedSet.has(creative.id)}
              pinVisible={!showArchived && pinnedSet.has(creative.id)}
              onSelect={onSelect}
              onArchive={onArchive}
              onTogglePin={showArchived ? undefined : id => togglePin(group.id, id)}
            />)}
            {!children.length && <button className="project-tree-empty" disabled={busy} onClick={() => onNewCreative(group.id)}><Plus size={13} />添加第一个创意</button>}
            {viewAll[group.id] && !showArchived && <button type="button" className="sidebar-compact-toggle" onClick={() => setViewAll(previous => ({ ...previous, [group.id]: false }))}>返回精简列表</button>}
          </>}
        </div>}
      </div>;
    })}{showArchived && !archivedCount && <p className="project-list-empty">暂无已归档创意</p>}</div>
    <button className={`archive-list-toggle ${showArchived ? 'active' : ''}`} aria-pressed={showArchived} onClick={() => onShowArchived(!showArchived)}>{showArchived ? <ArrowLeft size={15} /> : <Archive size={15} />}<span>{showArchived ? '返回全部创意' : '已归档创意'}</span>{!showArchived && <small>{archivedCount}</small>}</button>
  </section>;
}
