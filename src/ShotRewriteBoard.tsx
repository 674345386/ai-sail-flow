import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Download, ImagePlus, LoaderCircle, Package, RotateCcw, WandSparkles, Clapperboard } from 'lucide-react';
import { roles, type Product, type Project, type Shot } from '../shared/domain';
import { keyframeCurrent, sourceShotFor, type RewriteShot } from '../shared/storyboard';
import type { ShotMedia } from '../shared/shot-evidence';
import { loadSourceFrames } from './ShotBreakdown';
import './shot-rewrite.css';
import { videoCurrent } from '../shared/workflow';
import { buildVeoPlan } from '../shared/veo-plan';

export function RewriteProductInputs({ project, disabled, onProduct, onUpload }: {
  project: Project; disabled: boolean; onProduct: (patch: Partial<Product>) => void; onUpload: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const images = project.assets.filter(asset => asset.kind === 'product');
  return <section className="panel rewrite-product-inputs"><div className="panel-heading"><div><Package size={18} /><h2>你的产品与外观</h2></div></div><div className="panel-body">
    <label className="field"><span className="field-label">产品名称 · 必填</span><input className="input" disabled={disabled} value={project.product.name} maxLength={160} placeholder="本次镜头里要展示的产品" onChange={event => onProduct({ name: event.target.value })} /></label>
    <label className="field"><span className="field-label">已确认的卖点与规格 · 必填</span><textarea className="input textarea" rows={4} disabled={disabled} value={project.product.facts} maxLength={8000} placeholder="材质、颜色、形状、规格和实际用途" onChange={event => onProduct({ facts: event.target.value })} /></label>
    <div className="rewrite-product-images">{images.map(asset => <img src={asset.url} alt={asset.name} key={asset.id} />)}</div>
    <input ref={input} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" multiple onChange={event => { const files = Array.from(event.currentTarget.files || []); event.currentTarget.value = ''; if (files.length) onUpload(files); }} />
    <button className="btn small" disabled={disabled || images.length >= 3} onClick={() => input.current?.click()}><ImagePlus size={14} />{images.length ? '补充产品参考图' : '上传产品参考图 · 必填'}</button>
    <p className="muted">产品图决定商品外观，原片关键帧决定场景与构图。最多 3 张。</p>
  </div></section>;
}

function SourceFrames({ project, source }: { project: Project; source: Shot }) {
  const element = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; media?: ShotMedia; error?: string }>();
  const key = JSON.stringify([project.id, project.assets.find(asset => asset.kind === 'video')?.id, source.start, source.end, source.evidenceFrames]);
  const media = result?.key === key ? result.media : undefined;
  const error = result?.key === key ? result.error : undefined;
  useEffect(() => {
    if (!element.current) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '150px' });
    observer.observe(element.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !project.assets.some(asset => asset.kind === 'video')) return;
    let active = true;
    void loadSourceFrames(project, source).then(media => { if (active) setResult({ key, media }); }, error => { if (active) setResult({ key, error: error instanceof Error ? error.message : '关键帧读取失败' }); });
    return () => { active = false; };
  }, [visible, key, attempt]);
  return <div ref={element} className="rewrite-source-frames">{media ? media.frames.map(frame => <a href={frame.url} target="_blank" rel="noreferrer" key={frame.url} title={frame.reason}><img src={frame.url} loading="lazy" alt={`原片 ${frame.at.toFixed(3)} 秒：${frame.reason}`} /><span>{frame.at.toFixed(3)}s</span></a>) : <div className="rewrite-frame-placeholder">{error ? <><span>{error}</span><button className="text-button" onClick={() => setAttempt(attempt + 1)}><RotateCcw size={13} />重新读取</button></> : project.assets.some(asset => asset.kind === 'video') ? <><LoaderCircle size={16} className="spin" />读取原片关键帧…</> : '示例未关联原片'}</div>}</div>;
}

