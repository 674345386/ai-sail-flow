import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Download, FileText, X } from 'lucide-react';
import type { Project } from '../shared/domain';
import { buildBrief, buildPrompt, buildVeoPromptPreview, subtitles } from '../shared/export';
import ShotBreakdown from './ShotBreakdown';
import ShotRewriteBoard from './ShotRewriteBoard';

export type ArtifactSelection = { key: string; seek?: number };
export default function CreativeArtifactDialog({ project, selection, onClose, onSelect, onCopy, onExport }: {
  project: Project; selection: ArtifactSelection; onClose: () => void; onSelect: (selection: ArtifactSelection) => void;
  onCopy: (text: string) => void; onExport: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState('overview');
  const [mediaError, setMediaError] = useState(false);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  useEffect(() => { setTab('overview'); setMediaError(false); }, [selection.key]);
  const asset = selection.key.startsWith('asset:') ? project.assets.find(item => item.id === selection.key.slice(6)) : undefined;
  const generated = selection.key.startsWith('generated:') ? project.generatedVideos.find(item => item.id === selection.key.slice(10)) : undefined;
  const final = selection.key.startsWith('final:') ? project.composedVideos?.find(item => item.id === selection.key.slice(6)) : undefined;
  const remixVideo = selection.key.startsWith('remix-video:') ? project.remix?.videos.find(item => item.id === selection.key.slice(12)) : undefined;
  const remixCharacter = selection.key === 'remix-character' ? project.remix?.character : undefined;
  const remixPlan = selection.key === 'remix-plan' ? project.remix?.plan : undefined;
  const video = asset?.kind === 'video' ? asset : generated || final || remixVideo;
  const image = asset?.kind === 'product' ? asset : remixCharacter;
  const analysis = selection.key === 'analysis' ? project.analysis : null;
  const rewrite = selection.key === 'rewrite' ? project.rewrite : null;
  const delivery = selection.key === 'delivery' && !!project.rewrite;
  const collection = selection.key === 'generations';
  const generations = [...project.generatedVideos].reverse().filter(video => video.url && video.status === 'completed' && (video.productionMode || 'veo-native') === (project.productionMode || 'veo-native'));
  const title = remixVideo ? 'Omni 二创成片' : remixCharacter ? '新人物参考图' : remixPlan ? '二创视频提示词' : collection ? '生成视频片段' : asset?.name || (generated ? '生成视频片段' : final ? '最终成片' : analysis ? '镜头片段与证据' : rewrite ? '创意分镜' : delivery ? '提示词与制作简报' : '产物已变更');
  const stale = generated?.stale || final?.stale || (!!rewrite || delivery) && project.rewriteStale;
  const currentIndex = asset ? project.assets.findIndex(item => item.id === asset.id) : -1;
  const prev = currentIndex > 0 ? project.assets[currentIndex - 1] : undefined;
  const next = currentIndex >= 0 ? project.assets[currentIndex + 1] : undefined;
  let content = remixPlan?.prompt || '';
  if (delivery) content = tab === 'brief' ? buildBrief(project) : tab === 'json' ? buildVeoPromptPreview(project) : tab === 'srt' ? subtitles(project.rewrite!.shots, project.productionMode) : buildPrompt(project);
  else if (analysis || rewrite) content = JSON.stringify(analysis || rewrite, null, 2);
  return <dialog ref={dialog} className={`creative-artifact-dialog ${video || image ? 'is-media' : ''}`} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="creative-artifact-title">
    <div className="creative-artifact-shell">
      <header className="creative-artifact-heading"><div><span className="creative-eyebrow">{project.isDemo ? '示例项目产物' : video || image ? 'MEDIA PREVIEW' : 'ARTIFACT PREVIEW'}</span><h2 id="creative-artifact-title">{title}</h2></div><button className="creative-icon-button" aria-label="关闭预览" onClick={onClose}><X size={19} /></button></header>
      {stale && <div className="creative-callout warning">上游资料已变更。这份结果保留供查看，重新制作后才能作为最新交付使用。</div>}
      {(video || image) ? <>
        <div className="creative-media-stage">{video ? <video key={video.id} src={video.url} poster={'thumbnail' in video ? video.thumbnail : undefined} controls playsInline preload="metadata" onLoadedMetadata={event => { if (selection.seek !== undefined) event.currentTarget.currentTime = Math.min(selection.seek, Math.max(0, event.currentTarget.duration - 0.05)); }} onError={() => setMediaError(true)} aria-label={title} /> : <img src={image!.url} alt={title} onError={() => setMediaError(true)} />}{mediaError && <p role="alert">无法读取此媒体文件，请检查本地源文件是否仍存在。</p>}</div>
        <footer className="creative-artifact-footer"><div className="creative-media-meta">{video && <span>{video.duration?.toFixed(1)} 秒</span>}{asset && <span>{(asset.size / 1024 / 1024).toFixed(1)} MB · {asset.mime}</span>}{asset?.width && <span>{asset.width} × {asset.height}</span>}</div><div className="creative-media-actions">{generated && <button className="btn small" onClick={() => onSelect({ key: 'generations' })}><ChevronLeft size={15} />返回片段列表</button>}{asset && <><button className="creative-icon-button" aria-label="上一份素材" disabled={!prev} onClick={() => prev && onSelect({ key: `asset:${prev.id}` })}><ChevronLeft size={17} /></button><span>{currentIndex + 1} / {project.assets.length}</span><button className="creative-icon-button" aria-label="下一份素材" disabled={!next} onClick={() => next && onSelect({ key: `asset:${next.id}` })}><ChevronRight size={17} /></button></>}<a className="btn small" href={(video || image)?.url} download={asset?.name || (video && 'filename' in video ? video.filename : undefined)}><Download size={15} />下载</a></div></footer>
      </> : <>
        {!collection && <div className="creative-preview-tabs" role="group" aria-label="产物内容">{(delivery ? [['overview', '生成提示词'], ['brief', '制作简报'], ['json', '分镜 JSON'], ...(project.market.subtitles || project.productionMode === 'tts-subtitles' ? [['srt', '字幕']] : [])] : [['overview', '内容概览'], ['json', '完整 JSON']]).map(([id, label]) => <button aria-pressed={tab === id} aria-controls="creative-preview-panel" key={id} onClick={() => setTab(id)}>{label}</button>)}</div>}
        <div className="creative-document-body" id="creative-preview-panel" aria-label={collection ? '当前成片模式的生成片段' : '产物内容'}>
          {collection ? <div className="creative-video-collection">{generations.map(video => <button key={video.id} onClick={() => onSelect({ key: `generated:${video.id}` })}>{video.thumbnail ? <img src={video.thumbnail} alt="" /> : <FileText size={24} />}<span><strong>{video.unitId || video.shotId} · {video.duration} 秒</strong><small>{video.stale ? '待更新 · ' : ''}{new Date(video.startedAt).toLocaleString()}</small></span></button>)}{!generations.length && <p className="creative-hint">当前成片模式暂无已完成片段。</p>}</div> : tab === 'overview' && analysis ? <ShotBreakdown project={project} onCopy={onCopy} onSeek={seconds => { const asset = project.assets.find(item => item.kind === 'video'); if (asset) onSelect({ key: `asset:${asset.id}`, seek: seconds }); }} /> : tab === 'overview' && rewrite ? <ShotRewriteBoard project={project} /> : tab === 'overview' && (analysis || rewrite) ? <><div className="creative-document-summary"><FileText size={21} /><div><h3>{analysis ? '参考片的表达结构' : rewrite?.angle}</h3><p>{analysis?.summary || rewrite?.audienceInsight}</p><span>{(analysis || rewrite)?.shots.length} 个镜头{analysis && ` · 原片语言：${analysis.sourceLanguage}`}</span></div></div>{(analysis || rewrite)?.shots.map((shot, index) => <article className="creative-preview-shot" key={shot.id}><div><b>{String(index + 1).padStart(2, '0')}</b><span>{shot.start.toFixed(1)}–{shot.end.toFixed(1)} 秒</span></div><p>{shot.visual}</p>{shot.narration && <blockquote>{shot.narration}</blockquote>}</article>)}</> : <pre tabIndex={0}>{content || '这份产物暂不可用。请关闭预览，查看最新流程状态。'}</pre>}
        </div>
        <footer className="creative-artifact-footer"><span>与项目当前数据同步</span>{!collection && <div className="creative-media-actions"><button className="btn small" disabled={!content} onClick={() => onCopy(content)}><Copy size={14} />复制{tab === 'overview' && !delivery ? ' JSON' : '内容'}</button>{delivery && <button className="btn primary small" disabled={project.rewriteStale} onClick={onExport}><Download size={14} />导出完整 ZIP</button>}</div>}</footer>
      </>}
    </div>
  </dialog>;
}
