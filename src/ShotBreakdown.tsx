import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Copy, Download, Film, Image, LoaderCircle, Play, RotateCcw, Scissors, X } from 'lucide-react';
import { roles, type Project, type Shot } from '../shared/domain';
import { shotReconstructionPrompt, type ShotMedia } from '../shared/shot-evidence';
import { api } from './api';
import './shot-breakdown.css';

const mediaCache = new Map<string, ShotMedia>();
const mediaRequests = new Map<string, Promise<ShotMedia>>();
let mediaActive = 0;
const mediaQueue: (() => void)[] = [];
async function loadMedia(key: string, projectId: string, body: string) {
  const cached = mediaCache.get(key); if (cached) return cached;
  const existing = mediaRequests.get(key); if (existing) return existing;
  const pending = (async () => {
    if (mediaActive >= 2) await new Promise<void>(resolve => mediaQueue.push(resolve)); else mediaActive++;
    try {
      const result = await api<ShotMedia>(`/api/projects/${projectId}/shot-media`, { method: 'POST', body });
      if (mediaCache.size >= 200) mediaCache.delete(mediaCache.keys().next().value!);
      mediaCache.set(key, result); return result;
    } finally { const next = mediaQueue.shift(); if (next) next(); else mediaActive--; }
  })();
  mediaRequests.set(key, pending);
  try { return await pending; } finally { mediaRequests.delete(key); }
}

function FramePreview({ frame, onClose }: { frame: ShotMedia['frames'][number]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} className="shot-frame-dialog" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-label="原片证据关键帧">
    <header><span>原片 {frame.at.toFixed(3)} 秒 · {frame.reason}</span><button className="icon-btn" aria-label="关闭关键帧" onClick={onClose}><X size={18} /></button></header>
    <img src={frame.url} alt={`原片 ${frame.at.toFixed(3)} 秒的截帧：${frame.reason}`} />
    <footer><span>图片从上传的原片截取，描述仍需对照核验。</span><a className="btn small" href={frame.url} download><Download size={14} />下载关键帧</a></footer>
  </dialog>;
}

