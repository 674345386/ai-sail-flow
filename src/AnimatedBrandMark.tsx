import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

export default function AnimatedBrandMark() {
  const video = useRef<HTMLVideoElement>(null);
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const update = () => {
      if (reduced || document.hidden) {
        element.pause();
      } else {
        void element.play().catch(() => setPlaying(false));
      }
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      element.pause();
    };
  }, [reduced]);
  return <span className="workspace-brand-mark" aria-hidden="true">
    <img src="/assets/brand/workspace-mark.png" alt="" width={20} height={20} />
    <video ref={video} className={playing && !reduced ? 'playing' : ''} src="/assets/brand/workspace-mark-loop.mp4" poster="/assets/brand/workspace-mark.png" autoPlay={!reduced} muted loop playsInline preload="auto" tabIndex={-1} onPlaying={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setPlaying(false)} />
  </span>;
}
