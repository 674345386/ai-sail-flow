import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Pause, Play, ShieldCheck } from 'lucide-react';
import type { WorkflowMode } from '../shared/domain';
import { useReducedMotion } from './useReducedMotion';
import { useDecorativeMedia } from './useDecorativeMedia';
import heroVideo from './assets/landing/commerce-hero-reference.mp4';
import poster from './assets/landing/commerce-hero-reference-poster.jpg';

export default function LandingHero({ authRequired, onEnter }: {
  authRequired: boolean;
  onEnter: (mode: WorkflowMode) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reducedMotion = useReducedMotion();
  const decorativeReady = useDecorativeMedia();
  const [requestedPlayback, setRequestedPlayback] = useState(false);
  const enabled = decorativeReady || requestedPlayback;
  const [paused, setPaused] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let visible = true;
    const syncPlayback = () => {
      if (!enabled || paused || reducedMotion || document.hidden || !visible) video.pause();
      else void video.play().catch(() => setPlaying(false));
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncPlayback();
    }, { threshold: 0.1 });
    observer.observe(video);
    document.addEventListener('visibilitychange', syncPlayback);
    syncPlayback();
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', syncPlayback);
      video.pause();
    };
  }, [paused, reducedMotion, failed, enabled]);

  useEffect(() => {
    const video = videoRef.current;
    return () => { if (video) { video.pause(); video.removeAttribute('src'); video.load(); } };
  }, []);

  const togglePlayback = () => {
    if (playing) setPaused(true);
    else {
      setRequestedPlayback(true);
      setPaused(false);
      // Keep the play attempt inside the click for browsers requiring a gesture.
      void videoRef.current?.play().catch(() => setPlaying(false));
    }
  };

  return <main className="commerce-hero" id="overview">
    <section className="commerce-hero-stage" aria-labelledby="commerce-hero-title">
      <div className="commerce-hero-media" aria-hidden="true">
        <img src={poster} alt="" fetchPriority="high" />
        {!reducedMotion && !failed && <video
          ref={videoRef}
          src={enabled ? heroVideo : undefined}
          poster={poster}
          autoPlay={enabled}
          muted
          loop
          playsInline
          preload="none"
          tabIndex={-1}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => { setFailed(true); setPlaying(false); }}
        />}
      </div>
      <div className="commerce-hero-scrim" aria-hidden="true" />
      <div className="commerce-hero-copy">
        <span className="commerce-hero-kicker">为电商出海而创作</span>
        <h1 id="commerce-hero-title">AI-Sail Flow</h1>
        <p>您的专属 AI 出海创意视频工作室，<br className="commerce-hero-linebreak" />从真实视频与市场洞察出发，让好创意走向全球。</p>
        <div className="commerce-hero-actions">
          <button className="commerce-hero-primary" onClick={() => onEnter('automatic')}>自动制作视频<ArrowRight size={17} /></button>
          <button className="commerce-hero-secondary" onClick={() => onEnter('manual')}>进入 AI-Sail Flow 制作<ArrowRight size={17} /></button>
        </div>
        {authRequired && <small className="commerce-hero-note"><ShieldCheck size={13} />邮箱验证后即可访问 · 登录用户共用工作区</small>}
      </div>
      {!reducedMotion && !failed && <button
        className="commerce-hero-playback"
        onClick={togglePlayback}
        aria-label={playing ? '暂停背景动画' : '播放背景动画'}
        title={playing ? '暂停背景动画' : '播放背景动画'}
      >{playing ? <Pause size={15} /> : <Play size={15} />}</button>}
    </section>
  </main>;
}
