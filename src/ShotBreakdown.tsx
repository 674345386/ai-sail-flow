import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Copy, Download, Film, Image, LoaderCircle, Play, RotateCcw, Scissors, Sparkles, X } from 'lucide-react';
import { roles, type FocusPoint, type Project, type Shot, type ShotSuggestion } from '../shared/domain';
import FocusPointsEditor from './FocusPointsEditor';
import { shotMotionPrompt, shotReconstructionPrompt, type ShotMedia } from '../shared/shot-evidence';
import { api } from './api';
import './shot-breakdown.css';

const mediaCache = new Map<string, ShotMedia>();
const frameLabels = { first: '首帧', middle: '中间关键帧', last: '尾帧' };
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

export function loadSourceFrames(project: Project, shot: Shot) {
  const reference = project.assets.find(asset => asset.kind === 'video');
  const body = JSON.stringify({ assetId: reference?.id, start: shot.start, end: shot.end, evidenceFrames: shot.evidenceFrames, framesOnly: true, inlineFrames: true });
  return loadMedia(`${project.id}:${body}`, project.id, body);
}

export function loadSourceClip(project: Project, shot: Shot) {
  const reference = project.assets.find(asset => asset.kind === 'video');
  const body = JSON.stringify({ assetId: reference?.id, start: shot.start, end: shot.end, evidenceFrames: shot.evidenceFrames, framesOnly: false });
  return loadMedia(`${project.id}:${body}`, project.id, body);
}

function FramePreview({ frame, onClose }: { frame: ShotMedia['frames'][number]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} className="shot-frame-dialog" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-label="原片证据关键帧">
    <header><span>原片 {frame.at.toFixed(3)} 秒 · {frame.reason}</span><button className="icon-btn" aria-label="关闭关键帧" onClick={onClose}><X size={18} /></button></header>
    <img src={frame.previewUrl || frame.url} alt={`原片 ${frame.at.toFixed(3)} 秒的截帧：${frame.reason}`} />
    <footer><span>图片从上传的原片截取，描述仍需对照核验。</span><a className="btn small" href={frame.url} download><Download size={14} />下载关键帧</a></footer>
  </dialog>;
}

function SourceClip({ project, shot, media, index, onSelect }: { project: Project; shot: Shot; media: ShotMedia; index: number; onSelect: () => void }) {
  const reference = project.assets.find(asset => asset.kind === 'video');
  const body = JSON.stringify({ assetId: reference?.id, start: shot.start, end: shot.end, evidenceFrames: shot.evidenceFrames, framesOnly: false });
  const key = `${project.id}:${body}`;
  const [result, setResult] = useState<{ key: string; media?: ShotMedia; intent?: 'play' | 'download'; error?: string }>();
  const clip = result?.key === key ? result.media : mediaCache.get(key);
  const preparing = result?.key === key && !result.media && !result.error;
  const error = result?.key === key ? result.error : undefined;
  const prepare = async (intent: 'play' | 'download') => {
    if (preparing) return;
    if (intent === 'play') onSelect();
    setResult({ key, intent });
    try {
      const loaded = await loadMedia(key, project.id, body);
      setResult({ key, media: loaded, intent });
      if (intent === 'download') {
        const anchor = document.createElement('a'); anchor.href = loaded.clipUrl; anchor.download = `shot-${index + 1}.mp4`;
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
      }
    } catch (error) { setResult({ key, error: error instanceof Error ? error.message : '镜头片段提取失败。' }); }
  };
  const poster = media.frames[0]?.previewUrl || media.frames[0]?.url;
  return <>
    <div className="shot-media-label shot-media-label-bare">
      <button className="text-button" disabled={preparing} onClick={() => void prepare('download')} aria-label={`下载镜头 ${index + 1}`}><Download size={14} /></button>
    </div>
    {clip ? <video key={clip.key} src={clip.clipUrl} poster={poster} controls playsInline preload="none" autoPlay={result?.key === key && result.intent === 'play'} aria-label={`原片镜头片段 ${index + 1}`} onPlay={event => { onSelect(); document.querySelectorAll<HTMLVideoElement>('.shot-row-media video').forEach(video => { if (video !== event.currentTarget) video.pause(); }); }} />
      : <button className="shot-clip-preview" disabled={preparing} onClick={() => void prepare('play')} aria-label={`播放原片镜头片段 ${index + 1}`}>
        <img src={poster} alt="" /><span>{preparing ? <><LoaderCircle size={16} className="spin" />准备片段…</> : <><Play size={16} />播放片段</>}</span>
      </button>}
    {error && <p className="shot-media-error" role="alert">{error}<button className="text-button" onClick={() => void prepare('play')}><RotateCcw size={12} />重新提取</button></p>}
  </>;
}