function ShotRow({ project, shot, index, selected, expanded, disabled, onSelect, onExpand, onSeek, onCopy, onSplit, renderEditor }: {
  project: Project; shot: Shot; index: number; selected: boolean; expanded: boolean; disabled: boolean;
  onSelect: () => void; onExpand: () => void; onSeek?: (seconds: number) => void; onCopy: (text: string) => void;
  onSplit?: () => void; renderEditor?: (shot: Shot, index: number) => ReactNode;
}) {
  const row = useRef<HTMLElement>(null);
  const reference = project.assets.find(asset => asset.kind === 'video');
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; media?: ShotMedia; error?: string }>();
  const [frame, setFrame] = useState<ShotMedia['frames'][number]>();
  const body = JSON.stringify({ assetId: reference?.id, start: shot.start, end: shot.end, evidenceFrames: shot.evidenceFrames });
  const requestKey = `${project.id}:${body}`;
  const media = result?.key === requestKey ? result.media : mediaCache.get(requestKey);
  const error = result?.key === requestKey ? result.error : undefined;
  useEffect(() => {
    if (!row.current) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '200px' });
    observer.observe(row.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !reference || mediaCache.has(requestKey)) return;
    if (shot.end <= shot.start || shot.start < 0 || shot.end > (reference.duration || 0) + .001) { setResult({ key: requestKey, error: '请先修正镜头时间范围。' }); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      setResult({ key: requestKey });
      void loadMedia(requestKey, project.id, body).then(media => { if (active) setResult({ key: requestKey, media }); }, error => { if (active) setResult({ key: requestKey, error: error instanceof Error ? error.message : '镜头媒体提取失败。' }); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [requestKey, visible, attempt]);
  const prompt = shotReconstructionPrompt(shot);
  return <article ref={row} className={`shot-breakdown-row ${selected ? 'selected' : ''}`}>
    <header className="shot-row-heading"><button onClick={onSelect} className="shot-row-title"><b>{String(index + 1).padStart(2, '0')}</b><span><strong>镜头片段 {String(index + 1).padStart(2, '0')}</strong><small>{shot.start.toFixed(3)}–{shot.end.toFixed(3)} 秒 · {(shot.end - shot.start).toFixed(3)} 秒</small></span></button><span className="badge">{roles[shot.role]}</span>{onSeek && <button className="text-button" onClick={() => { onSelect(); onSeek(shot.start); }}><Play size={13} />定位原片</button>}{renderEditor && <button className="btn small" aria-expanded={expanded} onClick={onExpand}>{expanded ? '收起编辑' : '编辑镜头'}<ChevronDown size={13} /></button>}</header>
    <div className="shot-row-content">
      <div className="shot-row-media"><div className="shot-media-label"><Film size={13} /><span>{media ? `原片切片${reference?.hasAudio ? ' · 保留原声' : reference?.hasAudio === false ? ' · 无音轨' : ''}` : '原片片段'}</span>{media && <a href={media.clipUrl} download aria-label={`下载镜头 ${index + 1}`}><Download size={14} /></a>}</div>
        {media ? <video key={media.key} src={media.clipUrl} poster={media.frames[0]?.url} controls playsInline preload="none" aria-label={`原片镜头片段 ${index + 1}`} onPlay={event => { onSelect(); document.querySelectorAll<HTMLVideoElement>('.shot-row-media video').forEach(video => { if (video !== event.currentTarget) video.pause(); }); }} /> : <div className="shot-media-placeholder">{reference?.thumbnail ? <img src={reference.thumbnail} alt="原片封面，镜头片段正在准备" /> : <Film size={27} />}<span>{!reference ? '示例未关联原片' : error ? '片段暂不可用' : <><LoaderCircle size={14} className="spin" />准备镜头片段…</>}</span></div>}
        {error && <p className="shot-media-error" role="alert">{error}<button className="text-button" onClick={() => setAttempt(attempt + 1)}><RotateCcw size={12} />重新提取</button></p>}
      </div>
      <div className="shot-row-evidence"><div className="shot-media-label"><Image size={13} /><span>证据关键帧</span><small>原片真实截帧</small></div>{media ? <div className="shot-frame-strip" style={{ gridTemplateColumns: `repeat(${media.frames.length}, minmax(0, 1fr))` }}>{media.frames.map((item, index) => <button key={item.url} onClick={() => setFrame(item)} title={item.reason}><img src={item.url} alt={`${item.at.toFixed(3)} 秒：${item.reason}`} loading="lazy" /><span>{item.at.toFixed(3)}s</span><small>{item.reason}</small></button>)}</div> : <div className="shot-evidence-placeholder">{reference ? '按镜头时间点从原片提取' : '上传原片后可查看关键帧'}</div>}<p className="shot-evidence-note">{media?.frames.some(frame => frame.selection === 'model') ? 'Gemini 建议的核对时间点 · 点击放大' : '按镜头区间选帧 · 点击放大'}</p></div>
      <dl className="shot-row-observations"><div className="shot-observation-wide"><dt>画面与场景</dt><dd>{shot.visual || '未记录'}</dd></div>{[
        ['主体与外观', shot.subject || '未单独记录；参见画面描述'], ['主体动作', shot.action], ['运镜 / 镜头语言', shot.camera],
        ['动效 / 合成', shot.effects || '未单独记录'], ['转场 / 分段依据', shot.transition || '未单独记录'], ['声音 / 口播', [shot.sound, shot.narration].filter(Boolean).join(' · ') || '未记录'],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '未记录'}</dd></div>)}{shot.uncertainty && <div className="shot-observation-wide shot-uncertainty"><dt>待核对</dt><dd>{shot.uncertainty}</dd></div>}</dl>
    </div>
    <details className="shot-row-prompt"><summary><span>镜头重建 Prompt<small>{shot.reconstructionPrompt ? 'Gemini 分析 / 当前编辑' : '由现有镜头描述整理'}</small></span><ChevronDown size={13} /></summary><div><p>用于描述如何重建这个镜头，可在编辑中调整。</p><pre>{prompt}</pre><button className="btn small" onClick={() => onCopy(prompt)}><Copy size={13} />复制 Prompt</button></div></details>
    {expanded && renderEditor && <div className="shot-row-editor">{renderEditor(shot, index)}{onSplit && <div className="scene-actions"><button className="text-button" disabled={disabled || shot.end - shot.start < .4 || (project.analysis?.shots.length || 0) >= 120} onClick={onSplit}><Scissors size={14} />拆分此镜头</button><span>修改自动保存；调整边界后重新提取片段</span></div>}</div>}
    {frame && <FramePreview frame={frame} onClose={() => setFrame(undefined)} />}
  </article>;
}

export default function ShotBreakdown({ project, selectedIndex = -1, onSelect, onSeek, onCopy, onSplit, renderEditor, disabled = false, compact = false }: {
  project: Project; selectedIndex?: number; onSelect?: (index: number) => void; onSeek?: (seconds: number) => void;
  onCopy: (text: string) => void; onSplit?: (index: number) => void; renderEditor?: (shot: Shot, index: number) => ReactNode; disabled?: boolean; compact?: boolean;
}) {
  const [expanded, setExpanded] = useState<string>();
  return <div className={`shot-breakdown ${compact ? 'compact' : ''}`}><p className="shot-breakdown-intro">一行一个镜头：原片片段 → 证据关键帧 → 观察记录 → 重建 Prompt。文字为分析与编辑结果，请对照原片核验。</p>{project.analysis?.shots.map((shot, index) => <ShotRow key={shot.id} project={project} shot={shot} index={index} selected={selectedIndex === index} expanded={expanded === shot.id} disabled={disabled} onSelect={() => onSelect?.(index)} onExpand={() => { onSelect?.(index); setExpanded(expanded === shot.id ? undefined : shot.id); }} onSeek={onSeek} onCopy={onCopy} onSplit={onSplit ? () => onSplit(index) : undefined} renderEditor={renderEditor} />)}</div>;
}
