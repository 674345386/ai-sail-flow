import { useState } from 'react';
import { LoaderCircle, Radar, Sparkles } from 'lucide-react';
import { searchRadar, type TrendItem } from './studioApi';

const platforms = ['全部平台', 'TikTok', 'Instagram', 'YouTube Shorts'];

function formatCount(value?: number) {
  if (value == null) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export default function StudioRadar({ onRemake }: { onRemake: (item: TrendItem) => void }) {
  const [query, setQuery] = useState('便携咖啡杯 开箱');
  const [platform, setPlatform] = useState(platforms[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState<TrendItem[]>([]);
  const [searchedAt, setSearchedAt] = useState('');

  const runSearch = async () => {
    if (!query.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const result = await searchRadar(query.trim(), platform === '全部平台' ? undefined : platform);
      setItems(result.items);
      setSearchedAt(result.searchedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : '雷达搜索失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="studio-stack">
      <div className="studio-hero">
        <div>
          <div className="eyebrow">MODULE B <span>/</span> 爆款雷达</div>
          <h1>热片扫描与结构沉淀</h1>
          <p>按关键词检索近期热片样例。接口返回 3 条可操作的 TrendItem，便于直接发起二创。</p>
        </div>
      </div>

      <section className="studio-panel">
        <div className="studio-panel-heading"><h2><Radar size={16} />雷达搜索</h2>{searchedAt && <span className="studio-badge">最近检索 {new Date(searchedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>}</div>
        <div className="studio-form-row">
          <label className="field"><span className="field-label">关键词</span>
            <input className="input" value={query} disabled={busy} onChange={e => setQuery(e.target.value)} placeholder="品类 / 卖点 / 场景" onKeyDown={e => { if (e.key === 'Enter') void runSearch(); }} />
          </label>
          <label className="field"><span className="field-label">平台</span>
            <select className="input" value={platform} disabled={busy} onChange={e => setPlatform(e.target.value)}>
              {platforms.map(item => <option key={item}>{item}</option>)}
            </select>
          </label>
          <button type="button" className="btn primary" disabled={busy || !query.trim()} onClick={() => void runSearch()}>
            {busy ? <LoaderCircle size={15} className="spin" /> : <Radar size={15} />}
            {busy ? '扫描中' : '开始扫描'}
          </button>
        </div>
        {error && <p className="error-text" role="alert" style={{ marginTop: 12 }}>{error}</p>}
      </section>

      <section className="studio-panel">
        <div className="studio-panel-heading"><h2>热片结果</h2><span className="studio-badge">{items.length} 条</span></div>
        {items.length === 0 ? (
          <div className="studio-empty">输入关键词后开始扫描。将返回 3 条示例热片。</div>
        ) : (
          <div className="studio-trend-list">
            {items.map(item => (
              <article key={item.id} className="studio-trend-item">
                <div className="studio-trend-thumb">
                  {item.thumbnail ? <img src={item.thumbnail} alt="" /> : <Radar size={18} />}
                </div>
                <div className="studio-trend-copy">
                  <strong>{item.title}</strong>
                  <p>{item.platform} · @{item.author}</p>
                  <div className="studio-metrics">
                    <span>播放 {formatCount(item.metrics?.views)}</span>
                    <span>点赞 {formatCount(item.metrics?.likes)}</span>
                    <span>评论 {formatCount(item.metrics?.comments)}</span>
                  </div>
                  <div className="studio-trend-tags">{item.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
                  {item.analysis?.summary && <p style={{ marginTop: 8 }}>{item.analysis.summary}</p>}
                </div>
                <button type="button" className="btn small" onClick={() => onRemake(item)}>
                  <Sparkles size={14} />二创此片
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
