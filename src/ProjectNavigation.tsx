import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Archive, ArchiveRestore, ArrowLeft, ChevronDown, ChevronRight, Clapperboard, Ellipsis, FileText, FolderOpen, MessageSquare, Pencil, Pin, Plus, Search } from 'lucide-react';
import type { ProjectSummary, WorkspaceProject } from '../shared/domain';

const RECENT_LIMIT = 4;
const MORE_LIST_LIMIT = 20;
const pinsKey = (projectId: string) => `sop-creative-pins:${projectId}`;
const recentKey = (projectId: string) => `sop-creative-recent:${projectId}`;

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

function TaskBadge({ count }: { count: number }) {
  return <span className="creative-task-badge" title={`进行中任务：${count}`} aria-label={`进行中任务 ${count}`}>
    <MessageSquare size={12} aria-hidden="true" /><em>{count}</em>
  </span>;
}

function CreativeRow({
  creative, selected, busy, running, showArchived, badge, pinned, onSelect, onArchive, onTogglePin, pinVisible = false,
}: {
  creative: ProjectSummary; selected: boolean; busy: boolean; running: boolean; showArchived: boolean;
  badge: number; pinned?: boolean; onSelect: (id: string) => void; onArchive: (id: string, archived: boolean) => void;
  onTogglePin?: (id: string) => void; pinVisible?: boolean;
}) {
  return <div className={`project-row ${selected ? 'selected' : ''}${pinned ? ' is-pinned' : ''}`}>
    <button className={`project-link ${selected ? 'selected' : ''}`} aria-current={selected ? 'page' : undefined} onClick={() => onSelect(creative.id)} disabled={busy} title={creative.title}>
      <Clapperboard size={14} /><span>{creative.title}</span>
      {creative.isDemo && <small>示例</small>}
      <TaskBadge count={badge} />
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
    <button className="project-archive-action" aria-label={`${showArchived ? '恢复' : '归档'}创意：${creative.title}`} title={showArchived ? '恢复创意' : '归档创意'} disabled={busy || (selected && running)} onClick={() => onArchive(creative.id, !showArchived)}>{showArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}</button>
  </div>;
}