function RewriteRow({ project, source, rewritten, index, selected, disabled, onSelect, onGenerate, onGenerateVideo, renderEditor }: {
  project: Project; source: Shot; rewritten?: RewriteShot; index: number; selected: boolean; disabled: boolean;
  onSelect?: (index: number) => void; onGenerate?: (shotId: string) => void; onGenerateVideo?: (shotId: string) => void; renderEditor?: (shot: Shot, index: number, localized?: boolean) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const current = rewritten && keyframeCurrent(project, rewritten);
  const frame = rewritten?.keyframe;
  const canGenerate = rewritten && !project.rewriteStale && project.promptFlow !== 'direct-analysis';
  const rewrittenIndex = rewritten ? project.rewrite!.shots.findIndex(shot => shot.id === rewritten.id) : index;
  const unit = rewritten && buildVeoPlan([rewritten])[0];
  const clip = [...project.generatedVideos].reverse().find(video => video.unitId === unit?.id && (video.productionMode || 'veo-native') === (project.productionMode || 'veo-native'));
  const clipReady = clip && videoCurrent(project, clip);
  return <article className={`rewrite-shot-row ${selected ? 'selected' : ''}`}>
    <header><div><b>{String(index + 1).padStart(2, '0')}</b><strong>原片镜头 {index + 1}<ArrowRight size={14} />复刻镜头 {index + 1}</strong></div><span>{roles[source.role]} · 原片 {source.start.toFixed(2)}–{source.end.toFixed(2)}s</span></header>
    <div className="rewrite-shot-pair">
      <section className="rewrite-source"><div className="rewrite-column-label">参考镜头<span>视频拆解产物</span></div><SourceFrames project={project} source={source} /><p>{source.visual}</p><dl><div><dt>主体动作</dt><dd>{source.action || '未记录'}</dd></div><div><dt>构图与运镜</dt><dd>{source.camera || '未记录'}</dd></div>{source.effects && <div><dt>动效</dt><dd>{source.effects}</dd></div>}{!!source.focusPoints?.filter(point => point.selected).length && <div><dt>关注重点</dt><dd>{source.focusPoints.filter(point => point.selected).map(point => point.text).join('；')}</dd></div>}</dl><details><summary>完整原片分析</summary><p>主体：{source.subject || '未单独记录'}</p><p>转场：{source.transition || '未单独记录'}</p><p>声音：{[source.sound, source.narration].filter(Boolean).join(' · ') || '未记录'}</p>{source.uncertainty && <p>待核对：{source.uncertainty}</p>}</details></section>
      <section className="rewrite-target"><div className="rewrite-column-label">你的复刻镜头<span>{project.promptFlow === 'direct-analysis' ? '仅整理原片' : current ? '关键帧已生成' : frame?.status === 'running' ? '生成中' : frame?.status === 'failed' ? '生成失败' : frame?.url ? '图片待更新' : '待生成'}</span></div>
        {frame?.url ? <a className="rewrite-target-frame" href={frame.url} target="_blank" rel="noreferrer"><img src={frame.url} loading="lazy" alt={`复刻镜头 ${index + 1}：${rewritten?.visual}`} style={{ aspectRatio: project.market.aspectRatio.replace(':', '/') }} /></a> : <div className="rewrite-frame-placeholder target">{frame?.status === 'running' ? <><LoaderCircle size={24} className="spin" />正在生成复刻关键帧</> : <><WandSparkles size={24} />{project.promptFlow === 'direct-analysis' ? '选择逐镜头产品改写后生成关键帧' : '结合原片关键帧与产品图生成'}</>}</div>}
        {rewritten ? <><p>{rewritten.visual}</p><dl><div><dt>主体与产品</dt><dd>{rewritten.subject || rewritten.productPresence || '待确认'}</dd></div><div><dt>复刻动作</dt><dd>{rewritten.action || '未记录'}</dd></div><div><dt>构图与运镜</dt><dd>{rewritten.camera || '未记录'}</dd></div></dl>{rewritten.uncertainty && <p className="rewrite-shot-notice">{rewritten.uncertainty}</p>}{frame?.url && !current && <p className="rewrite-shot-notice">描述或产品资料已修改，请更新关键帧后使用。</p>}{frame?.status === 'failed' && <p className="error-text" role="alert">{frame.error}</p>}
          <div className="rewrite-shot-actions">{onGenerate && project.promptFlow !== 'direct-analysis' && <button className="btn small" disabled={disabled || !canGenerate} onClick={() => onGenerate(rewritten.id)}><WandSparkles size={14} />{frame?.status === 'failed' ? '重试此镜头' : frame?.url ? '重新生成关键帧' : '生成此镜头关键帧'}</button>}{frame?.url && <a className="btn small" href={frame.url} download><Download size={14} />下载</a>}{onGenerateVideo && project.promptFlow !== 'direct-analysis' && <button className="btn small primary" disabled={disabled || !current || !['9:16', '16:9'].includes(project.market.aspectRatio)} onClick={() => onGenerateVideo(rewritten.id)}><Clapperboard size={14} />{clipReady && clip.status === 'completed' ? '重新生成镜头视频' : '用此图生成镜头视频'}</button>}{renderEditor && <button className="text-button" disabled={disabled} aria-expanded={editing && selected} onClick={() => { onSelect?.(index); setEditing(!editing || !selected); }}>编辑复刻描述</button>}</div>
          {clip?.status === 'completed' && clip.url && <div className="rewrite-shot-video"><span>{clipReady ? '对应镜头视频片段' : '旧版镜头片段 · 待更新'}</span><video src={clip.url} poster={frame?.url} controls playsInline preload="none" aria-label={`复刻镜头 ${index + 1} 的视频片段`} /></div>}{clipReady && clip.status === 'running' && <p className="muted"><LoaderCircle size={13} className="spin" /> 对应镜头视频正在生成…</p>}
          <details><summary>视频生成描述与关键帧指令</summary><p>视频生成描述包含这个镜头的动作过程与运镜。</p><pre>{rewritten.generationPrompt}</pre>{rewritten.keyframePrompt && <><p>关键帧指令描述此镜头的起始画面，视频会从这张图继续动作。</p><pre>{rewritten.keyframePrompt}</pre></>}</details>
        </> : <p className="muted">生成后，这里会显示替换为你的产品后的关键帧、画面描述与视频生成指令。</p>}
      </section>
    </div>
    {editing && selected && rewritten && renderEditor && <div className="rewrite-row-editor">{renderEditor(rewritten, rewrittenIndex, true)}</div>}
  </article>;
}

export default function ShotRewriteBoard({ project, disabled = false, selectedIndex = 0, onSelect, onGenerate, onGenerateVideo, renderEditor }: {
  project: Project; disabled?: boolean; selectedIndex?: number; onSelect?: (index: number) => void;
  onGenerate?: (shotId: string) => void; onGenerateVideo?: (shotId: string) => void; renderEditor?: (shot: Shot, index: number, localized?: boolean) => ReactNode;
}) {
  const sources = project.analysis?.shots || [];
  const completed = project.rewrite?.shots.filter(shot => keyframeCurrent(project, shot)).length || 0;
  const unmatched = project.rewrite && (project.rewrite.shots.length !== sources.length || project.rewrite.shots.some(shot => !sourceShotFor(project, shot) || project.promptFlow !== 'direct-analysis' && !shot.sourceShotId));
  return <section className="shot-rewrite-board"><div className="rewrite-board-heading"><div><h2>逐镜头产品与创意改写</h2><p>沿用视频拆解的镜头顺序、关键帧和分析，结合你的产品逐一复刻。</p></div><span className="badge">{sources.length} 个参考镜头 · {completed} 张复刻关键帧</span></div>
    {unmatched && <p className="rewrite-shot-notice">旧方案的镜头与当前拆解结果不完全对应，请重新生成逐镜头方案。</p>}
    {sources.map((source, index) => <RewriteRow key={source.id} project={project} source={source} rewritten={project.rewrite?.shots.find(shot => (shot.sourceShotId || shot.id) === source.id)} index={index} selected={selectedIndex === index} disabled={disabled} onSelect={onSelect} onGenerate={onGenerate} onGenerateVideo={onGenerateVideo} renderEditor={renderEditor} />)}
    {!sources.length && <p className="muted">先完成视频拆解，这里会自动带入每个镜头的关键帧和分析。</p>}
  </section>;
}
