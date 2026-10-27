import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, ImagePlus, LoaderCircle, Sparkles, X } from 'lucide-react';
import {
  creativeKindLabels,
  generateCreatives,
  getCreativeJobStatus,
  type JobStatus,
  type StudioCreativeAsset,
  type StudioCreativeKind,
} from './studioApi';

const kinds: StudioCreativeKind[] = ['hero', 'selling', 'scene', 'kv'];
const MAX_PRODUCT_IMAGES = 4;

type LocalPreview = { id: string; file: File; url: string };

function assetStatusLabel(asset: StudioCreativeAsset) {
  if (asset.status === 'completed') return '已生成';
  if (asset.status === 'failed') return asset.error || '生成失败';
  if (asset.status === 'running') return '生成中…';
  return '排队中';
}

export default function StudioCreatives({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const [brief, setBrief] = useState('便携冷萃咖啡杯 · 夏日通勤场景 · 清爽极简风');
  const [title, setTitle] = useState('夏季上新主图包');
  const [selected, setSelected] = useState<StudioCreativeKind[]>([...kinds]);
  const [previews, setPreviews] = useState<LocalPreview[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [job, setJob] = useState<JobStatus | null>(null);
  const [assets, setAssets] = useState<StudioCreativeAsset[]>([]);
  const [projectId, setProjectId] = useState('');
  const poll = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const previewsRef = useRef(previews);
  previewsRef.current = previews;

  useEffect(() => () => {
    if (poll.current) window.clearInterval(poll.current);
    for (const item of previewsRef.current) URL.revokeObjectURL(item.url);
  }, []);

  const galleryByKind = useMemo(() => {
    const order = selected.length ? selected : kinds;
    return order.map(kind => ({
      kind,
      items: assets.filter(asset => asset.kind === kind),
    })).filter(group => group.items.length > 0);
  }, [assets, selected]);

  const toggleKind = (kind: StudioCreativeKind) => {
    setSelected(current => current.includes(kind) ? current.filter(item => item !== kind) : [...current, kind]);
  };

  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const incoming = [...list].filter(file => /^image\/(png|jpeg|jpg|webp)$/i.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name));
    if (!incoming.length) {
      setError('产品参考图支持 JPG、PNG、WebP。');
      return;
    }
    setError('');
    setPreviews(current => {
      const room = Math.max(0, MAX_PRODUCT_IMAGES - current.length);
      const next = incoming.slice(0, room).map(file => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }));
      return [...current, ...next];
    });
  };

  const removePreview = (id: string) => {
    setPreviews(current => {
      const target = current.find(item => item.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter(item => item.id !== id);
    });
  };

  const start = async () => {
    if (!brief.trim() || selected.length === 0 || busy) return;
    setBusy(true); setError(''); setJob(null); setAssets([]);
    try {
      const result = await generateCreatives({
        title: title.trim() || '未命名创意包',
        brief: brief.trim(),
        kinds: selected,
        images: previews.map(item => item.file),
      });
      setProjectId(result.projectId);
      setAssets(result.assets);
      setJob({
        jobId: result.jobId,
        projectId: result.projectId,
        status: 'queued',
        progress: 4,
        message: result.usedEdits ? '已排队，准备基于产品参考图调用图片 edits…' : '已排队，准备调用图片 generations…',
        assets: result.assets,
        configured: result.configured,
      });
      if (poll.current) window.clearInterval(poll.current);
      poll.current = window.setInterval(async () => {
        try {
          const status = await getCreativeJobStatus(result.jobId);
          setJob(status);
          if (status.assets) setAssets(status.assets);
          if (status.status === 'completed' || status.status === 'failed') {
            if (poll.current) window.clearInterval(poll.current);
            poll.current = null;
            setBusy(false);
            if (status.status === 'failed') setError(status.message || '套图生成失败');
          }
        } catch (e) {
          if (poll.current) window.clearInterval(poll.current);
          poll.current = null;
          setBusy(false);
          setError(e instanceof Error ? e.message : '状态查询失败');
        }
      }, 1200);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : '生成任务未能启动');
    }
  };

  return (
    <div className="studio-stack">
      <div className="studio-hero">
        <div>
          <div className="eyebrow">MODULE A <span>/</span> 商品套图</div>
          <h1>几秒生成主图 / 卖点 / 场景 / KV</h1>
          <p>上传产品参考图并填写简述后，将调用现有图片生成接口（有参考图走 edits，否则 generations）生成四类套图。未配置 API Key 时会明确报错，不会伪造成功。</p>
        </div>
      </div>

      <section className="studio-panel">
        <div className="studio-panel-heading">
          <h2><ImagePlus size={16} />创意生成</h2>
          {projectId && <button type="button" className="text-button" onClick={() => onOpenProject(projectId)}>查看项目</button>}
        </div>
        <div className="studio-form-grid">
          <label className="field"><span className="field-label">项目名称</span>
            <input className="input" value={title} maxLength={80} disabled={busy} onChange={e => setTitle(e.target.value)} placeholder="例如：夏季上新主图包" />
          </label>
          <label className="field"><span className="field-label">产品 / 场景简述</span>
            <textarea className="input textarea" rows={3} value={brief} disabled={busy} onChange={e => setBrief(e.target.value)} placeholder="产品、卖点、目标人群与视觉风格" />
          </label>

          <div>
            <span className="field-label">产品参考图（最多 {MAX_PRODUCT_IMAGES} 张，推荐上传）</span>
            <div className="studio-upload-row">
              {previews.map(item => (
                <div key={item.id} className="studio-upload-thumb">
                  <img src={item.url} alt={item.file.name} />
                  <button type="button" className="studio-upload-remove" disabled={busy} aria-label={`移除 ${item.file.name}`} onClick={() => removePreview(item.id)}>
                    <X size={12} />
                  </button>
                </div>
              ))}
              {previews.length < MAX_PRODUCT_IMAGES && (
                <button
                  type="button"
                  className="studio-upload-add"
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                >
                  <ImagePlus size={18} />
                  <span>添加图片</span>
                  <small>JPG / PNG / WebP</small>
                </button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                multiple
                hidden
                onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
              />
            </div>
            <p className="studio-help">有参考图时优先调用 <code>/images/edits</code>；未上传则使用 <code>/images/generations</code>。</p>
          </div>

          <div>
            <span className="field-label">输出类型</span>
            <div className="studio-kind-tabs" role="group" aria-label="输出类型">
              {kinds.map(kind => (
                <button key={kind} type="button" className={`studio-kind-tab ${selected.includes(kind) ? 'active' : ''}`} disabled={busy} onClick={() => toggleKind(kind)}>
                  {creativeKindLabels[kind]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <button type="button" className="btn primary" disabled={busy || !brief.trim() || selected.length === 0} onClick={() => void start()}>
              {busy ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}
              {busy ? '生成中…' : '生成创意图'}
            </button>
          </div>
          {error && <p className="error-text" role="alert">{error}</p>}
          {job && (
            <div className="studio-status-bar" role="status">
              <span className={`studio-badge ${job.status === 'completed' ? 'ok' : job.status === 'failed' ? 'fail' : 'run'}`}>
                {job.status === 'completed' ? '已完成' : job.status === 'failed' ? '失败' : '进行中'}
              </span>
              <span>{job.message}</span>
              <div className="studio-progress" aria-hidden="true"><span style={{ width: `${job.progress}%` }} /></div>
              <strong>{job.progress}%</strong>
            </div>
          )}
        </div>
      </section>

      <section className="studio-panel">
        <div className="studio-panel-heading">
          <h2>输出预览</h2>
          <span className="studio-badge">{assets.filter(a => a.status === 'completed').length}/{assets.length || 0} 张</span>
        </div>
        {assets.length === 0 ? (
          <div className="studio-empty">尚未生成。上传产品图、选择类型并填写简述后开始。</div>
        ) : galleryByKind.length === 0 ? (
          <div className="studio-asset-grid">
            {assets.map(asset => (
              <article key={asset.id} className="studio-asset-card">
                <div className="studio-asset-thumb">
                  {asset.url ? <img src={asset.url} alt={creativeKindLabels[asset.kind]} /> : <ImagePlus size={22} />}
                  {asset.status === 'running' && <div className="studio-asset-overlay"><LoaderCircle size={18} className="spin" /></div>}
                </div>
                <div className="studio-asset-meta">
                  <strong>{creativeKindLabels[asset.kind]}</strong>
                  <small className={asset.status === 'failed' ? 'fail-text' : undefined}>{assetStatusLabel(asset)}</small>
                  {asset.status === 'completed' && asset.url && (
                    <a className="studio-download" href={asset.url} download target="_blank" rel="noreferrer">
                      <Download size={12} />下载
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="studio-gallery-by-type">
            {galleryByKind.map(group => (
              <div key={group.kind} className="studio-gallery-group">
                <div className="studio-gallery-group-title">
                  <strong>{creativeKindLabels[group.kind]}</strong>
                  <span className="studio-badge">{group.items.filter(i => i.status === 'completed').length}/{group.items.length}</span>
                </div>
                <div className="studio-asset-grid">
                  {group.items.map(asset => (
                    <article key={asset.id} className="studio-asset-card">
                      <div className="studio-asset-thumb">
                        {asset.url ? <img src={asset.url} alt={creativeKindLabels[asset.kind]} /> : <ImagePlus size={22} />}
                        {asset.status === 'running' && <div className="studio-asset-overlay"><LoaderCircle size={18} className="spin" /></div>}
                      </div>
                      <div className="studio-asset-meta">
                        <strong>{creativeKindLabels[asset.kind]}</strong>
                        <small className={asset.status === 'failed' ? 'fail-text' : undefined}>{assetStatusLabel(asset)}</small>
                        {asset.status === 'completed' && asset.url && (
                          <a className="studio-download" href={asset.url} download target="_blank" rel="noreferrer">
                            <Download size={12} />下载
                          </a>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
