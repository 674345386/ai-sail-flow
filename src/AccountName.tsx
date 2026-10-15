import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

export default function AccountName({ name }: { name: string }) {
  const viewport = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useLayoutEffect(() => {
    const measure = () => setOverflow(Math.max(0, (text.current?.scrollWidth ?? 0) - (viewport.current?.clientWidth ?? 0)));
    measure();
    const observer = new ResizeObserver(measure);
    if (viewport.current) observer.observe(viewport.current);
    if (text.current) observer.observe(text.current);
    return () => observer.disconnect();
  }, [name]);

  return <span ref={viewport} className={`account-name${overflow > 0 ? ' is-overflowing' : ''}`} title={name} style={{
    '--account-name-offset': `${-overflow}px`,
    '--account-name-duration': `${Math.max(4, overflow / 24 + 2)}s`,
  } as CSSProperties}><span ref={text} className="account-name-text">{name}</span></span>;
}
