import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Check, Play, RotateCcw, Scissors, X } from 'lucide-react';
import { roles, type Asset, type Shot } from '../shared/domain';
import './shot-timeline-editor.css';

function round(seconds: number) { return Math.round(seconds * 1000) / 1000; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function tickStep(duration: number) {
  const desired = duration / 10;
  const size = 10 ** Math.floor(Math.log10(desired || 1));
  return [1, 2, 5, 10].map(n => n * size).find(n => n >= desired) || 10 * size;
}
type TimelineMenu = { kind: 'clip'; index: number; at: number; x: number; y: number } | { kind: 'boundary'; rightIndex: number; x: number; y: number };

function combineText(label: string, before = '', after = '', limit: number) {
  const first = before.trim();
  const second = after.trim();
  const combined = !first ? second : !second || first === second ? first : `前段：${first}\n后段：${second}`;
  if (combined.length > limit) throw new Error(`${label}合并后超过长度限制，请先精简相邻镜头的内容。`);
  return combined;
}

function combineShots(first: Shot, second: Shot): Shot {
  const frames = [...(first.evidenceFrames || []), ...(second.evidenceFrames || [])]
    .sort((a, b) => a.at - b.at).filter((frame, index, all) => !index || frame.at - all[index - 1].at > .025);
  const evidenceFrames = frames.length <= 3 ? frames : [frames[0], frames[Math.floor((frames.length - 1) / 2)], frames[frames.length - 1]];
  const prompt = combineText('镜头重建 Prompt', first.reconstructionPrompt, second.reconstructionPrompt, 7980);
  return {
    ...first, end: second.end,
    visual: combineText('画面与场景', first.visual, second.visual, 6000),
    action: combineText('人物 / 产品动作', first.action, second.action, 4000),
    camera: combineText('镜头语言', first.camera, second.camera, 2000),
    narration: combineText('口播', first.narration, second.narration, 4000),
    onScreenText: combineText('画面文字', first.onScreenText, second.onScreenText, 2000),
    sound: combineText('声音', first.sound, second.sound, 2000),
    productPresence: combineText('产品呈现', first.productPresence, second.productPresence, 2000),
    uncertainty: combineText('待确认内容', first.uncertainty, second.uncertainty, 2000),
    subject: combineText('主体与外观', first.subject, second.subject, 3000),
    effects: combineText('动效 / 合成', first.effects, second.effects, 3000),
    transition: combineText('转场 / 分段依据', first.transition, second.transition, 2000),
    reconstructionPrompt: prompt ? `合并镜头后请对照原片核对。\n${prompt}` : undefined,
    evidenceFrames,
  };
}

export default function ShotTimelineEditor({ shots, duration, video, initialIndex, disabled, onApply, onClose }: {
  shots: Shot[]; duration: number; video?: Asset; initialIndex: number; disabled: boolean;
  onApply: (updatedShots: Shot[], selectedIndex: number) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<Shot[]>(() => shots.map(shot => ({ ...shot })));
  const [selected, setSelected] = useState(clamp(initialIndex, 0, shots.length - 1));
  const [playhead, setPlayhead] = useState(shots[clamp(initialIndex, 0, shots.length - 1)]?.start || 0);
  const [videoRatio, setVideoRatio] = useState(video?.width && video?.height ? video.width / video.height : 16 / 9);
  const [contextMenu, setContextMenu] = useState<TimelineMenu | null>(null);
  const [mergeError, setMergeError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);
  const playbackFrame = useRef<number | null>(null);
  const minimum = Math.min(.05, duration / (shots.length * 2));
  const changed = draft.length !== shots.length || draft.some((item, index) => item.id !== shots[index]?.id || item.start !== shots[index]?.start || item.end !== shots[index]?.end);
  const selectedShot = draft[selected];
  const playbackRange = useRef({ start: selectedShot.start, end: selectedShot.end });
  playbackRange.current = { start: selectedShot.start, end: selectedShot.end };

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { if (playbackFrame.current !== null) cancelAnimationFrame(playbackFrame.current); element?.close(); };
  }, []);

  const stopPlaybackMonitor = () => {
    if (playbackFrame.current !== null) cancelAnimationFrame(playbackFrame.current);
    playbackFrame.current = null;
  };
  const checkPlaybackRange = (media: HTMLVideoElement) => {
    const { start, end } = playbackRange.current;
    if (media.currentTime < start - .015) { media.currentTime = start; setPlayhead(start); }
    if (media.currentTime >= end - .015) {
      media.pause();
      media.currentTime = end;
      setPlayhead(end);
      return true;
    }
    return false;
  };
  const monitorPlayback = () => {
    const media = player.current;
    if (!media || media.paused || checkPlaybackRange(media)) { playbackFrame.current = null; return; }
    playbackFrame.current = requestAnimationFrame(monitorPlayback);
  };
  const onVideoPlay = (media: HTMLVideoElement) => {
    const { start, end } = playbackRange.current;
    if (media.currentTime < start - .015 || media.currentTime >= end - .015) {
      media.currentTime = start;
      setPlayhead(start);
    }
    stopPlaybackMonitor();
    playbackFrame.current = requestAnimationFrame(monitorPlayback);
  };

  const moveStart = (index: number, value: number) => {
    if (disabled || !Number.isFinite(value)) return;
    setDraft(current => {
      const next = current.map(item => ({ ...item }));
      const lower = index ? next[index - 1].start + minimum : 0;
      const upper = next[index].end - minimum;
      const at = round(clamp(value, lower, upper));
      next[index].start = at;
      if (index) next[index - 1].end = at;
      return next;
    });
  };
  const moveLastEnd = (value: number) => {
    if (disabled || !Number.isFinite(value)) return;
    setDraft(current => {
      const next = current.map(item => ({ ...item }));
      next[next.length - 1].end = round(clamp(value, next[next.length - 1].start + minimum, duration));
      return next;
    });
  };
  const seek = (seconds: number) => {
    const at = clamp(seconds, 0, duration);
    setPlayhead(at);
    if (player.current) player.current.currentTime = at;
  };
  const select = (index: number) => { player.current?.pause(); setSelected(index); seek(draft[index].start); };
  const positionFromPointer = (event: { clientX: number }) => {
    const bounds = track.current!.getBoundingClientRect();
    return (event.clientX - bounds.left) / bounds.width * duration;
  };
  const onHandleDown = (event: PointerEvent<HTMLButtonElement>, index: number) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    player.current?.pause();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = index;
    setSelected(Math.min(index, draft.length - 1));
  };
  const onHandleMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragging.current === null) return;
    const at = positionFromPointer(event);
    if (dragging.current === draft.length) moveLastEnd(at);
    else moveStart(dragging.current, at);
    seek(at);
  };
  const splitAt = (index: number, at: number) => {
    if (disabled || draft.length >= 120 || draft[index].end - draft[index].start < .2) return;
    player.current?.pause();
    const source = draft[index];
    const point = round(clamp(at, source.start + .1, source.end - .1));
    const before: Shot = { ...source, end: point, reconstructionPrompt: undefined, evidenceFrames: source.evidenceFrames?.filter(frame => frame.at < point) };
    const after: Shot = { ...source, id: crypto.randomUUID(), start: point, reconstructionPrompt: undefined, evidenceFrames: source.evidenceFrames?.filter(frame => frame.at >= point) };
    setDraft(current => [...current.slice(0, index), before, after, ...current.slice(index + 1)]);
    setSelected(index + 1);
    setContextMenu(null);
    seek(point);
  };
  const mergeAt = (leftIndex: number) => {
    if (disabled || leftIndex < 0 || leftIndex >= draft.length - 1) return;
    try {
      player.current?.pause();
      const merged = combineShots(draft[leftIndex], draft[leftIndex + 1]);
      setDraft(current => [...current.slice(0, leftIndex), merged, ...current.slice(leftIndex + 2)]);
      setSelected(leftIndex);
      setMergeError('');
      setContextMenu(null);
      seek(merged.start);
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : '合并失败，请检查镜头内容。');
    }
  };
  const ticks: number[] = [];
  const step = tickStep(duration);
  for (let time = 0; time < duration; time += step) ticks.push(round(time));
  ticks.push(duration);

  return <dialog ref={dialog} className="shot-timeline-dialog" aria-labelledby="shot-timeline-title" onCancel={event => { event.preventDefault(); if (contextMenu) setContextMenu(null); else onClose(); }} onClick={event => { if (contextMenu && !(event.target as HTMLElement).closest('.shot-timeline-context-menu')) setContextMenu(null); if (event.target === event.currentTarget) onClose(); }}>
    <header className="shot-timeline-header"><div><span className="shot-timeline-kicker">视频拆解 / TIMELINE</span><h2 id="shot-timeline-title">编辑镜头时间点</h2><p>右键片段可拆分，右键分界线可合并；拖动分界线或输入秒数调整时间。</p></div><button className="icon-btn" aria-label="关闭时间线编辑" onClick={onClose}><X size={19} /></button></header>
    <div className="shot-timeline-body" style={{ '--video-ratio': videoRatio } as CSSProperties}>
      <div className="shot-timeline-preview"><div className="shot-timeline-video">{video ? <video ref={player} src={video.url} poster={video.thumbnail} controls playsInline preload="metadata" onLoadedMetadata={event => { const media = event.currentTarget; if (media.videoWidth && media.videoHeight) setVideoRatio(media.videoWidth / media.videoHeight); media.currentTime = playhead; }} onPlay={event => onVideoPlay(event.currentTarget)} onPause={stopPlaybackMonitor} onTimeUpdate={event => { const media = event.currentTarget; if (!media.paused && checkPlaybackRange(media)) return; setPlayhead(media.currentTime); }} aria-label="原片时间线预览" /> : <div className="shot-timeline-no-video">示例镜头没有关联原片</div>}</div><div className="shot-timeline-preview-meta"><span>原片预览</span><strong>{playhead.toFixed(3)} / {duration.toFixed(3)} 秒</strong></div></div>
      <aside className="shot-timeline-inspector"><span className="shot-timeline-kicker">已选镜头 · {String(selected + 1).padStart(2, '0')} / {draft.length}</span><h3>{roles[selectedShot.role]}</h3><p>{selectedShot.visual || '当前镜头'}</p><div className="shot-timeline-fields"><label>起始点 <input type="number" min="0" max={duration} step="0.001" value={selectedShot.start} disabled={disabled} onChange={event => moveStart(selected, Number(event.target.value))} /></label><label>结束点 <input type="number" min="0" max={duration} step="0.001" value={selectedShot.end} disabled={disabled} onChange={event => selected < draft.length - 1 ? moveStart(selected + 1, Number(event.target.value)) : moveLastEnd(Number(event.target.value))} /></label></div><div className="shot-timeline-duration">片段时长 <strong>{(selectedShot.end - selectedShot.start).toFixed(3)} 秒</strong></div><button className="btn small" disabled={!video} onClick={() => { seek(selectedShot.start); void player.current?.play(); }}><Play size={13} />播放此镜头</button></aside>
    </div>
    <section className="shot-timeline-section" aria-label="可编辑镜头时间线"><div className="shot-timeline-section-heading"><div><strong>镜头时间线</strong><span>{draft.length} 个镜头 · {duration.toFixed(3)} 秒</span></div><span>右键片段拆分 · 右键分界线合并</span></div><div className="shot-timeline-scroll"><div className="shot-timeline-canvas" style={{ minWidth: `${Math.max(720, duration * 56)}px` }}>
      <div className="shot-timeline-ruler" onClick={event => seek(positionFromPointer(event))}>{ticks.map(time => <span key={time} style={{ left: `${time / duration * 100}%` }}>{time.toFixed(duration < 1 ? 2 : time < 10 ? 1 : 0)}s</span>)}</div>
      <div ref={track} className="shot-timeline-track">
        {draft.map((item, index) => <button key={item.id} type="button" className={`shot-timeline-clip ${selected === index ? 'selected' : ''}`} style={{ left: `${item.start / duration * 100}%`, width: `${(item.end - item.start) / duration * 100}%` }} onClick={() => select(index)} onContextMenu={event => { event.preventDefault(); if (disabled) return; player.current?.pause(); const at = round(clamp(positionFromPointer(event), item.start, item.end)); setSelected(index); seek(at); setMergeError(''); setContextMenu({ kind: 'clip', index, at, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 240)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 185)) }); }} title={`镜头 ${index + 1} · ${item.start.toFixed(3)}–${item.end.toFixed(3)} 秒 · 右键编辑`}><span>{String(index + 1).padStart(2, '0')}</span><small>{roles[item.role]}</small></button>)}
        <div className="shot-timeline-playhead" style={{ left: `${playhead / duration * 100}%` }} aria-hidden="true" />
        {draft.map((item, index) => <button key={`edge-${item.id}`} type="button" className="shot-timeline-handle" style={{ left: `${item.start / duration * 100}%` }} disabled={disabled} aria-label={`镜头 ${index + 1} 起始点 ${item.start.toFixed(3)} 秒${index ? '；右键可合并相邻镜头' : ''}`} title={index ? '拖动调整；右键合并相邻镜头' : '拖动镜头起始点'} onPointerDown={event => onHandleDown(event, index)} onPointerMove={onHandleMove} onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }} onContextMenu={event => { event.preventDefault(); if (disabled || !index) return; setMergeError(''); setContextMenu({ kind: 'boundary', rightIndex: index, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 240)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 115)) }); }} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); moveStart(index, item.start + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? .1 : .01)); } }} />)}
        <button type="button" className="shot-timeline-handle last" style={{ left: `${draft[draft.length - 1].end / duration * 100}%` }} disabled={disabled} aria-label={`最后镜头结束点 ${draft[draft.length - 1].end.toFixed(3)} 秒`} title="拖动最后镜头结束点" onPointerDown={event => onHandleDown(event, draft.length)} onPointerMove={onHandleMove} onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); moveLastEnd(draft[draft.length - 1].end + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? .1 : .01)); } }} />
      </div><div className="shot-timeline-scale"><span>00:00</span><span>{duration.toFixed(3)}s</span></div>
    </div></div></section>
    <footer className="shot-timeline-footer"><span>{changed ? '应用后将保存镜头，并重新提取受影响的片段与关键帧。' : '右键片段可拆分，右键分界线可合并；调整后点击应用时间点。'}</span><div><button className="btn" disabled={disabled || !changed} onClick={() => { setDraft(shots.map(shot => ({ ...shot }))); setSelected(clamp(selected, 0, shots.length - 1)); setContextMenu(null); setMergeError(''); }}><RotateCcw size={14} />重置</button><button className="btn primary" disabled={disabled || !changed} onClick={() => onApply(draft, selected)}><Check size={15} />应用时间点</button></div></footer>
    {contextMenu && <div className="shot-timeline-context-menu" role="menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
      {contextMenu.kind === 'clip' ? <>
        <button type="button" role="menuitem" disabled={draft.length >= 120 || draft[contextMenu.index].end - draft[contextMenu.index].start < .2} onClick={() => splitAt(contextMenu.index, contextMenu.at)}><Scissors size={15} /><span>拆分镜头<small>在 {contextMenu.at.toFixed(3)} 秒处</small></span></button>
        {contextMenu.index > 0 && <button type="button" role="menuitem" onClick={() => mergeAt(contextMenu.index - 1)}><span>与前一个镜头合并</span></button>}
        {contextMenu.index < draft.length - 1 && <button type="button" role="menuitem" onClick={() => mergeAt(contextMenu.index)}><span>与后一个镜头合并</span></button>}
        {draft.length >= 120 && <p>最多支持 120 个镜头</p>}
      </> : <button type="button" role="menuitem" onClick={() => mergeAt(contextMenu.rightIndex - 1)}><span>合并左右镜头<small>删除此处分界线</small></span></button>}
      {mergeError && <p role="alert">{mergeError}</p>}
    </div>}
  </dialog>;
}
