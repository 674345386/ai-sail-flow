import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Check, EyeOff, Play, RotateCcw, Scissors, Undo2, X } from 'lucide-react';
import { roles, type Asset, type Shot } from '../shared/domain';
import { ClipThumbs, ShotDetailItem, useFrameGrabber } from './ShotTimelineDetails';
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

export default function ShotTimelineEditor({ shots: usedShots, excludedShots = [], duration, video, initialIndex, disabled, onApply, onClose }: {
  shots: Shot[]; excludedShots?: Shot[]; duration: number; video?: Asset; initialIndex: number; disabled: boolean;
  onApply: (updatedShots: Shot[], selectedIndex: number, excludedShots: Shot[]) => void; onClose: () => void;
}) {
  // Edit the full original timeline (used + removed shots, by start time); removed shots sit on the lower track.
  const [shots] = useState<Shot[]>(() => [...usedShots, ...excludedShots].map(shot => ({ ...shot })).sort((a, b) => a.start - b.start));
  const [initialRemoved] = useState(() => new Set(excludedShots.map(shot => shot.id)));
  const [removed, setRemoved] = useState<Set<string>>(() => new Set(initialRemoved));
  initialIndex = Math.max(0, shots.findIndex(shot => shot.id === usedShots[initialIndex]?.id));
  const [draft, setDraft] = useState<Shot[]>(() => shots.map(shot => ({ ...shot })));
  const [selected, setSelected] = useState(clamp(initialIndex, 0, shots.length - 1));
  const [playhead, setPlayhead] = useState(shots[clamp(initialIndex, 0, shots.length - 1)]?.start || 0);
  const [videoRatio, setVideoRatio] = useState(video?.width && video?.height ? video.width / video.height : 16 / 9);
  const [contextMenu, setContextMenu] = useState<TimelineMenu | null>(null);
  const [mergeError, setMergeError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const shotList = useRef<HTMLElement>(null);
  const grabFrame = useFrameGrabber(video?.url);
  const [originalTimes] = useState(() => new Map(shots.map(shot => [shot.id, { start: shot.start, end: shot.end }])));
  const scrubbing = useRef(false);
  const [dragEdge, setDragEdge] = useState<number | null>(null);
  const endHandleDrag = () => { dragging.current = null; setDragEdge(null); };
  const player = useRef<HTMLVideoElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);
  const playbackFrame = useRef<number | null>(null);
  const minimum = Math.min(.05, duration / (shots.length * 2));
  const removedChanged = draft.some(item => removed.has(item.id) !== initialRemoved.has(item.id));
  const changed = removedChanged || draft.length !== shots.length || draft.some((item, index) => item.id !== shots[index]?.id || item.start !== shots[index]?.start || item.end !== shots[index]?.end);
  const usedCount = draft.filter(item => !removed.has(item.id)).length;
  const toggleRemoved = (index: number) => {
    const id = draft[index]?.id;
    if (disabled || !id) return;
    const isRemoved = removed.has(id);
    if (!isRemoved && usedCount <= 1) return;
    setRemoved(current => { const next = new Set(current); if (isRemoved) next.delete(id); else next.add(id); return next; });
    setSelected(index);
    setContextMenu(null);
  };
  const apply = () => {
    const used = draft.filter(item => !removed.has(item.id));
    const selectedUsed = used.findIndex(item => item.id === draft[selected]?.id);
    onApply(used, selectedUsed >= 0 ? selectedUsed : Math.max(0, draft.slice(0, selected).filter(item => !removed.has(item.id)).length - 1), draft.filter(item => removed.has(item.id)));
  };
  const selectedShot = draft[selected];
  const changeCount = draft.filter(item => { const original = shots.find(shot => shot.id === item.id); return !original || Math.abs(original.start - item.start) > .0005 || Math.abs(original.end - item.end) > .0005 || removed.has(item.id) !== initialRemoved.has(item.id); }).length + shots.filter(shot => !draft.some(item => item.id === shot.id)).length;
  const playbackRange = useRef({ start: selectedShot.start, end: selectedShot.end });
  playbackRange.current = { start: selectedShot.start, end: selectedShot.end };

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { if (playbackFrame.current !== null) cancelAnimationFrame(playbackFrame.current); element?.close(); };
  }, []);

  useEffect(() => {
    const list = shotList.current; const item = list?.querySelector<HTMLElement>('.stl-item.selected');
    if (list && item) list.scrollTo({ top: Math.max(0, item.offsetTop - list.offsetTop - 64), behavior: 'smooth' });
  }, [selected]);
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
  const indexAt = (at: number) => { const found = draft.findIndex(item => at >= item.start && at < item.end); return found >= 0 ? found : at >= draft[draft.length - 1].end ? draft.length - 1 : 0; };
  // Moving the playhead (ruler click/drag or the video's own scrubber) selects the shot under it.
  const seekAndSelect = (seconds: number) => { const at = clamp(seconds, 0, duration); seek(at); setSelected(indexAt(at)); };
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
    setDragEdge(index);
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
    if (disabled || removed.has(draft[index]?.id) || draft.length >= 120 || draft[index].end - draft[index].start < .2) return;
    player.current?.pause();
    const source = draft[index];
    const point = round(clamp(at, source.start + .1, source.end - .1));
    const before: Shot = { ...source, end: point, reconstructionPrompt: undefined, evidenceFrames: source.evidenceFrames?.filter(frame => frame.at < point) };
    const after: Shot = { ...source, id: crypto.randomUUID(), start: point, reconstructionPrompt: undefined, evidenceFrames: source.evidenceFrames?.filter(frame => frame.at >= point) };
    setDraft(current => [...current.slice(0, index), before, after, ...current.slice(index + 1)]);
    if (removed.has(source.id)) setRemoved(current => new Set(current).add(after.id));
    setSelected(index + 1);
    setContextMenu(null);
    seek(point);
  };
  const canMerge = (leftIndex: number) => leftIndex >= 0 && leftIndex < draft.length - 1 && !removed.has(draft[leftIndex].id) && !removed.has(draft[leftIndex + 1].id);
  const mergeAt = (leftIndex: number) => {
    if (disabled || !canMerge(leftIndex)) return;
    try {
      player.current?.pause();
      const merged = combineShots(draft[leftIndex], draft[leftIndex + 1]);
      setDraft(current => [...current.slice(0, leftIndex), merged, ...current.slice(leftIndex + 2)]);
      const leftId = draft[leftIndex].id, rightId = draft[leftIndex + 1].id;
      setRemoved(current => { const next = new Set(current); const both = next.has(leftId) && next.has(rightId); next.delete(rightId); if (!both) next.delete(leftId); return next; });
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
    <div className="shot-timeline-top">
    <div className="shot-timeline-body" style={{ '--video-ratio': videoRatio } as CSSProperties}>
      <div className="shot-timeline-preview"><div className="shot-timeline-video">{video ? <video ref={player} src={video.url} poster={video.thumbnail} controls playsInline preload="metadata" onLoadedMetadata={event => { const media = event.currentTarget; if (media.videoWidth && media.videoHeight) setVideoRatio(media.videoWidth / media.videoHeight); media.currentTime = playhead; }} onPlay={event => onVideoPlay(event.currentTarget)} onPause={stopPlaybackMonitor} onSeeked={event => { const media = event.currentTarget; if (media.paused && dragging.current === null && !scrubbing.current) { const index = indexAt(media.currentTime); setSelected(current => current === index ? current : index); } }} onTimeUpdate={event => { const media = event.currentTarget; if (!media.paused && checkPlaybackRange(media)) return; setPlayhead(media.currentTime); }} aria-label="原片时间线预览" /> : <div className="shot-timeline-no-video">示例镜头没有关联原片</div>}</div><div className="shot-timeline-preview-meta"><span>原片预览</span><strong>{playhead.toFixed(3)} / {duration.toFixed(3)} 秒</strong></div></div>
    </div>
      <div className="stl-panel" style={{ '--video-ratio': videoRatio } as CSSProperties} aria-label="镜头片段信息"><ShotDetailItem key={selectedShot.id} shot={selectedShot} number={selected + 1} total={draft.length} expanded selected removed={removed.has(selectedShot.id)} original={originalTimes.get(selectedShot.id)} grab={grabFrame} onSelect={() => undefined} onToggle={() => toggleRemoved(selected)} toggleDisabled={disabled || (!removed.has(selectedShot.id) && usedCount <= 1)}><div className="shot-timeline-fields"><label>起始点 <input type="number" min="0" max={duration} step="0.001" value={selectedShot.start} disabled={disabled || removed.has(selectedShot.id) || (selected > 0 && removed.has(draft[selected - 1].id))} onChange={event => moveStart(selected, Number(event.target.value))} /></label><label>结束点 <input type="number" min="0" max={duration} step="0.001" value={selectedShot.end} disabled={disabled || removed.has(selectedShot.id) || (selected < draft.length - 1 && removed.has(draft[selected + 1].id))} onChange={event => selected < draft.length - 1 ? moveStart(selected + 1, Number(event.target.value)) : moveLastEnd(Number(event.target.value))} /></label></div><div className="shot-timeline-duration">片段时长 <strong>{(selectedShot.end - selectedShot.start).toFixed(3)} 秒</strong></div><button className="btn small" disabled={!video} onClick={() => { seek(selectedShot.start); void player.current?.play(); }}><Play size={13} />播放此镜头</button></ShotDetailItem></div>
    </div>
    <section className="shot-timeline-section" aria-label="可编辑镜头时间线"><div className="shot-timeline-section-heading"><div><strong>镜头时间线</strong><span>{`${draft.length} 个镜头 · 使用 ${usedCount} 个 · 共 ${draft.filter(item => !removed.has(item.id)).reduce((sum, item) => sum + item.end - item.start, 0).toFixed(3)} 秒`}</span></div><span>右键片段拆分 / 去除 · 右键分界线合并</span></div><div className="shot-timeline-scroll"><div className="shot-timeline-canvas" style={{ minWidth: `${Math.max(720, duration * 56)}px` }}>
      <div className="shot-timeline-ruler" onPointerDown={event => { if (event.button !== 0) return; player.current?.pause(); scrubbing.current = true; event.currentTarget.setPointerCapture(event.pointerId); seekAndSelect(positionFromPointer(event)); }} onPointerMove={event => { if (scrubbing.current) seekAndSelect(positionFromPointer(event)); }} onPointerUp={() => { scrubbing.current = false; }} onPointerCancel={() => { scrubbing.current = false; }}>{ticks.map(time => <span key={time} style={{ left: `${time / duration * 100}%` }}>{time.toFixed(duration < 1 ? 2 : time < 10 ? 1 : 0)}s</span>)}</div>
      <div ref={track} className="shot-timeline-track">
        {draft.map((item, index) => removed.has(item.id) ? null : <button key={item.id} type="button" className={`shot-timeline-clip ${selected === index ? 'selected' : ''}`} style={{ left: `${item.start / duration * 100}%`, width: `${(item.end - item.start) / duration * 100}%` }} onClick={() => select(index)} onContextMenu={event => { event.preventDefault(); if (disabled) return; player.current?.pause(); const at = round(clamp(positionFromPointer(event), item.start, item.end)); setSelected(index); seek(at); setMergeError(''); setContextMenu({ kind: 'clip', index, at, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 240)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 185)) }); }} title={`镜头 ${index + 1} · ${item.start.toFixed(3)}–${item.end.toFixed(3)} 秒 · 右键编辑`}><ClipThumbs start={item.start} end={item.end} grab={grabFrame} /><span className="stl-clip-label"><b>{String(index + 1).padStart(2, '0')}</b><small><i className={`role-dot role-${item.role}`} />{roles[item.role]}</small></span><em className="stl-clip-dur">{(item.end - item.start).toFixed(2)}s</em></button>)}
        {dragEdge !== null && (() => { const at = dragEdge >= draft.length ? draft[draft.length - 1].end : draft[dragEdge].start; const prev = draft[dragEdge - 1], next = draft[dragEdge]; const label = (item: Shot | undefined, index: number) => item ? `${String(index + 1).padStart(2, '0')} ${(item.end - item.start).toFixed(3)}s` : ''; return <div className="stl-drag-guide" style={{ left: `${at / duration * 100}%` }} aria-hidden="true"><span className="stl-drag-bubble"><b>{at.toFixed(3)} s</b>{[label(prev, dragEdge - 1), label(next, dragEdge)].filter(Boolean).join(' ⟷ ')}</span></div>; })()}
        <div className="shot-timeline-playhead" style={{ left: `${playhead / duration * 100}%` }} aria-hidden="true" />
        {draft.map((item, index) => <button key={`edge-${item.id}`} type="button" className="shot-timeline-handle" style={{ left: `${item.start / duration * 100}%` }} disabled={disabled || removed.has(item.id) || (index > 0 && removed.has(draft[index - 1].id))} aria-label={`镜头 ${index + 1} 起始点 ${item.start.toFixed(3)} 秒${index ? '；右键可合并相邻镜头' : ''}`} title={index ? '拖动调整；右键合并相邻镜头' : '拖动镜头起始点'} onPointerDown={event => onHandleDown(event, index)} onPointerMove={onHandleMove} onPointerUp={endHandleDrag} onPointerCancel={endHandleDrag} onContextMenu={event => { event.preventDefault(); if (disabled || !index) return; setMergeError(''); setContextMenu({ kind: 'boundary', rightIndex: index, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 240)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 115)) }); }} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); moveStart(index, item.start + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? .1 : .01)); } }} />)}
        <button type="button" className="shot-timeline-handle last" style={{ left: `${draft[draft.length - 1].end / duration * 100}%` }} disabled={disabled || removed.has(draft[draft.length - 1].id)} aria-label={`最后镜头结束点 ${draft[draft.length - 1].end.toFixed(3)} 秒`} title="拖动最后镜头结束点" onPointerDown={event => onHandleDown(event, draft.length)} onPointerMove={onHandleMove} onPointerUp={endHandleDrag} onPointerCancel={endHandleDrag} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); moveLastEnd(draft[draft.length - 1].end + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? .1 : .01)); } }} />
      </div>
      <div className="shot-timeline-removed-track" aria-label="已去除的镜头">{removed.size ? draft.map((item, index) => removed.has(item.id) ? <button key={`removed-${item.id}`} type="button" className={`shot-timeline-clip removed ${selected === index ? 'selected' : ''}`} style={{ left: `${item.start / duration * 100}%`, width: `${(item.end - item.start) / duration * 100}%` }} onClick={() => select(index)} onContextMenu={event => { event.preventDefault(); if (disabled) return; player.current?.pause(); const at = round(clamp(positionFromPointer(event), item.start, item.end)); setSelected(index); seek(at); setMergeError(''); setContextMenu({ kind: 'clip', index, at, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 240)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 185)) }); }} title={`镜头 ${index + 1} · 已去除 · 右键恢复`}><ClipThumbs start={item.start} end={item.end} grab={grabFrame} /><span className="stl-clip-label"><b>{String(index + 1).padStart(2, '0')}</b><small>已去除</small></span><span role="button" tabIndex={0} className="stl-restore" onClick={event => { event.stopPropagation(); toggleRemoved(index); }} onKeyDown={event => { if (event.key === 'Enter') { event.stopPropagation(); toggleRemoved(index); } }}>恢复</span></button> : null) : <span className="shot-timeline-removed-empty">右键片段选择「去除此镜头」，它会移到这里，不再用于后续生成</span>}</div><div className="shot-timeline-scale"><span>00:00</span><span>{duration.toFixed(3)}s</span></div>
    </div></div></section>
    <footer className="shot-timeline-footer"><span>{changed && <b className="stl-change-count">{changeCount} 处未应用的修改</b>}{changed ? '应用后将保存镜头，并重新提取受影响的片段与关键帧。' : '右键片段可拆分，右键分界线可合并；调整后点击应用时间点。'}</span><div><button className="btn" disabled={disabled || !changed} onClick={() => { setDraft(shots.map(shot => ({ ...shot }))); setRemoved(new Set(initialRemoved)); setSelected(clamp(selected, 0, shots.length - 1)); setContextMenu(null); setMergeError(''); }}><RotateCcw size={14} />重置</button><button className="btn primary" disabled={disabled || !changed} onClick={apply}><Check size={15} />应用时间点</button></div></footer>
    {contextMenu && <div className="shot-timeline-context-menu" role="menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
      {contextMenu.kind === 'clip' ? <>
        {!removed.has(draft[contextMenu.index].id) && <button type="button" role="menuitem" disabled={draft.length >= 120 || draft[contextMenu.index].end - draft[contextMenu.index].start < .2} onClick={() => splitAt(contextMenu.index, contextMenu.at)}><Scissors size={15} /><span>拆分镜头<small>在 {contextMenu.at.toFixed(3)} 秒处</small></span></button>}
        <button type="button" role="menuitem" disabled={!video} onClick={() => { const item = draft[contextMenu.index]; setContextMenu(null); setSelected(contextMenu.index); playbackRange.current = { start: item.start, end: item.end }; seek(item.start); void player.current?.play(); }}><Play size={15} /><span>只播放此镜头</span></button>
        {canMerge(contextMenu.index - 1) && <button type="button" role="menuitem" onClick={() => mergeAt(contextMenu.index - 1)}><span>与前一个镜头合并</span></button>}
        {canMerge(contextMenu.index) && <button type="button" role="menuitem" onClick={() => mergeAt(contextMenu.index)}><span>与后一个镜头合并</span></button>}
        {removed.has(draft[contextMenu.index].id)
          ? <button type="button" role="menuitem" onClick={() => toggleRemoved(contextMenu.index)}><Undo2 size={15} /><span>恢复此镜头<small>移回上方时间线</small></span></button>
          : <button type="button" role="menuitem" disabled={usedCount <= 1} onClick={() => toggleRemoved(contextMenu.index)}><EyeOff size={15} /><span>去除此镜头<small>{usedCount <= 1 ? '至少保留一个镜头' : '移到下方，不用于后续生成'}</small></span></button>}
        {draft.length >= 120 && <p>最多支持 120 个镜头</p>}
      </> : <button type="button" role="menuitem" disabled={!canMerge(contextMenu.rightIndex - 1)} title={canMerge(contextMenu.rightIndex - 1) ? undefined : '相邻镜头已去除，请先恢复'} onClick={() => mergeAt(contextMenu.rightIndex - 1)}><span>合并左右镜头<small>删除此处分界线</small></span></button>}
      {mergeError && <p role="alert">{mergeError}</p>}
    </div>}
  </dialog>;
}