function suggestionFields(shot: Shot, suggestion: ShotSuggestion) {
  return ([
    ['镜头作用', roles[suggestion.role], roles[shot.role]], ['画面与场景', suggestion.visual, shot.visual], ['主体与外观', suggestion.subject, shot.subject],
    ['主体动作', suggestion.action, shot.action], ['运镜 / 镜头语言', suggestion.camera, shot.camera], ['动效 / 合成', suggestion.effects, shot.effects],
    ['转场 / 分段依据', suggestion.transition, shot.transition], ['声音', suggestion.sound, shot.sound], ['口播', suggestion.narration, shot.narration],
    ['画面文字', suggestion.onScreenText, shot.onScreenText], ['产品呈现', suggestion.productPresence, shot.productPresence], ['待确认内容', suggestion.uncertainty, shot.uncertainty],
    ['镜头重建 Prompt', suggestion.reconstructionPrompt, shot.reconstructionPrompt],
    ['动态时间线', shotMotionPrompt(suggestion), shotMotionPrompt(shot)],
    ['关注重点建议', (suggestion.focusPoints || []).map(point => `${point.selected ? '☑' : '□'} ${point.text}`).join('；'), (shot.focusPoints || []).map(point => `${point.selected ? '☑' : '□'} ${point.text}`).join('；')],
  ] as [string, string | undefined, string | undefined][]).filter(([, proposed, current]) => (proposed || '') !== (current || ''));
}

