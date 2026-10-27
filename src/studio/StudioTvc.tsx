import { useEffect, useState } from 'react';
import { Clapperboard, LoaderCircle, Sparkles } from 'lucide-react';
import { createStudioProject, listStudioProjects, queueTvc, type StudioProject } from './studioApi';

export default function StudioTvc({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [brief, setBrief] = useState('15 秒品牌 TVC：开场钩子 → 产品演示 → 卖点强化 → 行动号召');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = async () => {
    const list = await listStudioProjects();
    const creatives = list.filter(item => item.module === 'creatives' || item.module === 'tvc');
    setProjects(creatives);
    if (!selectedId && creatives[0]) setSelectedId(creatives[0].id);
  };

  useEffect(() => { void refresh().catch(e => setError(e instanceof Error ? e.message : '无法加载项目')); }, []);

  const ensureProject = async () => {
    if (selectedId) return selectedId;
    const created = await createStudioProject({ title: '未命名 TVC 项目', module: 'tvc', brief });
    setProjects(current => [created, ...current]);
    setSelectedId(created.id);
    return created.id;
  };

  const start = async () => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const projectId = await ensureProject();
      const result = await queueTvc({ projectId, brief: brief.trim() });
      setMessage(result.message);
      await refresh();
      onOpenProject(projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'TVC 任务未能启动');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="studio-stack">
      <div className="studio-hero">
        <div>
          <div className="eyebrow">MODULE C <span>/</span> TVC</div>
          <h1>由产品创意生成 TVC</h1>
          <p>选择已有创意包或新建项目，排队生成短片结构草案。当前为工作流桩，会写入工作室项目状态。</p>
        </div>
      </div>

      <section className="studio-panel">
        <div className="studio-panel-heading"><h2><Clapperboard size={16} />TVC 配置</h2></div>
        <div className="studio-form-grid">
          <label className="field"><span className="field-label">来源创意 / 项目</span>
            <select className="input" value={selectedId} disabled={busy} onChange={e => setSelectedId(e.target.value)}>
              <option value="">新建 TVC 项目</option>
              {projects.map(project => <option key={project.id} value={project.id}>{project.title} · {project.status}</option>)}
            </select>
          </label>
          <label className="field"><span className="field-label">成片简述</span>
            <textarea className="input textarea" rows={3} value={brief} disabled={busy} onChange={e => setBrief(e.target.value)} />
          </label>
          <div>
            <button type="button" className="btn primary" disabled={busy || !brief.trim()} onClick={() => void start()}>
              {busy ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}
              {busy ? '排队中…' : '生成 TVC 草案'}
            </button>
          </div>
          {message && <div className="studio-note"><Clapperboard size={14} /><span>{message}</span></div>}
          {error && <p className="error-text" role="alert">{error}</p>}
        </div>
      </section>

      <section className="studio-panel">
        <div className="studio-panel-heading"><h2>近期工作室项目</h2><span className="studio-badge">{projects.length}</span></div>
        {projects.length === 0 ? (
          <div className="studio-empty">还没有创意或 TVC 项目。可先去「产品创意」生成素材，或直接在此新建。</div>
        ) : (
          <div className="studio-trend-list">
            {projects.slice(0, 6).map(project => (
              <article key={project.id} className="studio-trend-item" style={{ gridTemplateColumns: '1fr auto' }}>
                <div className="studio-trend-copy">
                  <strong>{project.title}</strong>
                  <p>{project.module} · {project.status} · 更新于 {new Date(project.updatedAt).toLocaleString('zh-CN')}</p>
                </div>
                <button type="button" className="btn small" onClick={() => onOpenProject(project.id)}>打开</button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
