import { useEffect, useRef, useState } from 'react';
import { Download, Film, ImagePlus, LoaderCircle, Play, RotateCcw } from 'lucide-react';
import type { Project, Shot } from '../shared/domain';
import { shotEvidenceFrames, type ShotMedia } from '../shared/shot-evidence';
import { loadSourceClip, loadSourceFrames } from './ShotBreakdown';

const frameLabels = { first: '首帧', middle: '中间关键帧', last: '尾帧' };
function useSourceFrames(project: Project, shot: Shot) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const reference = project.assets.find(asset => asset.kind === 'video');
  const key = JSON.stringify([project.id, reference?.id, shot.start, shot.end, shot.evidenceFrames]);
  const [result, setResult] = useState<{ key: string; media?: ShotMedia; error?: string }>();
  useEffect(() => {
    if (!container.current) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '150px' });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !reference) return;
    let active = true;
    setResult({ key });
    void loadSourceFrames(project, shot).then(media => {
      if (active) setResult({ key, media });
    }, error => {
      if (active) setResult({ key, error: error instanceof Error ? error.message : '提取关键帧失败' });
    });
    return () => { active = false; };
  }, [key, visible, attempt]);
  return { container, key, reference, media: result?.key === key ? result.media : undefined, error: result?.key === key ? result.error : undefined, retry: () => setAttempt(previous => previous + 1) };
}

export function RemixShotClip({ project, shot, index }: { project: Project; shot: Shot; index: number }) {
  const { container, key, reference, media, error: frameError, retry } = useSourceFrames(project, shot);
  const [result, setResult] = useState<{ key: string; clip?: ShotMedia; intent: 'play' | 'download'; error?: string }>();
  const currentKey = useRef(key);
  currentKey.current = key;
  const clip = result?.key === key ? result.clip : undefined;
  const preparing = result?.key === key && !result.clip && !result.error;
  const error = result?.key === key ? result.error : undefined;
  const poster = media?.frames[0]?.previewUrl || media?.frames[0]?.url;
  const prepare = async (intent: 'play' | 'download') => {
    if (preparing || !reference) return;
    setResult({ key, intent, clip });
    try {
      const loaded = clip || await loadSourceClip(project, shot);
      if (currentKey.current !== key) return;
      setResult({ key, intent, clip: loaded });
      if (intent === 'download') {
        const anchor = document.createElement('a');
        anchor.href = loaded.clipUrl; anchor.download = `shot-${index + 1}.mp4`;
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
      }
    } catch (error) {
      if (currentKey.current === key) setResult({ key, intent, error: error instanceof Error ? error.message : '提取镜头片段失败' });
    }
  };
  return <div ref={container} className="remix-shot-media">
    <div className="remix-shot-video">
      {clip ? <video key={clip.key} src={clip.clipUrl} poster={poster} controls playsInline preload="none" autoPlay={result?.intent === 'play'} aria-label={`原片镜头片段 ${index + 1}`} onPlay={event => { event.currentTarget.closest('.remix-stage')?.querySelectorAll('video').forEach(video => { if (video !== event.currentTarget) video.pause(); }); }} />
        : <button disabled={preparing || !reference} onClick={() => void prepare('play')} aria-label={`播放原片镜头片段 ${index + 1}`}>
          {poster ? <img src={poster} alt="" /> : <Film size={28} />}
          <span>{preparing ? <><LoaderCircle size={15} className="spin" />准备片段…</> : <><Play size={15} />播放镜头片段</>}</span>
        </button>}
    </div>
    <div className="remix-shot-caption"><div><strong>{shot.start.toFixed(2)}–{shot.end.toFixed(2)}s</strong><span>{(shot.end - shot.start).toFixed(2)} 秒{reference?.hasAudio ? ' · 保留原声' : ''}</span></div><button className="remix-icon-button" disabled={preparing || !reference} title="下载镜头片段" aria-label={`下载镜头片段 ${index + 1}`} onClick={() => void prepare('download')}><Download size={14} /></button></div>
    <p className="remix-shot-description" title={shot.visual}>{shot.visual || '原片镜头片段'}</p>
    {!reference && <p className="remix-warning">当前创意未关联原视频。</p>}
    {(error || frameError) && <div className="remix-shot-error" role="alert"><span>{error || frameError}</span><button className="remix-button" onClick={() => { if (error) void prepare('play'); else retry(); }}><RotateCcw size={12} />重试</button></div>}
  </div>;
}

export function RemixShotFrames({ project, shot }: { project: Project; shot: Shot }) {
  const { container, reference, media, error, retry } = useSourceFrames(project, shot);
  const frames = shotEvidenceFrames(shot);
  return <div ref={container} className="remix-shot-frames">
    {frames.map(slot => {
      const frame = media?.frames.find(item => item.position === slot.position);
      return <figure key={slot.position}>
        {frame ? <a className="remix-frame-image" href={frame.url} target="_blank" rel="noreferrer" title="打开完整关键帧"><img src={frame.previewUrl || frame.url} alt={`${frameLabels[slot.position]} · ${frame.at.toFixed(3)} 秒：${frame.reason}`} decoding="async" /></a>
          : <div className="remix-frame-image remix-frame-placeholder">{!reference || error ? <ImagePlus size={24} /> : <LoaderCircle size={20} className="spin" />}<span>{!reference ? '未关联原片' : error ? '提取失败' : '等待提取关键帧'}</span></div>}
        <figcaption><div><strong>{frameLabels[slot.position]}</strong><span>{(frame?.at ?? slot.at).toFixed(3)}s</span>{frame && <a className="remix-icon-button" href={frame.url} download title="下载关键帧" aria-label={`下载${frameLabels[slot.position]}`}><Download size={12} /></a>}</div><p title={frame?.reason || slot.reason}>{frame?.reason || slot.reason}</p><small>{(frame?.selection || slot.selection) === 'model' ? 'AI 分析选帧 · 原片截取' : '按镜头时间截取'}</small></figcaption>
      </figure>;
    })}
    {error && <div className="remix-shot-error" role="alert"><span>{error}</span><button className="remix-button" onClick={retry}><RotateCcw size={12} />重新提取</button></div>}
  </div>;
}
