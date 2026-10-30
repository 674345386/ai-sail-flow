import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { GeneratedVideo, Project } from '../shared/domain';
import { gridVideoState } from './StoryboardGridWorkbench';

type Clip = { video: GeneratedVideo; label: string; start: number; duration: number };
function time(value: number) { const seconds = Math.max(0, Math.floor(value)); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }

export default function CanvasTimeline({ project }: { project: Project }) {
  const clips = useMemo<Clip[]>(() => {
    const videos: { video: GeneratedVideo; label: string }[] = project.breakdownType === 'storyboard-grid'
      ? (project.storyboardGrids || []).flatMap((grid, index) => {
        const video = grid.included !== false ? gridVideoState(project, grid).completed.at(-1) : undefined;
        return video?.url && video.duration > 0 ? [{ video, label: `网格 ${String(index + 1).padStart(2, '0')}` }] : [];
      })
      : (project.analysis?.shots || []).flatMap((shot, index) => {
        const video = project.generatedVideos.filter(item => (item.tierShotId === shot.id || item.sourceShotIds?.includes(shot.id)) && item.status === 'completed' && item.url && !item.stale).at(-1);
        return video?.url && video.duration > 0 ? [{ video, label: `镜头 ${String(index + 1).padStart(2, '0')}` }] : [];
      });
    let start = 0;
    return videos.map(item => { const clip = { ...item, start, duration: item.video.duration }; start += clip.duration; return clip; });
  }, [project]);
  const total = clips.reduce((sum, clip) => sum + clip.duration, 0);
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pending = useRef<{ offset: number; play: boolean } | null>(null);
  const active = clips[index];
  const tickInterval = Math.max(2, Math.ceil(total / 12 / 2) * 2);
  const ticks = Array.from({ length: Math.floor(total / tickInterval) + 1 }, (_, i) => i * tickInterval);
  useEffect(() => { if (index >= clips.length) { setIndex(0); setElapsed(0); setPlaying(false); } }, [clips.length, index]);
  const seek = (position: number, play = playing) => {
    if (!clips.length) return;
    const bounded = Math.max(0, Math.min(position, Math.max(0, total - .001)));
    const next = Math.max(0, clips.findIndex((clip, i) => bounded < clip.start + clip.duration || i === clips.length - 1));
    const offset = bounded - clips[next].start;
    setElapsed(bounded);
    if (next === index && videoRef.current) {
      videoRef.current.currentTime = offset;
      if (play) void videoRef.current.play().catch(() => setPlaying(false));
      else videoRef.current.pause();
    } else { pending.current = { offset, play }; setIndex(next); setPlaying(play); }
  };
  const toggle = () => {
    const video = videoRef.current; if (!video) return;
    if (video.ended && index === clips.length - 1) { seek(0, true); return; }
    if (video.paused) void video.play().catch(() => setPlaying(false)); else video.pause();
  };
  return <div className="canvas-timeline nodrag nopan nowheel">
    <div className="canvas-timeline-preview">{active ? <video key={active.video.id} ref={videoRef} src={active.video.url} poster={active.video.thumbnail} playsInline controls
      onLoadedMetadata={event => { const next = pending.current; if (next) { pending.current = null; event.currentTarget.currentTime = Math.min(next.offset, Math.max(0, event.currentTarget.duration - .001)); if (next.play) void event.currentTarget.play().catch(() => setPlaying(false)); } }}
      onTimeUpdate={event => setElapsed(active.start + event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onEnded={() => { if (index + 1 < clips.length) { pending.current = { offset: 0, play: true }; setIndex(index + 1); } else { setPlaying(false); setElapsed(total); } }} />
      : <div className="canvas-timeline-empty">生成视频后，片段会按顺序显示在时间轴上</div>}</div>
    <div className="canvas-timeline-controls"><button type="button" disabled={!clips.length} onClick={() => seek(index > 0 ? clips[index - 1].start : 0)} aria-label="上一片段"><SkipBack size={15} /></button><button type="button" className="canvas-timeline-play" disabled={!clips.length} onClick={toggle} aria-label={playing ? '暂停' : '播放'}>{playing ? <Pause size={15} /> : <Play size={15} />}</button><button type="button" disabled={index >= clips.length - 1} onClick={() => seek(clips[index + 1].start)} aria-label="下一片段"><SkipForward size={15} /></button><span>{time(elapsed)} / {time(total)}</span></div>
    {clips.length > 0 && <div className="canvas-timeline-track" role="group" aria-label="视频片段时间轴"><div className="canvas-timeline-ruler">{ticks.map(tick => <span key={tick} style={{ left: `${tick / total * 100}%` }}>{time(tick)}</span>)}</div><div className="canvas-timeline-clips">{clips.map((clip, i) => <button type="button" key={clip.video.id} className={`canvas-timeline-clip${i === index ? ' is-active' : ''}`} style={{ flex: clip.duration, backgroundImage: clip.video.thumbnail ? `linear-gradient(0deg, rgba(0,0,0,.38), transparent), url("${clip.video.thumbnail}")` : undefined }} title={`${clip.label} · ${clip.duration.toFixed(1)} 秒`} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); seek(clip.start + clip.duration * (event.clientX - rect.left) / rect.width); }}><span>{clip.label}</span></button>)}<i className="canvas-timeline-playhead" style={{ left: `${Math.min(100, elapsed / total * 100)}%` }} /></div></div>}
  </div>;
}
