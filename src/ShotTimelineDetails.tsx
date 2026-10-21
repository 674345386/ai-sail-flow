import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { roles, type Shot } from '../shared/domain';

/* Grabs frames from the source video in the browser (hidden <video> + canvas), so the keyframe
   thumbnails follow boundary drags live without a server round-trip. Requests are serialised. */
export function useFrameGrabber(url?: string) {
  const grabber = useRef<{ video: HTMLVideoElement; cache: Map<string, string>; chain: Promise<unknown> } | null>(null);
  const source = useRef(url);
  source.current = url;
  // Created lazily on the first grab: child components' effects run before this hook's effect, so an eager setup missed their first requests.
  const ensure = useCallback(() => {
    if (!grabber.current && source.current) {
      const video = document.createElement('video');
      video.muted = true; video.preload = 'auto'; video.playsInline = true; video.src = source.current;
      grabber.current = { video, cache: new Map(), chain: Promise.resolve() };
    }
    return grabber.current;
  }, []);
  useEffect(() => () => { const current = grabber.current; if (current) { current.video.removeAttribute('src'); current.video.load(); } grabber.current = null; }, [url]);
  return useCallback((at: number): Promise<string | undefined> => {
    const current = ensure();
    if (!current) return Promise.resolve(undefined);
    const key = at.toFixed(2);
    const hit = current.cache.get(key);
    if (hit) return Promise.resolve(hit);
    const run = async () => {
      const { video, cache } = current;
      if (video.readyState < 1) await new Promise(resolve => { video.addEventListener('loadedmetadata', resolve, { once: true }); setTimeout(resolve, 8000); });
      const target = Math.min(Math.max(0, at), Math.max(0, (video.duration || at) - .03));
      if (Math.abs(video.currentTime - target) > .001 || video.readyState < 2) {
        await new Promise<void>(resolve => { video.addEventListener('seeked', () => resolve(), { once: true }); setTimeout(resolve, 3000); video.currentTime = target; });
      }
      if (!video.videoWidth) return undefined;
      const width = 320, height = Math.round(width * video.videoHeight / video.videoWidth);
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.drawImage(video, 0, 0, width, height);
      const data = canvas.toDataURL('image/jpeg', .72);
      if (cache.size >= 300) cache.delete(cache.keys().next().value!);
      cache.set(key, data);
      return data;
    };
    const pending = current.chain.then(run, run);
    current.chain = pending.catch(() => undefined);
    return pending.catch(() => undefined);
  }, [ensure, url]);
}

const frameLabels = ['首帧', '中间关键帧', '尾帧'];
export const MANUAL_KEYFRAME = '手动选择的中间关键帧';
/* The middle keyframe: a manual pick (kept while inside the range), else Gemini's pick for an untouched range, else the midpoint. */
export function shotMiddle(shot: Shot, original?: { start: number; end: number }) {
  const retimed = !original || Math.abs(original.start - shot.start) > .0005 || Math.abs(original.end - shot.end) > .0005;
  const pick = shot.evidenceFrames?.[1];
  const inside = pick !== undefined && pick.at > shot.start && pick.at < shot.end;
  return inside && (!retimed || pick.reason === MANUAL_KEYFRAME) ? pick.at : (shot.start + shot.end) / 2;
}

/* Film-strip thumbnails inside a timeline block: a few frames spread across the shot, refreshed (throttled) while it is retimed. */
export function ClipThumbs({ start, end, grab }: { start: number; end: number; grab: (at: number) => Promise<string | undefined> }) {
  const count = Math.max(1, Math.min(6, Math.round((end - start) / 1.6)));
  const [frames, setFrames] = useState<(string | undefined)[]>([]);
  const last = useRef(0);
  useEffect(() => {
    let active = true;
    // Snap strip frames to a 0.5s grid so they are shared from the cache across drags; only the panel's first/last frames use exact times.
    const times = Array.from({ length: count }, (_, index) => Math.min(end - .02, Math.max(start, Math.round((start + (end - start) * (index + .5) / count) * 2) / 2)));
    const timer = window.setTimeout(() => { last.current = performance.now(); void Promise.all(times.map(grab)).then(result => { if (active) setFrames(result); }); }, Math.max(0, 80 - (performance.now() - last.current)));
    return () => { active = false; window.clearTimeout(timer); };
  }, [start, end, count, grab]);
  return <span className="stl-clip-thumbs" aria-hidden="true">{Array.from({ length: count }, (_, index) => frames[index] ? <img key={index} src={frames[index]} alt="" /> : <i key={index} />)}</span>;
}
const pad = (n: number) => String(n).padStart(2, '0');