function ShotReviewDialog({ items, disabled, onClose, onAccept, onDismiss }: {
  items: { shot: Shot; number: number; suggestion: ShotSuggestion }[]; disabled: boolean; onClose: () => void;
  onAccept: (shotId: string) => void; onDismiss: (shotId: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} className="shot-review-dialog" aria-labelledby="shot-review-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header><div><h2 id="shot-review-title">各镜头 AI 分析建议</h2><p>{items.length} 个镜头有待处理建议。请对照原片核验后逐条采纳，或保留当前记录。</p></div><button className="icon-btn" aria-label="关闭 AI 分析建议" onClick={onClose}><X size={18} /></button></header>
    <div className="shot-review-list">{items.map(({ shot, number, suggestion }) => <article className="shot-review-card" key={shot.id}>
      <h3>镜头片段 {String(number).padStart(2, '0')} <small>{shot.start.toFixed(3)}–{shot.end.toFixed(3)}s · {suggestion.source === 'frames' ? '基于抽帧分析' : '基于原片片段分析'}</small></h3>
      <div className="shot-review-suggestion-body">{suggestion.source === 'frames' && <p>本次只分析了抽帧，未分析音频和帧间动作。采用前请对照原片。</p>}
        {suggestionFields(shot, suggestion).map(([label, proposed, current]) => <div className="shot-review-field" key={label}><strong>{label}</strong><span><b>当前</b>{current || '未记录'}</span><span><b>建议</b>{proposed || '未记录'}</span></div>)}
        <div className="shot-review-actions"><button className="btn small" disabled={disabled} onClick={() => onDismiss(shot.id)}>保留当前记录</button><button className="btn small primary" disabled={disabled} onClick={() => onAccept(shot.id)}>采用此镜头建议</button></div>
      </div>
    </article>)}</div>
    <footer><button className="btn" onClick={onClose}>稍后处理</button></footer>
  </dialog>;
}

function ShotRow({ project, shot, index, number, selected, expanded, disabled, onSelect, onExpand, onSeek, onCopy, onSplit, onExclude, onFocusChange, renderEditor }: {
  project: Project; shot: Shot; index: number; number: number; selected: boolean; expanded: boolean; disabled: boolean;
  onSelect: () => void; onExpand: () => void; onSeek?: (seconds: number) => void; onCopy: (text: string) => void;
  onSplit?: () => void; onExclude?: () => void; onFocusChange?: (points: FocusPoint[]) => void; renderEditor?: (shot: Shot, index: number) => ReactNode;
}) {
  const row = useRef<HTMLElement>(null);
  const reference = project.assets.find(asset => asset.kind === 'video');
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; media?: ShotMedia; error?: string }>();
  const [frame, setFrame] = useState<ShotMedia['frames'][number]>();
  const body = JSON.stringify({ assetId: reference?.id, start: shot.start, end: shot.end, evidenceFrames: shot.evidenceFrames, framesOnly: true, inlineFrames: true });
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
  const pendingReview = project.analysisReview?.pendingIds.includes(shot.id);
  return <article ref={row} className={`shot-breakdown-row ${selected ? 'selected' : ''}`}>
    <header className="shot-row-heading"><label className="shot-include" title={onExclude ? '取消勾选，不使用此镜头' : '至少保留一个镜头'}><input type="checkbox" checked disabled={disabled || !onExclude} onChange={() => onExclude?.()} aria-label={`使用镜头片段 ${number}`} /></label><button onClick={onSelect} className="shot-row-title" title={`${shot.start.toFixed(3)}–${shot.end.toFixed(3)} 秒 · ${(shot.end - shot.start).toFixed(3)} 秒`}><b>{String(number).padStart(2, '0')}</b><span><strong>镜头片段 {String(number).padStart(2, '0')}</strong></span></button><span className="badge">{roles[shot.role]}</span>{onSeek && <button className="text-button" onClick={() => { onSelect(); onSeek(shot.start); }}><Play size={13} />定位原片 <small className="shot-seek-time">{shot.start.toFixed(1)}s</small></button>}</header>
    <div className="shot-row-content">
      <div className="shot-row-media">
        {media ? <SourceClip project={project} shot={shot} media={media} index={index} onSelect={onSelect} /> : <><div className="shot-media-label"><Film size={13} /><span>原片片段</span></div><div className="shot-media-placeholder"><Film size={27} /><span>{!reference ? '示例未关联原片' : error ? '画面暂不可用' : <><LoaderCircle size={14} className="spin" />准备证据画面…</>}</span></div></>}
        {error && <p className="shot-media-error" role="alert">{error}<button className="text-button" onClick={() => setAttempt(attempt + 1)}><RotateCcw size={12} />重新提取</button></p>}
      </div>
      <div className="shot-row-evidence">
        <div className="shot-media-label"><Image size={13} /><span>证据关键帧 · 3 张</span></div>
        {media ? <div className="shot-frame-strip">{media.frames.map(item => <button key={item.url} onClick={() => setFrame(item)} title={`${frameLabels[item.position]}：${item.reason}`}>
          <img src={item.previewUrl || item.url} alt={`${frameLabels[item.position]} · ${item.at.toFixed(3)} 秒：${item.reason}`} decoding="async" />
          <b>{frameLabels[item.position]}</b><span>{item.at.toFixed(3)}s</span><small>{item.reason}</small>
        </button>)}</div> : <div className="shot-evidence-placeholder">{reference ? '从原片提取首帧、中间关键帧、尾帧' : '上传原片后可查看 3 张关键帧'}</div>}
      </div>
      <dl className={`shot-row-observations${renderEditor ? ' editable' : ''}`} onDoubleClick={renderEditor ? onExpand : undefined} title={renderEditor ? '双击编辑镜头信息' : undefined}><div className="shot-observation-wide"><dt>画面与场景</dt><dd>{shot.visual || '未记录'}</dd></div>{[
        ['主体与外观', shot.subject || '未单独记录；参见画面描述'], ['主体动作', shot.action], ['运镜 / 镜头语言', shot.camera],
        ['动效 / 合成', shot.effects || '未单独记录'], ['转场 / 分段依据', shot.transition || '未单独记录'], ['声音 / 口播', [shot.sound, shot.narration].filter(Boolean).join(' · ') || '未记录'],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '未记录'}</dd></div>)}<div className="shot-observation-wide"><dt>动态时间线</dt><dd style={{ whiteSpace: 'pre-line' }}>{shot.motionBeats?.length ? shotMotionPrompt(shot) : '尚无逐时段动态记录；重新分析视频后生成。'}</dd></div>{shot.uncertainty && <div className="shot-observation-wide shot-uncertainty"><dt>待核对</dt><dd>{shot.uncertainty}</dd></div>}</dl>
    </div>
    {pendingReview && <div className="shot-review-pending">此镜头的时间范围已改变，等待局部重新分析；当前描述仍为原记录。</div>}
    {onFocusChange && <details className="shot-focus"><summary>镜头关注重点 · {(shot.focusPoints || []).filter(point => point.selected).length}/{shot.focusPoints?.length || 0} 项已勾选</summary><FocusPointsEditor points={shot.focusPoints} onChange={onFocusChange} disabled={disabled} max={12} onSeek={onSeek} /></details>}
    <details className="shot-row-prompt"><summary><span>镜头重建 Prompt<small>{shot.reconstructionPrompt ? 'Gemini 分析 / 当前编辑' : '由现有镜头描述整理'}</small></span><ChevronDown size={13} /></summary><div><p>用于描述如何重建这个镜头，可在编辑中调整。</p><pre>{prompt}</pre><button className="btn small" onClick={() => onCopy(prompt)}><Copy size={13} />复制 Prompt</button></div></details>
    {expanded && renderEditor && <div className="shot-row-editor">{renderEditor(shot, index)}{onSplit && <div className="scene-actions"><button className="text-button" disabled={disabled || shot.end - shot.start < .4 || (project.analysis?.shots.length || 0) >= 120} onClick={onSplit}><Scissors size={14} />拆分此镜头</button><span>修改自动保存；调整边界后重新提取片段</span></div>}</div>}
    {frame && <FramePreview frame={frame} onClose={() => setFrame(undefined)} />}
  </article>;
}

