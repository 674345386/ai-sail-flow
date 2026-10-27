import { useEffect, useState } from 'react';
import { LoaderCircle, Sparkles } from 'lucide-react';
import { getStudioProject, searchRadar, startRemake, type StudioProject, type TrendItem } from './studioApi';

export default function StudioRemake({
  trendId,
  onOpenProject,
  onOpenRadar,
}: {
  trendId?: string;
  onOpenProject: (id: string) => void;
  onOpenRadar: () => void;
}) {
  const [brief, setBrief] = useState('替换为自有产品外观与口播，保留原片节奏与开场钩子');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<TrendItem | null>(null);
  const [project, setProject] = useState<StudioProject | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!trendId) { setPicked(null); return; }
      try {
        const result = await searchRadar('爆款参考');
        if (cancelled) return;
        setPicked(result.items.find(item => item.id === trendId) || result.items[0] || null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '无法加载热片');
      }
    })();
    return () => { cancelled = true; };
  }, [trendId]);

  const run = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      let chosen = picked;
      let id = chosen?.id || trendId;
      if (!id) {
        const sample = await searchRadar('示例热片');
        chosen = sample.items[0] || null;
        id = chosen?.id;
        if (chosen) setPicked(chosen);
      }
      if (!id) throw new Error('请先从爆款雷达选择一条热片');
      const created = await startRemake({ trendId: id, title: chosen ? `二创 · ${chosen.title}` : undefined, brief: brief.trim() });
      setProject(created);
      onOpenProject(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '二创任务未能启动');
    } finally {
      setBusy(false);
    }
  };

  const loadProject = async (id: string) => {
    try {
      setProject(await getStudioProject(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : '项目读取失败');
    }
  };

  useEffect(() => {
    if (project?.id) void loadProject(project.id);
  }, [project?.id]);

  return (
    <div className="studio-stack">
      <div className="studio-hero">
        <div>
          <div className="eyebrow">MODULE D <span>/</span> 热片复刻</div>
          <h1>从热片发起二创</h1>
          <p>选定雷达条目后，生成可继续精修的二创项目。当前写入工作室项目状态，后续可复用现有 remix 能力。</p>
        </div>
      </div>

      <section className="studio-panel">
        <div className="studio-panel-heading">
          <h2><Sparkles size={16} />二创配置</h2>
          <button type="button" className="text-button" onClick={onOpenRadar}>去雷达选片</button>
        </div>
        {picked ? (
          <article className="studio-trend-item" style={{ marginBottom: 14 }}>
            <div className="studio-trend-thumb">
              {picked.thumbnail ? <img src={picked.thumbnail} alt="" /> : <Sparkles size={18} />}
            </div>
            <div className="studio-trend-copy">
              <strong>{picked.title}</strong>
              <p>{picked.platform} · @{picked.author}</p>
              <div className="studio-trend-tags">{picked.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
            </div>
            <span className="studio-badge run">已选中</span>
          </article>
        ) : (
          <div className="studio-empty" style={{ marginBottom: 14 }}>尚未选定热片。可先打开爆款雷达，或在本页直接用示例片发起。</div>
        )}
        <div className="studio-form-grid">
          <label className="field"><span className="field-label">二创要求</span>
            <textarea className="input textarea" rows={3} value={brief} disabled={busy} onChange={e => setBrief(e.target.value)} />
          </label>
          <div>
            <button type="button" className="btn primary" disabled={busy} onClick={() => void run()}>
              {busy ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}
              {busy ? '创建中…' : picked || trendId ? '开始二创' : '使用示例热片二创'}
            </button>
          </div>
          {error && <p className="error-text" role="alert">{error}</p>}
          {project && (
            <div className="studio-note">
              <Sparkles size={14} />
              <span>已创建项目「{project.title}」，状态：{project.remakeStatus || project.status}。</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