export function ShotDetailItem({ shot, original, number, expanded, half = false, liveEnd = false, total, selected, removed, grab, onSelect, onToggle, toggleDisabled, onFrameChange, frameRanges, children }: {
  shot: Shot; original?: { start: number; end: number }; number: number; expanded: boolean; half?: boolean; liveEnd?: boolean; total?: number; selected: boolean; removed: boolean;
  grab: (at: number) => Promise<string | undefined>; onSelect: () => void; onToggle: () => void; toggleDisabled: boolean; children?: ReactNode;
  /** Set a frame's time (0 first = start, 1 middle keyframe, 2 last = end); used by wheel and scrub-knob drag. */ onFrameChange?: (index: number, at: number) => void;
  /** Allowed [min, max] for each frame, drawn as the hover scrub line. */ frameRanges?: [number, number][];
}) {
  // Gemini picked the middle keyframe for the original range; once the range changes we show the midpoint (unless picked by hand).
  const retimed = !original || Math.abs(original.start - shot.start) > .0005 || Math.abs(original.end - shot.end) > .0005;
  const middle = shotMiddle(shot, original);
  const times = [shot.start, middle, Math.max(shot.start, shot.end - .04)];
  const values = [shot.start, middle, shot.end];
  // Wheel over a frame moves it 0.1s; the scrub knob can be dragged. Both go through onFrameChange (same clamping as boundary drags).
  const framesRef = useRef<HTMLDivElement>(null);
  const live = useRef({ onFrameChange, values, frameRanges }); live.current = { onFrameChange, values, frameRanges };
  const [bubble, setBubble] = useState<number | null>(null);
  const bubbleTimer = useRef<number | undefined>(undefined);
  const flash = (index: number, hold = false) => { window.clearTimeout(bubbleTimer.current); setBubble(index); if (!hold) bubbleTimer.current = window.setTimeout(() => setBubble(null), 800); };
  useEffect(() => {
    const element = framesRef.current; if (!element || !expanded) return;
    let acc = 0;
    const onWheel = (event: WheelEvent) => {
      const figure = (event.target as HTMLElement).closest('figure'); const { onFrameChange: change, values: current } = live.current;
      if (!figure || !change || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      event.preventDefault();
      acc += event.deltaY; if (Math.abs(acc) < 25) return;
      const index = Array.from(element.children).indexOf(figure);
      change(index, current[index] + (acc > 0 ? .1 : -.1)); acc = 0; flash(index);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [expanded]);
  useEffect(() => () => window.clearTimeout(bubbleTimer.current), []);
  const dragTo = (event: PointerEvent<HTMLDivElement>, index: number) => {
    const range = live.current.frameRanges?.[index]; const change = live.current.onFrameChange; if (!range || !change) return;
    const rect = event.currentTarget.getBoundingClientRect(); const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left - 8) / Math.max(1, rect.width - 16)));
    change(index, range[0] + ratio * (range[1] - range[0]));
  };
  const [frames, setFrames] = useState<(string | undefined)[]>([]);
  const lastGrab = useRef(0);
  useEffect(() => {
    let active = true;
    // While the boundary after this row is dragged, its thumbnail shows the live last frame instead of the first.
    const wanted = expanded ? times : [liveEnd ? times[2] : times[0]];
    // Throttled to one refresh every ~80ms while a boundary is dragged; collapsed rows only need a small first-frame thumbnail.
    const delay = expanded || liveEnd ? Math.max(0, 80 - (performance.now() - lastGrab.current)) : 250;
    const timer = window.setTimeout(() => { lastGrab.current = performance.now(); void Promise.all(wanted.map(grab)).then(result => { if (active) setFrames(current => expanded ? result : [result[0], current[1], current[2]]); }); }, delay);
    return () => { active = false; window.clearTimeout(timer); };
  }, [expanded, liveEnd, shot.start, shot.end, middle, grab]);
  const toggle = <input type="checkbox" className="stl-use" title="使用此镜头" aria-label="使用此镜头" checked={!removed} disabled={toggleDisabled} onClick={event => event.stopPropagation()} onChange={onToggle} />;
  const range = `${shot.start.toFixed(3)}–${shot.end.toFixed(3)} 秒 · ${(shot.end - shot.start).toFixed(3)} 秒`;
  const restore = removed && <button type="button" className="stl-restore" disabled={toggleDisabled} onClick={event => { event.stopPropagation(); onToggle(); }}>恢复</button>;
  if (!expanded) return <div role="button" tabIndex={0} className={`stl-item collapsed${half ? ' half' : ''}${removed ? ' removed' : ''}`} onClick={onSelect} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(); } }}>
    {toggle}<b>{pad(number)}</b>{frames[0] ? <img className={`stl-thumb${liveEnd ? ' live' : ''}`} src={frames[0]} alt="" title={liveEnd ? '实时尾帧' : undefined} /> : <span className="stl-thumb" />}
    <span className="stl-row-text">{half && <span className="stl-row-title">镜头片段 {pad(number)}</span>}<small>{range}</small>{half && <span className="stl-summary" title={shot.visual}>{shot.visual || '未记录'}</span>}
      {half && <span className="stl-row-meta">{shot.camera && <span title={shot.camera}><i>运镜</i>{shot.camera}</span>}{shot.transition && <span title={shot.transition}><i>转场</i>{shot.transition}</span>}</span>}
      {!half && <span className="stl-summary" title={shot.visual}>{shot.visual}</span>}</span>
    <em className="badge">{removed ? '已去除' : roles[shot.role]}</em>{restore}
  </div>;
  return <article className={`stl-item expanded${selected ? ' selected' : ''}${removed ? ' removed' : ''}`}>
    <header onClick={onSelect}><strong>镜头片段 {pad(number)}<span className="stl-title-dur"> · {(shot.end - shot.start).toFixed(3)}s</span></strong>{total && <small>{pad(number)} / {total}</small>}<em className="badge"><i className={`role-dot role-${shot.role}`} />{roles[shot.role]}</em><label className="stl-use-label" onClick={event => event.stopPropagation()}>{toggle}使用此镜头</label><small>{range}</small>{selected && <em className="badge stl-current">当前选中</em>}{removed && <em className="badge">已去除</em>}{restore}</header>
    <div className="stl-card-body">
      <div ref={framesRef} className={`stl-frames${onFrameChange ? ' wheelable' : ''}`}>{frameLabels.map((label, index) => <figure key={label}>
        <span className="stl-frame-media">{frames[index] ? <img src={frames[index]} alt={`${label} · ${times[index].toFixed(3)} 秒`} /> : <div className="stl-frame-placeholder" />}{onFrameChange && frameRanges?.[index] && (() => { const [lo, hi] = frameRanges[index]; const value = values[index]; const pct = hi > lo ? Math.min(100, Math.max(0, (value - lo) / (hi - lo) * 100)) : 50; return <div className={`stl-scrub${bubble === index ? ' active' : ''}`} onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); flash(index, true); dragTo(event, index); }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) dragTo(event, index); }} onPointerUp={() => flash(index)} onPointerCancel={() => flash(index)}><i className="stl-scrub-line"><i className="stl-scrub-fill" style={{ width: `${pct}%` }} /><i className="stl-scrub-knob" style={{ left: `${pct}%` }}><em>{value.toFixed(3)}s</em></i></i></div>; })()}</span>
        <figcaption><b>{label}</b><span>{times[index].toFixed(3)}s</span></figcaption>
        {index === 1 && retimed && shot.evidenceFrames?.[1]?.reason !== MANUAL_KEYFRAME && <small className="stl-reanalyze">待重新分析</small>}
      </figure>)}</div>
      <dl className="stl-observations">
        {([['画面与场景', shot.visual], ['主体与外观', shot.subject], ['主体动作', shot.action], ['运镜 / 镜头语言', shot.camera], ['动效 / 合成', shot.effects], ['转场 / 分段依据', shot.transition], ['声音 / 口播', [shot.sound, shot.narration].filter(Boolean).join(' · ')], ...(shot.uncertainty ? [['待核对', shot.uncertainty]] : [])] as [string, string | undefined][])
          .slice(0, selected ? undefined : 1).map(([label, value]) => <div key={label}><dt>{label}</dt><dd title={value}>{value || '未记录'}</dd></div>)}
      </dl>
      {selected && children && <div className="stl-controls">{children}</div>}
    </div>
  </article>;
}
