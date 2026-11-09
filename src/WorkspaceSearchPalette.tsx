import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Archive, Clapperboard, FolderOpen, Plus, Search } from 'lucide-react';
import type { ProjectSummary, WorkspaceProject } from '../shared/domain';

type Props = {
  creatives: ProjectSummary[];
  groups: WorkspaceProject[];
  busy: boolean;
  onChoose: (id: string) => void;
  onCreateCreative: () => void;
  onCreateProject: () => void;
  onClose: () => void;
};

export default function WorkspaceSearchPalette({ creatives, groups, busy, onChoose, onCreateCreative, onCreateProject, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const normalized = query.trim().toLocaleLowerCase();
  const matches = useMemo(() => creatives
    .filter(item => !normalized || `${item.title} ${groups.find(group => group.id === item.parentProjectId)?.title || ''}`.toLocaleLowerCase().includes(normalized))
    .slice(0, 8), [creatives, groups, normalized]);
  const total = matches.length + 2;

  useEffect(() => { inputRef.current?.focus(); }, []);
  const chooseActive = (index: number) => {
    if (index < matches.length) onChoose(matches[index].id);
    else if (index === matches.length) onCreateCreative();
    else onCreateProject();
    onClose();
  };
  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(value => (value + 1) % total); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive(value => (value + total - 1) % total); }
    if (event.key === 'Enter') { event.preventDefault(); chooseActive(active); }
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
  };

  return <div className="workspace-search-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="workspace-search-palette" role="dialog" aria-modal="true" aria-label="搜索与创建">
      <label className="workspace-search-input"><Search size={18} aria-hidden="true" /><input ref={inputRef} value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={onInputKeyDown} placeholder="搜索创意或工作空间…" /><kbd>ESC</kbd></label>
      <div className="workspace-search-results">
        {matches.map((creative, index) => <button key={creative.id} type="button" className={`workspace-search-result${active === index ? ' is-active' : ''}`} disabled={busy} onMouseEnter={() => setActive(index)} onClick={() => chooseActive(index)}>
          <span className="workspace-search-result-icon"><Clapperboard size={16} /></span><span className="workspace-search-copy"><strong>{creative.title}</strong><small>{groups.find(group => group.id === creative.parentProjectId)?.title || '默认项目'}</small></span>{creative.archivedAt && <span className="workspace-search-archived"><Archive size={13} />已归档</span>}
        </button>)}
        {!matches.length && normalized && <p className="workspace-search-empty">没有找到匹配的创意或工作空间</p>}
      </div>
      <div className="workspace-search-actions">
        <button type="button" className={`workspace-search-result${active === matches.length ? ' is-active' : ''}`} disabled={busy} onMouseEnter={() => setActive(matches.length)} onClick={() => chooseActive(matches.length)}><span className="workspace-search-result-icon"><Plus size={16} /></span><span className="workspace-search-copy"><strong>新建创意</strong><small>在当前工作空间中创建</small></span></button>
        <button type="button" className={`workspace-search-result${active === matches.length + 1 ? ' is-active' : ''}`} disabled={busy} onMouseEnter={() => setActive(matches.length + 1)} onClick={() => chooseActive(matches.length + 1)}><span className="workspace-search-result-icon"><FolderOpen size={16} /></span><span className="workspace-search-copy"><strong>新建工作空间</strong><small>创建工作空间并添加创意</small></span></button>
      </div>
      <footer className="workspace-search-footer"><span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>↵</kbd> 打开</span><span><kbd>⌘</kbd><kbd>K</kbd> 搜索与创建</span></footer>
    </section>
  </div>;
}