function MorePopover({
  creatives, recentOrder, pinnedIds, currentId, busy, onSelect, onTogglePin, onViewAll, onClose, anchorRef,
}: {
  creatives: ProjectSummary[]; recentOrder: string[]; pinnedIds: Set<string>; currentId: string; busy: boolean;
  onSelect: (id: string) => void; onTogglePin: (id: string) => void; onViewAll: () => void; onClose: () => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
}) {
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const place = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, window.innerWidth * 0.7);
      const left = Math.min(rect.right + 10, window.innerWidth - width - 12);
      const top = Math.min(Math.max(12, rect.top), window.innerHeight - 80);
      setCoords({ top, left: Math.max(12, left) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchorRef]);
  const ranked = useMemo(() => {
    const rank = new Map(recentOrder.map((id, index) => [id, index]));
    return [...creatives].sort((a, b) => {
      const ar = rank.has(a.id) ? rank.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const br = rank.has(b.id) ? rank.get(b.id)! : Number.MAX_SAFE_INTEGER;
      if (ar !== br) return ar - br;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [creatives, recentOrder]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? ranked.filter(item => item.title.toLowerCase().includes(q)) : ranked;
    return list.slice(0, MORE_LIST_LIMIT);
  }, [ranked, query]);

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

  return <div className="sidebar-more-popover" ref={panelRef} role="dialog" aria-label="更多创作" style={{ top: coords.top, left: coords.left }}>
    <div className="sidebar-more-toolbar">
      <label className="sidebar-more-search">
        <Search size={14} aria-hidden="true" />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索创作…" aria-label="搜索创作" autoFocus />
      </label>
      <button type="button" className="sidebar-more-view-all" onClick={onViewAll}>查看全部</button>
    </div>
    <div className="sidebar-more-list">
      {filtered.map(creative => {
        const pinned = pinnedIds.has(creative.id);
        return <div key={creative.id} className={`sidebar-more-row${creative.id === currentId ? ' selected' : ''}`}>
          <button type="button" className="sidebar-more-link" disabled={busy} onClick={() => { onSelect(creative.id); onClose(); }} title={creative.title}>
            <FileText size={14} aria-hidden="true" /><span>{creative.title}</span>
            <TaskBadge count={creative.inProgressCount || 0} />
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

export default function ProjectNavigation({ groups, creatives, currentId, currentParentId, busy, running, showArchived, onShowArchived, onNewProject, onRenameProject, onNewCreative, onSelect, onArchive, collapsed = false, onExpand }: {
  groups: WorkspaceProject[]; creatives: ProjectSummary[]; currentId: string; currentParentId?: string; busy: boolean; running: boolean; showArchived: boolean;
  onShowArchived: (value: boolean) => void; onNewProject: () => void; onRenameProject: (group: WorkspaceProject) => void;
  onNewCreative: (parentId: string) => void; onSelect: (id: string) => void; onArchive: (id: string, archived: boolean) => void;
  collapsed?: boolean; onExpand?: () => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [viewAll, setViewAll] = useState<Record<string, boolean>>({});
  const [pinnedByProject, setPinnedByProject] = useState<Record<string, string[]>>({});
  const [recentByProject, setRecentByProject] = useState<Record<string, string[]>>({});
  const [moreOpenFor, setMoreOpenFor] = useState<string | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (currentParentId) setExpanded(previous => ({ ...previous, [currentParentId]: true })); }, [currentId, currentParentId, showArchived]);

  useEffect(() => {
    if (!currentParentId || !currentId) return;
    setRecentByProject(previous => {
      const existing = previous[currentParentId] || readIds(recentKey(currentParentId));
      const next = [currentId, ...existing.filter(id => id !== currentId)];
      writeIds(recentKey(currentParentId), next);
      return { ...previous, [currentParentId]: next };
    });
    setPinnedByProject(previous => previous[currentParentId] ? previous : { ...previous, [currentParentId]: readIds(pinsKey(currentParentId)) });
  }, [currentId, currentParentId]);

  const archivedCount = creatives.filter(creative => creative.archivedAt).length;

  const ensurePrefs = (projectId: string) => {
    setPinnedByProject(previous => previous[projectId] ? previous : { ...previous, [projectId]: readIds(pinsKey(projectId)) });
    setRecentByProject(previous => previous[projectId] ? previous : { ...previous, [projectId]: readIds(recentKey(projectId)) });
  };

  const togglePin = (projectId: string, creativeId: string) => {
    setPinnedByProject(previous => {
      const current = previous[projectId] || readIds(pinsKey(projectId));
      const next = current.includes(creativeId) ? current.filter(id => id !== creativeId) : [...current, creativeId];
      writeIds(pinsKey(projectId), next);
      return { ...previous, [projectId]: next };
    });
  };

  if (collapsed) return <section className="sidebar-projects sidebar-projects-compact" aria-label="项目与创意">
    <button className="sidebar-rail-button" aria-label="新建项目" title="新建项目" disabled={busy} onClick={onNewProject}><Plus size={17} /></button>
    <div className="sidebar-project-rail">{groups.filter(group => !showArchived || creatives.some(creative => creative.parentProjectId === group.id && creative.archivedAt)).map(group => <button key={group.id} className={`sidebar-rail-button ${group.id === currentParentId ? 'active' : ''}`} title={group.title} aria-label={`打开项目：${group.title}`} onClick={() => { setExpanded(previous => ({ ...previous, [group.id]: true })); onExpand?.(); }}><FolderOpen size={17} /></button>)}</div>
    <button className={`sidebar-rail-button ${showArchived ? 'active' : ''}`} aria-label={showArchived ? '返回全部创意' : `已归档创意：${archivedCount}`} title={showArchived ? '返回全部创意' : `已归档创意（${archivedCount}）`} aria-pressed={showArchived} onClick={() => { onShowArchived(!showArchived); onExpand?.(); }}>{showArchived ? <ArrowLeft size={17} /> : <Archive size={17} />}</button>
  </section>;

  return <section className="sidebar-projects" aria-label="项目与创意">
    <div className="nav-section-label recent-label">项目<button className="icon-btn" aria-label="新建项目" title="新建项目" onClick={onNewProject} disabled={busy}><Plus size={16} /></button></div>
    <div className="project-list project-tree">{groups.map(group => {
      const children = creatives.filter(creative => creative.parentProjectId === group.id && (showArchived ? Boolean(creative.archivedAt) : !creative.archivedAt));
      if (showArchived && !children.length) return null;
      const open = expanded[group.id] ?? false;
      const isCurrentProject = group.id === currentParentId;
      const useCompact = !showArchived && isCurrentProject && !viewAll[group.id];
      const pinnedIds = pinnedByProject[group.id] || (isCurrentProject ? readIds(pinsKey(group.id)) : []);
      const recentOrder = recentByProject[group.id] || (isCurrentProject ? readIds(recentKey(group.id)) : []);
      const pinnedSet = new Set(pinnedIds.filter(id => children.some(creative => creative.id === id)));
      const favorites = pinnedIds.map(id => children.find(creative => creative.id === id)).filter((item): item is ProjectSummary => !!item);
      const recentRank = [currentId, ...recentOrder.filter(id => id !== currentId)];
      const recent = recentRank
        .map(id => children.find(creative => creative.id === id))
        .filter((item): item is ProjectSummary => !!item && !pinnedSet.has(item.id))
        .concat(children.filter(creative => !pinnedSet.has(creative.id) && !recentRank.includes(creative.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
        .slice(0, RECENT_LIMIT);
      const visibleIds = new Set([...favorites, ...recent].map(item => item.id));
      const showMore = useCompact && children.length > visibleIds.size;

      return <div className="project-tree-group" key={group.id}>
        <div className={`project-tree-heading ${isCurrentProject ? 'current' : ''}`}>
          <button className="project-tree-folder" aria-expanded={open} onClick={() => {
            ensurePrefs(group.id);
            setExpanded(previous => ({ ...previous, [group.id]: !open }));
            if (open) { setMoreOpenFor(null); setViewAll(previous => ({ ...previous, [group.id]: false })); }
          }} title={group.title}>
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <FolderOpen size={16} /><span>{group.title}</span><small>{children.length}</small>
          </button>
          <button className="project-tree-action" aria-label={`重命名项目：${group.title}`} title="重命名项目" disabled={busy} onClick={() => onRenameProject(group)}><Pencil size={13} /></button>
          <button className="project-tree-action" aria-label={`在${group.title}下新建创意`} title="新建创意" disabled={busy} onClick={() => onNewCreative(group.id)}><Plus size={14} /></button>
        </div>
        {open && <div className="project-tree-children">
          {useCompact ? <>
            {!!favorites.length && <div className="sidebar-creative-block" aria-label="已固定">
              <div className="sidebar-creative-label"><Pin size={12} aria-hidden="true" /><span>已固定</span></div>
              {favorites.map(creative => <CreativeRow
                key={creative.id}
                creative={creative}
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
            <div className="sidebar-creative-block" aria-label="最近">
              {!!favorites.length && <div className="sidebar-creative-label"><span>最近</span></div>}
              {recent.map(creative => <CreativeRow
                key={creative.id}
                creative={creative}
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
                recentOrder={[currentId, ...recentOrder.filter(id => id !== currentId)]}
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
