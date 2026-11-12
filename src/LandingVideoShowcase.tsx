import { useEffect, useId, useRef, useState } from 'react';
import { Pause, Play, VolumeX, X } from 'lucide-react';
import { useDict } from './i18n';
import './landing-video-showcase.css';

const examples = [
  { id: 'travel-vlog', duration: '0:10' },
  { id: 'motion-graphics', duration: '1:13' },
  { id: 'fashion-ad', duration: '0:10' },
] as const;
type Example = typeof examples[number];
const sequence = [...examples, ...examples];
const asset = (id: Example['id'], suffix: string) => `/assets/landing/video-examples/${id}${suffix}`;

const copy = {
  'zh-CN': {
    title: '创作示例', hint: '点击查看完整作品', pause: '暂停轮播', resume: '继续轮播',
    watch: '播放完整视频', close: '关闭播放器', muted: '静音预览', unsupported: '浏览器无法播放此视频。',
    examples: {
      'travel-vlog': { title: '旅行生活 Vlog', detail: '实景叙事 · 氛围剪辑' },
      'motion-graphics': { title: '程序化动效演示', detail: '动态图形 · 视觉特效' },
      'fashion-ad': { title: '时尚创意广告', detail: '服饰展示 · 创意转场' },
    },
  },
  en: {
    title: 'Creative examples', hint: 'Click to watch the full video', pause: 'Pause carousel', resume: 'Resume carousel',
    watch: 'Play full video', close: 'Close player', muted: 'Muted preview', unsupported: 'Your browser cannot play this video.',
    examples: {
      'travel-vlog': { title: 'Travel & lifestyle vlog', detail: 'Visual storytelling · Atmosphere' },
      'motion-graphics': { title: 'Procedural motion graphics', detail: 'Motion design · Visual effects' },
      'fashion-ad': { title: 'Creative fashion ad', detail: 'Fashion showcase · Creative transitions' },
    },
  },
};

export default function LandingVideoShowcase() {
  const t = useDict(copy);
  const titleId = useId();
  const dialogTitleId = useId();
  const section = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [active, setActive] = useState<Example | null>(null);
  const stopped = paused || !inView || hidden || reducedMotion || !!active;

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(preference.matches);
    const updateVisibility = () => setHidden(document.hidden);
    preference.addEventListener('change', updatePreference);
    document.addEventListener('visibilitychange', updateVisibility);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.1 });
    if (section.current) observer.observe(section.current);
    return () => {
      preference.removeEventListener('change', updatePreference);
      document.removeEventListener('visibilitychange', updateVisibility);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const rail = viewport.current;
    if (!rail) return;
    const videos = Array.from(rail.querySelectorAll<HTMLVideoElement>('video'));
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const video = entry.target as HTMLVideoElement;
        if (!stopped && entry.isIntersecting) {
          if (!video.getAttribute('src')) video.src = video.dataset.preview!;
          video.muted = true;
          void video.play().catch(() => { /* The poster remains visible if autoplay is unavailable. */ });
        } else video.pause();
      }
    }, { root: rail, threshold: 0.15 });
    videos.forEach(video => observer.observe(video));
    return () => {
      observer.disconnect();
      videos.forEach(video => video.pause());
    };
  }, [stopped]);

  useEffect(() => {
    if (!active || !dialog.current) return;
    const modal = dialog.current;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modal.showModal();
    return () => {
      player.current?.pause();
      modal.close();
      document.body.style.overflow = originalOverflow;
      trigger.current?.focus({ preventScroll: true });
    };
  }, [active]);

  return <section ref={section} className="lvs-showcase" aria-labelledby={titleId}>
    <header className="lvs-heading">
      <div><h2 id={titleId}>{t.title}</h2><span>{t.hint}</span></div>
      <button type="button" className="lvs-pause" aria-pressed={paused} onClick={() => setPaused(value => !value)}>
        {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}<span>{paused ? t.resume : t.pause}</span>
      </button>
    </header>
    <div ref={viewport} className="lvs-viewport">
      <div className="lvs-track" data-paused={stopped}>
        {[0, 1].map(group => <div className="lvs-group" key={group} aria-hidden={group === 1 || undefined}>
          {sequence.map((example, index) => {
            const duplicate = group === 1 || index >= examples.length;
            const label = t.examples[example.id];
            return <button type="button" className="lvs-card" key={`${example.id}-${index}`} tabIndex={duplicate ? -1 : 0}
              aria-hidden={duplicate || undefined} aria-label={`${t.watch}：${label.title}`} aria-haspopup="dialog"
              onClick={event => { trigger.current = event.currentTarget; setActive(example); }}>
              <video data-preview={asset(example.id, '-preview.mp4')} poster={asset(example.id, '.jpg')} muted loop playsInline preload="none" tabIndex={-1} aria-hidden="true" disablePictureInPicture />
              <span className="lvs-muted" title={t.muted}><VolumeX size={14} aria-hidden="true" /></span>
              <span className="lvs-duration">{example.duration}</span>
              <span className="lvs-caption"><span><strong>{label.title}</strong><span>{label.detail}</span></span><span className="lvs-play"><Play size={18} fill="currentColor" aria-hidden="true" /></span></span>
            </button>;
          })}
        </div>)}
      </div>
    </div>
    <dialog ref={dialog} className="lvs-dialog" aria-labelledby={dialogTitleId}
      onCancel={event => { event.preventDefault(); setActive(null); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setActive(null);
      }}>
      {active && <>
        <header className="lvs-player-heading"><div><h2 id={dialogTitleId}>{t.examples[active.id].title}</h2><p>{t.examples[active.id].detail}</p></div><button type="button" className="lvs-close" aria-label={t.close} onClick={() => setActive(null)}><X size={21} /></button></header>
        <video ref={player} className="lvs-player" src={asset(active.id, '.mp4')} poster={asset(active.id, '.jpg')} controls autoPlay playsInline preload="metadata">{t.unsupported}</video>
      </>}
    </dialog>
  </section>;
}
