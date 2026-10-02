import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, ArrowLeft, ChevronDown, ChevronRight, Clapperboard, FolderOpen, Pencil, Plus } from 'lucide-react';
import type { ProjectSummary, WorkspaceProject } from '../shared/domain';

export default function ProjectNavigation({ groups, creatives, currentId, currentParentId, busy, running, showArchived, onShowArchived, onNewProject, onRenameProject, onNewCreative, onSelect, onArchive, collapsed = false, onExpand }: {
  groups: WorkspaceProject[]; creatives: ProjectSummary[]; currentId: string; currentParentId?: string; busy: boolean; running: boolean; showArchived: boolean;
  onShowArchived: (value: boolean) => void; onNewProject: () => void; onRenameProject: (group: WorkspaceProject) => void;
  onNewCreative: (parentId: string) => void; onSelect: (id: string) => void; onArchive: (id: string, archived: boolean) => void;
  collapsed?: boolean; onExpand?: () => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => { if (currentParentId) setExpanded(previous => ({ ...previous, [currentParentId]: true })); }, [currentId, currentParentId, showArchived]);
  const archivedCount = creatives.filter(creative => creative.archivedAt).length;
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
      return <div className="project-tree-group" key={group.id}>
        <div className={`project-tree-heading ${group.id === currentParentId ? 'current' : ''}`}>
          <button className="project-tree-folder" aria-expanded={open} onClick={() => setExpanded(previous => ({ ...previous, [group.id]: !open }))} title={group.title}>
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<FolderOpen size={16} /><span>{group.title}</span><small>{children.length}</small>
          </button>
          <button className="project-tree-action" aria-label={`重命名项目：${group.title}`} title="重命名项目" disabled={busy} onClick={() => onRenameProject(group)}><Pencil size={13} /></button>
          <button className="project-tree-action" aria-label={`在${group.title}下新建创意`} title="新建创意" disabled={busy} onClick={() => onNewCreative(group.id)}><Plus size={14} /></button>
        </div>
        {open && <div className="project-tree-children">{children.map(creative => <div key={creative.id} className={`project-row ${creative.id === currentId ? 'selected' : ''}`}>
          <button className={`project-link ${creative.id === currentId ? 'selected' : ''}`} aria-current={creative.id === currentId ? 'page' : undefined} onClick={() => onSelect(creative.id)} disabled={busy} title={creative.title}><Clapperboard size={14} /><span>{creative.title}</span>{creative.isDemo && <small>示例</small>}</button>
          <button className="project-archive-action" aria-label={`${showArchived ? '恢复' : '归档'}创意：${creative.title}`} title={showArchived ? '恢复创意' : '归档创意'} disabled={busy || (creative.id === currentId && running)} onClick={() => onArchive(creative.id, !showArchived)}>{showArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}</button>
        </div>)}{!children.length && <button className="project-tree-empty" disabled={busy} onClick={() => onNewCreative(group.id)}><Plus size={13} />添加第一个创意</button>}</div>}
      </div>;
    })}{showArchived && !archivedCount && <p className="project-list-empty">暂无已归档创意</p>}</div>
    <button className={`archive-list-toggle ${showArchived ? 'active' : ''}`} aria-pressed={showArchived} onClick={() => onShowArchived(!showArchived)}>{showArchived ? <ArrowLeft size={15} /> : <Archive size={15} />}<span>{showArchived ? '返回全部创意' : '已归档创意'}</span>{!showArchived && <small>{archivedCount}</small>}</button>
  </section>;
}
