import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowRight, ArrowUpRight, Camera, Clapperboard, LoaderCircle, Mic2, Pause, Play, ShieldCheck, ShoppingBag, type LucideIcon } from 'lucide-react';
import type { WorkflowMode } from '../shared/domain';
import { useReducedMotion } from './useReducedMotion';
import { useDecorativeMedia } from './useDecorativeMedia';
import heroVideo from './assets/landing/commerce-hero-reference.mp4';
import poster from './assets/landing/commerce-hero-reference-poster.jpg';
import { useDict } from './i18n';
import { LANDING } from './landing-i18n';
import './landing-showcase.css';

type SceneId = 'commerce' | 'ads' | 'ugc' | 'talking';
const scenes: { id: SceneId; icon: LucideIcon; image: string; video?: string }[] = [
  { id: 'commerce', icon: ShoppingBag, image: poster, video: heroVideo },
  { id: 'ads', icon: Clapperboard, image: '/assets/landing/models-ambient-v2.webp' },
  { id: 'ugc', icon: Camera, image: '/assets/landing/hero-creator-v2.webp' },
  { id: 'talking', icon: Mic2, image: '/assets/landing/market-creator-v2.png' },
];

export default function LandingHero({ authRequired, onEnter, onStart, busy = false, headingLevel = 1 }: {
  authRequired: boolean;
  onEnter: (mode: WorkflowMode) => void;
  onStart: (prompt: string) => void;
  busy?: boolean;
  headingLevel?: 1 | 2;
}) {
  const Title = headingLevel === 1 ? 'h1' : 'h2';
  const SceneTitle = headingLevel === 1 ? 'h2' : 'h3';
  const { showcase: t, hero: playback } = useDict(LANDING);
  const [active, setActive] = useState<SceneId>('commerce');
  const selected = scenes.find(scene => scene.id === active)!;
  const copy = t.cases[active];
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
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
    let visible = false;
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
  }, [paused, reducedMotion, failed, enabled, active]);

  const selectScene = (id: SceneId) => {
    if (id === active) return;
    videoRef.current?.pause();
    setPlaying(false);
    setActive(id);
  };
  const navigateTabs = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % scenes.length;
    else if (event.key === 'ArrowLeft') next = (index + scenes.length - 1) % scenes.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = scenes.length - 1;
    else return;
    event.preventDefault();
    selectScene(scenes[next].id);
    tabs.current[next]?.focus();
  };
  const togglePlayback = () => {
    if (playing) setPaused(true);
    else {
      setRequestedPlayback(true);
      setPaused(false);
      void videoRef.current?.play().catch(() => setPlaying(false));
    }
  };

  return <section className="commerce-hero scenes-showcase" id="overview" aria-labelledby="scenes-title">
    <header className="scenes-heading">
      <Title id="scenes-title">{t.title.map(line => <span key={line}>{line}</span>)}</Title>
      <p>{t.description}</p>
    </header>

    <div className="scenes-tabs" role="tablist" aria-label={t.tabs}>
      {scenes.map(({ id, icon: Icon }, index) => <button
        type="button"
        key={id}
        ref={element => { tabs.current[index] = element; }}
        id={`scene-tab-${id}`}
        role="tab"
        aria-selected={active === id}
        aria-controls="scene-panel"
        tabIndex={active === id ? 0 : -1}
        onClick={() => selectScene(id)}
        onKeyDown={event => navigateTabs(event, index)}
      ><Icon size={18} strokeWidth={1.6} aria-hidden="true" /><span>{t.cases[id].label}</span></button>)}
    </div>

    <div className="scenes-stage" id="scene-panel" role="tabpanel" aria-labelledby={`scene-tab-${active}`} tabIndex={0} data-scene={active}>
      <div key={active} className="scenes-media" aria-hidden="true">
        <img src={selected.image} alt="" loading={headingLevel === 2 ? 'lazy' : undefined} fetchPriority={headingLevel === 2 ? 'auto' : 'high'} />
        {selected.video && !reducedMotion && !failed && <video
          ref={videoRef}
          src={enabled ? selected.video : undefined}
          poster={selected.image}
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
      <div className="scenes-scrim" aria-hidden="true" />
      <div key={`copy-${active}`} className="scenes-content">
        <SceneTitle>{copy.title.map(line => <span key={line}>{line}</span>)}</SceneTitle>
        <p className="scenes-description">{copy.description}</p>
        <div className="scenes-workflow">
          <span>{copy.workflow}</span>
          <ol aria-label={t.workflow}>{copy.steps.map((step, index) => <li key={step}>{index > 0 && <ArrowRight size={12} aria-hidden="true" />}{step}</li>)}</ol>
        </div>
        <div className="scenes-actions" aria-busy={busy}>
          <button type="button" className="scenes-primary" disabled={busy} onClick={() => active === 'commerce' ? onEnter('automatic') : onStart(copy.prompt)}>
            {busy ? <LoaderCircle size={17} className="spin" aria-hidden="true" /> : null}<span>{busy ? t.preparing : copy.action}</span>{!busy && <ArrowRight size={17} aria-hidden="true" />}
          </button>
          <button type="button" className="scenes-secondary" disabled={busy} onClick={() => active === 'commerce' ? onEnter('manual') : onStart('')}>
            {active === 'commerce' ? t.openFlow : t.fromScratch}<ArrowUpRight size={16} aria-hidden="true" />
          </button>
        </div>
        {authRequired && <small className="scenes-note"><ShieldCheck size={13} aria-hidden="true" />{t.note}</small>}
      </div>
      <div className="scenes-preview">
        <small>{active === 'commerce' ? t.videoPreview : t.imagePreview}</small>
        {selected.video && !reducedMotion && !failed && <button type="button" onClick={togglePlayback} aria-label={playing ? playback.pause : playback.play} title={playing ? playback.pause : playback.play}>
          {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
        </button>}
      </div>
    </div>
  </section>;
}
