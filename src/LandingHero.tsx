import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Pause, Play, ShieldCheck } from 'lucide-react';
import type { WorkflowMode } from '../shared/domain';
import { useReducedMotion } from './useReducedMotion';
import { useDecorativeMedia } from './useDecorativeMedia';
import heroVideo from './assets/landing/commerce-hero-reference.mp4';
import poster from './assets/landing/commerce-hero-reference-poster.jpg';
import { useDict } from './i18n';
import { LANDING } from './landing-i18n';
import './landing-hero-variants.css';

type HeroVariant = 'default' | 'a' | 'b' | 'c';
/** Design comparison switch: ?hero=a|b|c (default keeps the current hero). */
function heroVariant(): HeroVariant {
  if (typeof window === 'undefined') return 'default';
  const v = new URLSearchParams(window.location.search).get('hero');
  return v === 'a' || v === 'b' || v === 'c' ? v : 'default';
}

/** Cycles through words; static (first word) under reduced motion. */
function Rotator({ words, reduced, interval = 2600 }: { words: string[]; reduced: boolean; interval?: number }) {
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); if (reduced || words.length < 2) return; const id = window.setInterval(() => setIndex(i => (i + 1) % words.length), interval); return () => window.clearInterval(id); }, [words, reduced, interval]);
  return <span className="hx-rotator" aria-live="off">
    <span className="hx-rotator-sizer" aria-hidden="true">{words.reduce((a, b) => (b.length > a.length ? b : a), '')}</span>
    {words.map((word, i) => <span key={word} className={`hx-rotator-word${i === index ? ' is-active' : ''}`} aria-hidden={i !== index}>{word}</span>)}
  </span>;
}

/** Splits a line into word (EN) or character (CJK) spans for a staggered reveal. */
function Kinetic({ text, start = 0 }: { text: string; start?: number }) {
  const parts = /\s/.test(text) ? text.split(/(\s+)/) : Array.from(text);
  let n = start;
  return <>{parts.map((part, i) => /^\s+$/.test(part) ? part : <span key={i} className="hx-k" style={{ animationDelay: `${(n++) * 55}ms` }}>{part}</span>)}</>;
}

export default function LandingHero({ authRequired, onEnter }: {
  authRequired: boolean;
  onEnter: (mode: WorkflowMode) => void;
}) {
  const landing = useDict(LANDING);
  const t = landing.hero;
  const alt = landing.heroAlt;
  const [variant] = useState(heroVariant);
  const stageRef = useRef<HTMLElement>(null);
  // Variant C: soft spotlight follows the pointer (skipped under reduced motion).
  useEffect(() => {
    const stage = stageRef.current;
    if (variant !== 'c' || reducedMotion || !stage) return;
    const move = (e: PointerEvent) => { const r = stage.getBoundingClientRect(); stage.style.setProperty('--hx-x', `${((e.clientX - r.left) / r.width) * 100}%`); stage.style.setProperty('--hx-y', `${((e.clientY - r.top) / r.height) * 100}%`); };
    stage.addEventListener('pointermove', move);
    return () => stage.removeEventListener('pointermove', move);
  }, [variant]);
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

  const actions = <div className="commerce-hero-actions">
    <button className="commerce-hero-primary" onClick={() => onEnter('automatic')}>{t.auto}<ArrowRight size={17} /></button>
    <button className="commerce-hero-secondary" onClick={() => onEnter('manual')}>{t.manual}<ArrowRight size={17} /></button>
  </div>;
  const note = authRequired ? <small className="commerce-hero-note"><ShieldCheck size={13} />{t.note}</small> : null;

  return <main className="commerce-hero" id="overview">
    <section ref={stageRef} className="commerce-hero-stage" data-hero={variant} data-motion={reducedMotion ? 'reduced' : 'full'} aria-labelledby="commerce-hero-title">
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
      {variant === 'default' && <div className="commerce-hero-copy">
        <span className="commerce-hero-kicker">{t.kicker}</span>
        <h1 id="commerce-hero-title">AI-Sail Flow</h1>
        <p>{t.lead}<br className="commerce-hero-linebreak" />{t.lead2}</p>
        {actions}
        {note}
      </div>}
      {variant === 'a' && <div className="hx-copy hx-a">
        <span className="hx-a-eyebrow"><span className="hx-dot" />{alt.a.eyebrow}</span>
        <h1 id="commerce-hero-title"><span className="hx-a-brand"><Kinetic text="AI-Sail Flow" /></span>
          <span className="hx-a-line">{alt.a.pre} <Rotator words={alt.a.markets} reduced={reducedMotion} />{alt.a.post}</span></h1>
        <p>{t.lead}{t.lead2}</p>
        {actions}
        {note}
      </div>}
      {variant === 'b' && <div className="hx-copy hx-b">
        <span className="hx-b-kicker">AI-Sail Flow · {t.kicker}</span>
        <h1 id="commerce-hero-title"><span><Kinetic text={alt.b.title[0]} /></span><span className="hx-b-grad"><Kinetic text={alt.b.title[1]} start={4} /></span></h1>
        <p className="hx-b-uses">{alt.b.pre}<Rotator words={alt.b.uses} reduced={reducedMotion} interval={2400} />{alt.b.post}</p>
        {actions}
        {authRequired && <ul className="hx-b-trust">{t.note.split(' · ').map(item => <li key={item}><ShieldCheck size={13} />{item}</li>)}</ul>}
      </div>}
      {variant === 'c' && <div className="hx-copy hx-c">
        <div className="hx-c-card">
          <span className="hx-c-badge">{alt.c.badge}</span>
          <h1 id="commerce-hero-title">AI-Sail Flow</h1>
          <p className="hx-c-kicker">{t.kicker}</p>
          <p>{t.lead}{t.lead2}</p>
          <ol className="hx-c-steps" aria-label={alt.c.stepsAria}>{alt.c.steps.map((step, i) => <li key={step} style={{ animationDelay: `${i * 0.9}s` }}><span>{i + 1}</span>{step}</li>)}</ol>
          {actions}
          {note}
        </div>
      </div>}
      {!reducedMotion && !failed && <button
        className="commerce-hero-playback"
        onClick={togglePlayback}
        aria-label={playing ? t.pause : t.play}
        title={playing ? t.pause : t.play}
      >{playing ? <Pause size={15} /> : <Play size={15} />}</button>}
    </section>
  </main>;
}