function ExcludedShotRow({ shot, number, disabled, onInclude, onSeek }: { shot: Shot; number: number; disabled: boolean; onInclude?: () => void; onSeek?: (seconds: number) => void }) {
  return <article className="shot-breakdown-row shot-excluded">
    <header className="shot-row-heading"><label className="shot-include" title="勾选以重新使用此镜头"><input type="checkbox" checked={false} disabled={disabled || !onInclude} onChange={() => onInclude?.()} aria-label={`使用镜头片段 ${number}`} /></label><button className="shot-row-title" onClick={() => onSeek?.(shot.start)} title={`${shot.start.toFixed(3)}–${shot.end.toFixed(3)} 秒 · ${(shot.end - shot.start).toFixed(3)} 秒`}><b>{String(number).padStart(2, '0')}</b><span><strong>镜头片段 {String(number).padStart(2, '0')}</strong></span></button><span className="badge">未使用</span>{onSeek && <button className="text-button" onClick={() => onSeek(shot.start)}><Play size={13} />定位原片 <small className="shot-seek-time">{shot.start.toFixed(1)}s</small></button>}</header>
    {shot.visual && <p className="shot-excluded-note">{shot.visual}</p>}
  </article>;
}

export default function ShotBreakdown({ project, selectedIndex = -1, onSelect, onSeek, onCopy, onSplit, onToggleInclude, onAcceptSuggestion, onDismissSuggestion, onFocusChange, renderEditor, disabled = false, compact = false }: {
  project: Project; selectedIndex?: number; onSelect?: (index: number) => void; onSeek?: (seconds: number) => void;
  onCopy: (text: string) => void; onSplit?: (index: number) => void; onToggleInclude?: (shotId: string, included: boolean) => void; onAcceptSuggestion?: (shotId: string) => void; onDismissSuggestion?: (shotId: string) => void; onFocusChange?: (shotId: string, points: FocusPoint[]) => void; renderEditor?: (shot: Shot, index: number) => ReactNode; disabled?: boolean; compact?: boolean;
}) {
  const [expanded, setExpanded] = useState<string>();
  const [reviewOpen, setReviewOpen] = useState(false);
  // Original order (by start time) across used and unticked shots, so numbering stays tied to the source timeline.
  const rows = [...(project.analysis?.shots || []).map((shot, index) => ({ shot, index, excluded: false })), ...(project.analysis?.excludedShots || []).map(shot => ({ shot, index: -1, excluded: true }))].sort((a, b) => a.shot.start - b.shot.start);
  const reviewItems = rows.flatMap(({ shot, excluded }, position) => {
    const suggestion = project.analysisReview?.suggestions[shot.id];
    return !excluded && suggestion ? [{ shot, suggestion, number: position + 1 }] : [];
  });
  useEffect(() => { if (!reviewItems.length) setReviewOpen(false); }, [reviewItems.length]);
  return <div className={`shot-breakdown ${compact ? 'compact' : ''}`}>
    <div className="shot-breakdown-intro"><p>一行一个镜头：原片片段 → 证据关键帧 → 观察记录 → 关注重点 → 重建 Prompt。文字为分析与编辑结果，请对照原片核验。</p>{reviewItems.length > 0 && <button className="btn small shot-review-open" disabled={disabled} onClick={() => setReviewOpen(true)}><Sparkles size={14} />AI 分析建议 · {reviewItems.length} 个镜头</button>}</div>
    {rows.map(({ shot, index, excluded }, position) => excluded ? <ExcludedShotRow key={shot.id} shot={shot} number={position + 1} disabled={disabled} onInclude={onToggleInclude ? () => onToggleInclude(shot.id, true) : undefined} onSeek={onSeek} /> : <ShotRow key={shot.id} project={project} shot={shot} index={index} number={position + 1} selected={selectedIndex === index} expanded={expanded === shot.id} disabled={disabled} onSelect={() => onSelect?.(index)} onExpand={() => { onSelect?.(index); setExpanded(expanded === shot.id ? undefined : shot.id); }} onSeek={onSeek} onCopy={onCopy} onSplit={onSplit ? () => onSplit(index) : undefined} onExclude={onToggleInclude && (project.analysis?.shots.length || 0) > 1 ? () => onToggleInclude(shot.id, false) : undefined} onFocusChange={onFocusChange ? points => onFocusChange(shot.id, points) : undefined} renderEditor={renderEditor} />)}
    {reviewOpen && reviewItems.length > 0 && <ShotReviewDialog items={reviewItems} disabled={disabled} onClose={() => setReviewOpen(false)} onAccept={shotId => onAcceptSuggestion?.(shotId)} onDismiss={shotId => onDismissSuggestion?.(shotId)} />}
  </div>;
}
