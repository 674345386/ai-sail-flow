import { Fragment, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Check, ChevronLeft, Mouse, ChevronRight, EyeOff, Maximize, Pause, Play, Repeat, RotateCcw, Scissors, SkipBack, SkipForward, Undo2, Volume2, VolumeX, X } from 'lucide-react';
import { roles, type Asset, type Shot } from '../shared/domain';
import { ClipThumbs, MANUAL_KEYFRAME, ShotDetailItem, useFrameGrabber } from './ShotTimelineDetails';
import './shot-timeline-editor.css';

function round(seconds: number) { return Math.round(seconds * 1000) / 1000; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function tickStep(duration: number) {
  const desired = duration / 10;
  const size = 10 ** Math.floor(Math.log10(desired || 1));
  return [1, 2, 5, 10].map(n => n * size).find(n => n >= desired) || 10 * size;
}
const pad2 = (n: number) => String(n).padStart(2, '0');
function clock(seconds: number) { const m = Math.floor(seconds / 60); return `${pad2(m)}:${(seconds - m * 60).toFixed(3).padStart(6, '0')}`; }
function ListThumb({ start, end, grab }: { start: number; end: number; grab: (at: number) => Promise<string | undefined> }) {
  const snapped = Math.round((start + Math.min(.4, (end - start) / 2)) * 2) / 2;
  const at = snapped >= start && snapped < end ? snapped : Math.round(start * 100) / 100;
  const [src, setSrc] = useState<string>();
  useEffect(() => { let active = true; void grab(at).then(url => { if (active && url) setSrc(url); }); return () => { active = false; }; }, [at, grab]);
  return src ? <img className="stl-list-thumb" src={src} alt="" /> : <span className="stl-list-thumb" />;
}
type PaneLayout = { list: number; insp: number; top: number };
const LAYOUT_KEY = 'sail.shotTimeline.layout.v2';
const dialogWidth = () => Math.min(1640, window.innerWidth - 32);
const defaultLayout = (): PaneLayout => ({ list: Math.round(clamp(dialogWidth() * .2, 180, 320)), insp: Math.round(clamp(dialogWidth() * .36, 320, 620)), top: Math.round(clamp(window.innerHeight * .46, 280, 560)) });
function loadLayout(): PaneLayout { try { const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null'); if (saved && [saved.list, saved.insp, saved.top].every(Number.isFinite)) return saved; } catch { /* ignore */ } return defaultLayout(); }
type TimelineMenu = { kind: 'clip'; index: number; at: number; x: number; y: number } | { kind: 'boundary'; rightIndex: number; x: number; y: number };
type DragTarget = { index: number; edge: 'start' | 'end' };

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
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const loopRef = useRef(false);
  const [layout, setLayout] = useState<PaneLayout>(loadLayout);
  useEffect(() => { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* ignore */ } }, [layout]);
  const startResize = (event: PointerEvent<HTMLDivElement>, kind: keyof PaneLayout) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget; handle.setPointerCapture(event.pointerId); handle.classList.add('active');
    const x0 = event.clientX, y0 = event.clientY, base = layout;
    const move = (next: globalThis.PointerEvent) => { const dx = next.clientX - x0, dy = next.clientY - y0; const room = dialogWidth() - 14 - 360; setLayout(kind === 'list' ? { ...base, list: clamp(base.list + dx, 180, Math.max(180, Math.min(420, room - base.insp))) } : kind === 'insp' ? { ...base, insp: clamp(base.insp - dx, 320, Math.max(320, room - base.list)) } : { ...base, top: clamp(base.top + dy, 280, Math.max(280, (window.innerHeight - 24) * .7)) }); };
    const up = () => { handle.classList.remove('active'); handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
  };
  const resetResize = (kind: keyof PaneLayout) => setLayout(current => ({ ...current, [kind]: defaultLayout()[kind] }));
  loopRef.current = loop;
  const [dragEdge, setDragEdge] = useState<DragTarget | null>(null);
  const endHandleDrag = () => { dragging.current = null; setDragEdge(null); };
  const player = useRef<HTMLVideoElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef<DragTarget | null>(null);
  const playbackFrame = useRef<number | null>(null);
  const minimum = Math.min(.05, duration / (shots.length * 2));
  const middleOf = (item: Shot) => item.evidenceFrames?.[1]?.at ?? -1;
  const removedChanged = draft.some(item => removed.has(item.id) !== initialRemoved.has(item.id));
  const changed = removedChanged || draft.length !== shots.length || draft.some((item, index) => item.id !== shots[index]?.id || item.start !== shots[index]?.start || item.end !== shots[index]?.end || middleOf(item) !== (shots[index] ? middleOf(shots[index]) : -1));
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
  const changeCount = draft.filter(item => { const original = shots.find(shot => shot.id === item.id); return !original || Math.abs(original.start - item.start) > .0005 || Math.abs(original.end - item.end) > .0005 || middleOf(original) !== middleOf(item) || removed.has(item.id) !== initialRemoved.has(item.id); }).length + shots.filter(shot => !draft.some(item => item.id === shot.id)).length;
  const playbackRange = useRef({ start: selectedShot.start, end: selectedShot.end });
  playbackRange.current = { start: selectedShot.start, end: selectedShot.end };

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { if (playbackFrame.current !== null) cancelAnimationFrame(playbackFrame.current); element?.close(); };
  }, []);

  // Wheel over the preview steps to the previous/next shot (one step per gesture, throttled for trackpads).
  const stageRef = useRef<HTMLDivElement>(null);
  const wheelStep = useRef<(delta: number) => void>(() => undefined);
  // Wheel hint on the preview: shown on hover until the user has switched by wheel once.
  const [wheelHint, setWheelHint] = useState(() => { try { return !localStorage.getItem('sail.shotTimeline.wheelUsed'); } catch { return false; } });
  wheelStep.current = delta => {
    if (wheelHint) { setWheelHint(false); try { localStorage.setItem('sail.shotTimeline.wheelUsed', '1'); } catch { /* ignore */ } }
    const next = clamp(selected + delta, 0, draft.length - 1); if (next !== selected) select(next);
  };
  useEffect(() => {
    if (!wheelHint) return;
    const timer = window.setTimeout(() => { setWheelHint(false); try { localStorage.setItem('sail.shotTimeline.wheelUsed', '1'); } catch { /* ignore */ } }, 3000);
    return () => window.clearTimeout(timer);
  }, [wheelHint]);
  const timelineScroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const elements = [stageRef.current, timelineScroll.current].filter((item): item is HTMLDivElement => !!item); if (!elements.length) return;
    let acc = 0, lockedUntil = 0;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX) || event.ctrlKey) return;
      event.preventDefault();
      const now = performance.now(); if (now < lockedUntil) return;
      acc += event.deltaY;
      if (Math.abs(acc) >= 40) { wheelStep.current(acc > 0 ? 1 : -1); acc = 0; lockedUntil = now + 250; }
    };
    elements.forEach(element => element.addEventListener('wheel', onWheel, { passive: false }));
    return () => elements.forEach(element => element.removeEventListener('wheel', onWheel));
  }, []);
  // Inspector frame edits change only this shot's own range; timeline boundary handles still trim both neighbors.
  // The middle frame picks a keyframe inside the shot. All are draft changes, saved by 应用时间点 and undone by 重置.
  const setMiddle = (index: number, at: number) => setDraft(current => current.map((item, i) => i !== index ? item : { ...item, evidenceFrames: [item.evidenceFrames?.[0] ?? { at: item.start, reason: '首帧' }, { at, reason: MANUAL_KEYFRAME }, item.evidenceFrames?.[2] ?? { at: Math.max(item.start, item.end - .04), reason: '尾帧' }] }));
  const setShotStart = (index: number, value: number) => {
    if (disabled || !Number.isFinite(value)) return;
    setDraft(current => current.map((item, i) => {
      if (i !== index) return item;
      const lower = index ? current[index - 1].start + minimum : 0;
      return { ...item, start: round(clamp(value, lower, item.end - minimum)) };
    }));
  };
  const onFrameChange = (index: number, value: number) => {
    if (disabled || !Number.isFinite(value)) return;
    player.current?.pause();
    const shot = selectedShot;
    if (removed.has(shot.id)) return;
    if (index === 0) {
      const lower = selected ? draft[selected - 1].start + minimum : 0, at = round(clamp(value, lower, shot.end - minimum));
      setShotStart(selected, at); seek(at);
    } else if (index === 2) {
      const at = round(clamp(value, shot.start + minimum, duration));
      moveShotEnd(selected, at);
      seek(Math.max(shot.start, at - .04));
    } else {
      const at = round(clamp(value, shot.start + .02, shot.end - .02));
      setMiddle(selected, at); seek(at);
    }
  };
  const lastSelected = useRef(selected);
  const swapDir = useRef<'next' | 'prev'>('next');
  if (lastSelected.current !== selected) { swapDir.current = selected > lastSelected.current ? 'next' : 'prev'; lastSelected.current = selected; }

  useEffect(() => {
    const box = timelineScroll.current; const clip = box?.querySelector<HTMLElement>('.shot-timeline-track .shot-timeline-clip.selected');
    if (box && clip) { const left = clip.offsetLeft, right = left + clip.offsetWidth; if (left < box.scrollLeft + 24 || right > box.scrollLeft + box.clientWidth - 24) box.scrollTo({ left: Math.max(0, left - box.clientWidth / 2 + clip.offsetWidth / 2), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
  }, [selected]);
  useEffect(() => {
    const list = shotList.current; const item = list?.querySelector<HTMLElement>('.stl-list-row.selected');
    if (list && item && (item.offsetTop < list.scrollTop + 40 || item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight)) list.scrollTo({ top: Math.max(0, item.offsetTop - list.clientHeight / 2 + item.offsetHeight / 2), behavior: 'smooth' });
  }, [selected]);
  useEffect(() => { const media = player.current; if (media) { media.muted = muted; media.playbackRate = rate; } }, [muted, rate]);
  const stopPlaybackMonitor = () => {
    if (playbackFrame.current !== null) cancelAnimationFrame(playbackFrame.current);
    playbackFrame.current = null;
  };
  const checkPlaybackRange = (media: HTMLVideoElement) => {
    const { start, end } = playbackRange.current;
    if (media.currentTime < start - .015) { media.currentTime = start; setPlayhead(start); }
    if (media.currentTime >= end - .015) {
      if (loopRef.current) { media.currentTime = start; setPlayhead(start); return false; }
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
      const upper = next[index].end - minimum;
      const at = round(clamp(value, 0, upper));
      next[index].start = at;
      return next;
    });
  };
  const moveShotEnd = (index: number, value: number) => {
    if (disabled || !Number.isFinite(value)) return;
    setDraft(current => current.map((item, i) => i === index ? { ...item, end: round(clamp(value, item.start + minimum, duration)) } : item));
  };
  const seek = (seconds: number) => {
    const at = clamp(seconds, 0, duration);
    setPlayhead(at);
    if (player.current) player.current.currentTime = at;
  };
  const indexAt = (at: number) => { const found = draft.findIndex(item => at >= item.start && at < item.end); return found >= 0 ? found : at >= draft[draft.length - 1].end ? draft.length - 1 : 0; };
  // Moving the playhead (ruler click/drag or the video's own scrubber) selects the shot under it.
  const seekAndSelect = (seconds: number) => { const at = clamp(seconds, 0, duration); seek(at); setSelected(indexAt(at)); };
  // Only explicit picks (click, wheel, prev/next) get the one-time border sweep; drag and playback-follow don't.
  const [sweepId, setSweepId] = useState<string | null>(null);
  const select = (index: number) => { player.current?.pause(); setSelected(index); setSweepId(draft[index].id); seek(draft[index].start); };
  const positionFromPointer = (event: { clientX: number }) => {
    const bounds = track.current!.getBoundingClientRect();
    return (event.clientX - bounds.left) / bounds.width * duration;
  };
  const onHandleDown = (event: PointerEvent<HTMLButtonElement>, index: number, edge: DragTarget['edge']) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    player.current?.pause();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = { index, edge };
    setDragEdge({ index, edge });
    setSelected(index);
  };
  const onHandleMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragging.current === null) return;
    const at = positionFromPointer(event);
    if (dragging.current.edge === 'start') moveStart(dragging.current.index, at);
    else moveShotEnd(dragging.current.index, at);
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
    <header className="shot-timeline-header"><div><span className="shot-timeline-kicker">视频拆解 / TIMELINE</span><div className="stl-title-row"><h2 id="shot-timeline-title">编辑镜头时间点</h2><span className="stl-tags"><em>{`${draft.length} 个镜头`}</em><em className="on">{`使用 ${usedCount} 个`}</em><em>{`共 ${draft.filter(item => !removed.has(item.id)).reduce((sum, item) => sum + item.end - item.start, 0).toFixed(3)} 秒 / 原片 ${duration.toFixed(3)} 秒`}</em></span></div></div><div className="stl-header-actions">{changed && <b className="stl-change-count" >{changeCount} 处未应用的修改</b>}{changed && <button className="btn" disabled={disabled || !changed} onClick={() => { setDraft(shots.map(shot => ({ ...shot }))); setRemoved(new Set(initialRemoved)); setSelected(clamp(selected, 0, shots.length - 1)); setContextMenu(null); setMergeError(''); }}><RotateCcw size={14} />重置</button>}<button className="btn primary" title="应用后将保存镜头，并重新提取受影响的片段与关键帧。" disabled={disabled || !changed} onClick={apply}><Check size={15} />应用时间点</button><button className="icon-btn" aria-label="关闭时间线编辑" onClick={onClose}><X size={19} /></button></div></header>
    <div className="stl-workbench" style={{ '--video-ratio': videoRatio, gridTemplateColumns: `${layout.list}px 7px minmax(0, 1fr) 7px ${layout.insp}px`, height: `${layout.top}px` } as CSSProperties}>
      <aside ref={shotList} className="stl-list" aria-label="镜头列表">
        <div className="stl-list-head"><span>镜头 <b>{usedCount} / {draft.length}</b></span><button type="button" className="stl-link" disabled={disabled || !removed.size} onClick={() => setRemoved(new Set())}>全选</button></div>
        {draft.map((item, index) => { const off = removed.has(item.id); return <div key={item.id} role="button" tabIndex={0} className={`stl-list-row${selected === index ? ' selected' : ''}${selected === index && sweepId === item.id ? ' sel-sweep' : ''}${off ? ' removed' : ''}`} onClick={() => select(index)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(index); } }}>
          <input type="checkbox" aria-label="使用此镜头" checked={!off} disabled={disabled || (!off && usedCount <= 1)} onClick={event => event.stopPropagation()} onChange={() => toggleRemoved(index)} />
          <b>{pad2(index + 1)}</b><ListThumb start={item.start} end={item.end} grab={grabFrame} />
          <span className="stl-list-text"><span className="stl-list-time"><span>{item.start.toFixed(3)}–{item.end.toFixed(3)}</span><small>{(item.end - item.start).toFixed(2)}s</small></span><small className="stl-list-role"><i className={`role-dot role-${item.role}`} />{roles[item.role]}{off && <span className="stl-list-off">已去除</span>}</small></span>
        </div>; })}
      </aside>
      <div className="stl-split-v" role="separator" aria-orientation="vertical" title="拖动调整宽度，双击恢复" onPointerDown={event => startResize(event, 'list')} onDoubleClick={() => resetResize('list')} />
      <div className="stl-stage" data-swap={swapDir.current}>
        <div ref={stageRef} className="stl-stage-video" title="滚轮切换上一个 / 下一个镜头">{video ? <video ref={player} src={video.url} poster={video.thumbnail} playsInline preload="metadata" onLoadedMetadata={event => { const media = event.currentTarget; if (media.videoWidth && media.videoHeight) setVideoRatio(media.videoWidth / media.videoHeight); media.currentTime = playhead; media.muted = muted; media.playbackRate = rate; }} onClick={event => { const media = event.currentTarget; if (media.paused) void media.play(); else media.pause(); }} onPlay={event => { setPlaying(true); onVideoPlay(event.currentTarget); }} onPause={() => { setPlaying(false); stopPlaybackMonitor(); }} onSeeked={event => { const media = event.currentTarget; if (media.paused && dragging.current === null && !scrubbing.current) { const index = indexAt(media.currentTime); setSelected(current => current === index ? current : index); } }} onTimeUpdate={event => { const media = event.currentTarget; if (!media.paused && checkPlaybackRange(media)) return; setPlayhead(media.currentTime); }} aria-label="原片时间线预览" /> : <div className="shot-timeline-no-video">示例镜头没有关联原片</div>}
          {sweepId === selectedShot.id && <i key={`flash-${selected}`} className="stl-swap-flash" aria-hidden="true" />}{wheelHint && draft.length > 1 && <div className="stl-wheel-hint" aria-hidden="true"><Mouse size={14} />滚动切换镜头</div>}<div key={`badges-${selected}`} className="stl-stage-badges" aria-hidden="true"><span><b>{pad2(selected + 1)}</b> · {roles[selectedShot.role]}</span><span>{selectedShot.start.toFixed(3)}–{selectedShot.end.toFixed(3)} s</span></div>
        </div>
        <div className="stl-stage-bar">
          <button type="button" className="stl-icon" title="上一个镜头" aria-label="上一个镜头" disabled={selected === 0} onClick={() => select(selected - 1)}><SkipBack size={15} /></button>
          <button type="button" className="stl-icon stl-play" title={playing ? '暂停' : '播放'} aria-label={playing ? '暂停' : '播放'} disabled={!video} onClick={() => { const media = player.current; if (!media) return; if (media.paused) void media.play(); else media.pause(); }}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
          <button type="button" className="stl-icon" title="下一个镜头" aria-label="下一个镜头" disabled={selected >= draft.length - 1} onClick={() => select(selected + 1)}><SkipForward size={15} /></button>
          <span className="stl-clock"><b>{clock(playhead)}</b> / {clock(duration)}</span>
          <input type="range" className="stl-progress" aria-label="原片进度" min={0} max={duration} step={0.01} value={playhead} style={{ '--pct': `${playhead / duration * 100}%` } as CSSProperties} onPointerDown={() => player.current?.pause()} onChange={event => seekAndSelect(Number(event.target.value))} />
          <button type="button" className={`stl-loop${loop ? ' on' : ''}`} aria-pressed={loop} onClick={() => setLoop(value => !value)}><Repeat size={13} />循环本镜</button>
          <button type="button" className="stl-rate" title="倍速" onClick={() => setRate(value => [1, 1.5, 2, .5][([1, 1.5, 2, .5].indexOf(value) + 1) % 4])}>{rate}×</button>
          <button type="button" className="stl-icon" title={muted ? '取消静音' : '静音'} aria-label={muted ? '取消静音' : '静音'} onClick={() => setMuted(value => !value)}>{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
          <button type="button" className="stl-icon" title="全屏" aria-label="全屏" disabled={!video} onClick={() => void player.current?.requestFullscreen()}><Maximize size={15} /></button>
        </div>
      </div>
      <div className="stl-split-v" role="separator" aria-orientation="vertical" title="拖动调整宽度，双击恢复" onPointerDown={event => startResize(event, 'insp')} onDoubleClick={() => resetResize('insp')} />
      <div className="stl-inspector" data-swap={swapDir.current} aria-label="镜头片段信息">
        <div className="stl-inspector-nav"><span>已选镜头 <b>{pad2(selected + 1)} / {pad2(draft.length)}</b></span><span><button type="button" className="stl-icon" title="上一个镜头" aria-label="上一个镜头" disabled={selected === 0} onClick={() => select(selected - 1)}><ChevronLeft size={15} /></button><button type="button" className="stl-icon" title="下一个镜头" aria-label="下一个镜头" disabled={selected >= draft.length - 1} onClick={() => select(selected + 1)}><ChevronRight size={15} /></button></span></div>
        <ShotDetailItem key={selectedShot.id} shot={selectedShot} number={selected + 1} total={draft.length} expanded selected removed={removed.has(selectedShot.id)} original={originalTimes.get(selectedShot.id)} grab={grabFrame} onSelect={() => undefined} onToggle={() => toggleRemoved(selected)} toggleDisabled={disabled || (!removed.has(selectedShot.id) && usedCount <= 1)} onFrameChange={disabled || removed.has(selectedShot.id) ? undefined : onFrameChange} frameRanges={[[selected ? draft[selected - 1].start + minimum : 0, selectedShot.end - minimum], [selectedShot.start, selectedShot.end], [selectedShot.start + minimum, duration]]}><div className="shot-timeline-fields stl-fields3"><label>起始点 <input type="number" min="0" max={duration} step="0.001" value={selectedShot.start} disabled={disabled || removed.has(selectedShot.id)} onChange={event => setShotStart(selected, Number(event.target.value))} /></label><label>结束点 <input type="number" min="0" max={duration} step="0.001" value={selectedShot.end} disabled={disabled || removed.has(selectedShot.id)} onChange={event => moveShotEnd(selected, Number(event.target.value))} /></label><label>片段时长 <input type="text" readOnly tabIndex={-1} value={(selectedShot.end - selectedShot.start).toFixed(3)} /></label></div><div className="stl-actions"><button className="btn small" disabled={!video} onClick={() => { seek(selectedShot.start); void player.current?.play(); }}><Play size={13} />播放此镜头</button><button className="btn small stl-ghost" disabled={disabled || removed.has(selectedShot.id) || draft.length >= 120 || !(playhead > selectedShot.start + .1 && playhead < selectedShot.end - .1)} title="在当前播放头位置把这个镜头拆成两段" onClick={() => splitAt(selected, playhead)}><Scissors size={13} />在播放头拆分</button></div></ShotDetailItem>
      </div>
    </div>
    <div className="stl-split-h" role="separator" aria-orientation="horizontal" title="拖动调整高度，双击恢复" onPointerDown={event => startResize(event, 'top')} onDoubleClick={() => resetResize('top')} />
    <section className="shot-timeline-section" aria-label="可编辑镜头时间线"><div className="shot-timeline-section-heading"><div><strong>镜头时间线</strong><span>{`${draft.length} 个镜头 · 使用 ${usedCount} 个 · 共 ${draft.filter(item => !removed.has(item.id)).reduce((sum, item) => sum + item.end - item.start, 0).toFixed(3)} 秒`}</span></div><span>右键片段拆分 / 去除 · 右键分界线合并 · 滚轮切换镜头</span></div><div ref={timelineScroll} className="shot-timeline-scroll"><div className="shot-timeline-canvas" style={{ minWidth: `${Math.max(720, duration * 30)}px` }}>
      <div className="shot-timeline-ruler" onPointerDown={event => { if (event.button !== 0) return; player.current?.pause(); scrubbing.current = true; event.currentTarget.setPointerCapture(event.pointerId); seekAndSelect(positionFromPointer(event)); }} onPointerMove={event => { if (scrubbing.current) seekAndSelect(positionFromPointer(event)); }} onPointerUp={() => { scrubbing.current = false; }} onPointerCancel={() => { scrubbing.current = false; }}>{ticks.map(time => <span key={time} style={{ left: `${time / duration * 100}%` }}>{time.toFixed(duration < 1 ? 2 : time < 10 ? 1 : 0)}s</span>)}</div>
      <div ref={track} className="shot-timeline-track">
        {draft.map((item, index) => removed.has(item.id) ? null : <button key={item.id} type="button" className={`shot-timeline-clip ${selected === index ? 'selected' : ''}${selected === index && sweepId === item.id && dragEdge === null ? ' sel-sweep' : ''}`} style={{ left: `${item.start / duration * 100}%`, width: `${(item.end - item.start) / duration * 100}%` }} onClick={() => select(index)} onContextMenu={event => { event.preventDefault(); if (disabled) return; player.current?.pause(); const at = round(clamp(positionFromPointer(event), item.start, item.end)); setSelected(index); seek(at); setMergeError(''); setContextMenu({ kind: 'clip', index, at, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 240)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 185)) }); }} title={`镜头 ${index + 1} · ${item.start.toFixed(3)}–${item.end.toFixed(3)} 秒 · 右键编辑`}><ClipThumbs start={item.start} end={item.end} grab={grabFrame} /><span className="stl-clip-label"><b>{String(index + 1).padStart(2, '0')}</b><small><i className={`role-dot role-${item.role}`} />{roles[item.role]}</small></span><em className="stl-clip-dur">{(item.end - item.start).toFixed(2)}s</em></button>)}
        {dragEdge && (() => { const item = draft[dragEdge.index]; const at = dragEdge.edge === 'start' ? item.start : item.end; return <div className="stl-drag-guide" style={{ left: `${at / duration * 100}%` }} aria-hidden="true"><span className="stl-drag-bubble"><b>{at.toFixed(3)} s</b>镜头 {pad2(dragEdge.index + 1)} {dragEdge.edge === 'start' ? '首帧' : '尾帧'}</span></div>; })()}
        <div className="shot-timeline-playhead" style={{ left: `${playhead / duration * 100}%` }} aria-hidden="true" />
        {draft.map((item, index) => <Fragment key={`edges-${item.id}`}>
          <button type="button" className={`shot-timeline-handle start-edge${selected === index ? ' sel' : ''}`} style={{ left: `${item.start / duration * 100}%` }} disabled={disabled || removed.has(item.id)} aria-label={`镜头 ${index + 1} 左边界 / 首帧 ${item.start.toFixed(3)} 秒`} title={`镜头 ${index + 1} 首帧`} onPointerDown={event => onHandleDown(event, index, 'start')} onPointerMove={onHandleMove} onPointerUp={endHandleDrag} onPointerCancel={endHandleDrag} onContextMenu={event => { if (!index) return; event.preventDefault(); if (disabled) return; setMergeError(''); setContextMenu({ kind: 'boundary', rightIndex: index, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 240)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 115)) }); }} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); moveStart(index, item.start + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? .1 : .01)); } }} />
          <button type="button" className={`shot-timeline-handle end-edge${selected === index ? ' sel' : ''}`} style={{ left: `${item.end / duration * 100}%` }} disabled={disabled || removed.has(item.id)} aria-label={`镜头 ${index + 1} 右边界 / 尾帧 ${item.end.toFixed(3)} 秒`} title={`镜头 ${index + 1} 尾帧`} onPointerDown={event => onHandleDown(event, index, 'end')} onPointerMove={onHandleMove} onPointerUp={endHandleDrag} onPointerCancel={endHandleDrag} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); moveShotEnd(index, item.end + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? .1 : .01)); } }} />
        </Fragment>)}
      </div>
      <div className="shot-timeline-removed-track" aria-label="已去除的镜头">{removed.size ? draft.map((item, index) => removed.has(item.id) ? <button key={`removed-${item.id}`} type="button" className={`shot-timeline-clip removed ${selected === index ? 'selected' : ''}`} style={{ left: `${item.start / duration * 100}%`, width: `${(item.end - item.start) / duration * 100}%` }} onClick={() => select(index)} onContextMenu={event => { event.preventDefault(); if (disabled) return; player.current?.pause(); const at = round(clamp(positionFromPointer(event), item.start, item.end)); setSelected(index); seek(at); setMergeError(''); setContextMenu({ kind: 'clip', index, at, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 240)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 185)) }); }} title={`镜头 ${index + 1} · 已去除 · 右键恢复`}><ClipThumbs start={item.start} end={item.end} grab={grabFrame} /><span className="stl-clip-label"><b>{String(index + 1).padStart(2, '0')}</b><small>已去除</small></span><span role="button" tabIndex={0} className="stl-restore" onClick={event => { event.stopPropagation(); toggleRemoved(index); }} onKeyDown={event => { if (event.key === 'Enter') { event.stopPropagation(); toggleRemoved(index); } }}>恢复</span></button> : null) : <span className="shot-timeline-removed-empty">右键片段选择「去除此镜头」，它会移到这里，不再用于后续生成</span>}</div><div className="shot-timeline-scale"><span>00:00</span><span>{duration.toFixed(3)}s</span></div>
    </div></div></section>
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
