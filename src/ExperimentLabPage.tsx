import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, FlaskConical, LoaderCircle, Package, Plus } from 'lucide-react';
import type { Project, ProjectSummary } from '../shared/domain';
import { api } from './api';
import IntelligentUIAgentWorkspace from './IntelligentUIAgentWorkspace';
import { useAgentTheme } from './intelligent-ui/useAgentTheme';
import './experiment-workbench.css';

/** Direct entry to the real project-backed Agent workspace, without a demo project. */
export default function ExperimentLabPage() {
  const theme = useAgentTheme();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<Project>();
  const [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState(() => new URLSearchParams(window.location.search).get('project') || '');
  const [creating, setCreating] = useState(false);
  const [taskAssetsOpen, setTaskAssetsOpen] = useState(false);
  const closeTaskAssets = useCallback(() => setTaskAssetsOpen(false), []);
  useEffect(() => {
    const abort = new AbortController();
    void api<ProjectSummary[]>('/api/projects', { signal: abort.signal }).then(items => { setProjects(items.filter(p => !p.archivedAt)); setLoading(false); }).catch(failure => { if (!abort.signal.aborted) { setError(failure.message); setLoading(false); } });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    if (!projectId) { setProject(undefined); return; }
    const abort = new AbortController();
    setLoading(true); setError(''); setProject(undefined);
    void api<Project>(`/api/projects/${encodeURIComponent(projectId)}`, { signal: abort.signal }).then(p => { setProject(p); setLoading(false); }).catch(failure => { if (!abort.signal.aborted) { setError(failure.message); setLoading(false); } });
    return () => abort.abort();
  }, [projectId]);
  const selectProject = (id: string) => { setTaskAssetsOpen(false); setProjectId(id); const url = new URL(window.location.href); if (id) url.searchParams.set('project', id); else url.searchParams.delete('project'); window.history.replaceState(null, '', url); };
  const create = async () => {
    if (creating) return;
    setCreating(true); setError('');
    try { const p = await api<Project>('/api/projects', { method: 'POST', body: JSON.stringify({ title: '视频创作实验' }) }); setProjects(items => [{ ...p, stage: 0 }, ...items]); selectProject(p.id); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '创建失败，请重试。'); }
    finally { setCreating(false); }
  };
  return <main className="lab-page">
    <header className="lab-page-header"><a href="/" aria-label="返回工作台"><ArrowLeft size={15} /><FlaskConical size={17} />Sail 实验台</a><span>一次创作，也是一条可以复用的路径。</span><select aria-label="选择创意" value={projectId} onChange={e => selectProject(e.target.value)}><option value="">选择已有创意</option>{projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select>{project && !loading && <button type="button" aria-expanded={taskAssetsOpen} aria-controls="iua-task-assets" onClick={() => setTaskAssetsOpen(open => !open)}><Package size={13} />任务素材</button>}<button type="button" disabled={creating} onClick={() => void create()}>{creating ? <LoaderCircle size={13} /> : <Plus size={13} />}新建实验</button></header>
    {error && <div className="lab-page-error" role="alert">{error}</div>}
    <div className="lab-page-body">{loading ? <div className="lab-page-loading">正在打开实验台…</div> : project ? <IntelligentUIAgentWorkspace key={project.id} theme={theme} project={project} canvas={<div className="lab-page-loading"><p>在完整创作工作台中查看镜头与视频画布。</p><a href="/">打开工作台</a></div>} disabled={!!project.archivedAt} onProjectUpdate={setProject} onBeforeSend={async () => project} onCanvasState={() => {}} onCanvasDraftConsumed={() => {}} taskAssetsOpen={taskAssetsOpen} onOpenTaskAssets={() => setTaskAssetsOpen(true)} onCloseTaskAssets={closeTaskAssets} /> : <div className="lab-page-loading"><FlaskConical size={36} strokeWidth={1.3} style={{ margin: '0 auto 18px' }} /><h1>让创作过程，成为你的资产。</h1><p>选择已有创意继续，或新建一个实验，从参考、方法和素材开始。</p><button type="button" disabled={creating} onClick={() => void create()}>新建视频创作实验</button></div>}</div>
  </main>;
}
