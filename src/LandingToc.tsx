import { useEffect, useState } from 'react';
import './landing-toc.css';

const items = [
  { id: 'overview', label: '概览' },
  { id: 'made', label: '作品' },
  { id: 'models', label: '拆解' },
  { id: 'compare', label: '对比' },
  { id: 'tools', label: '工具' },
  { id: 'creator', label: 'Flow 创作营' },
  { id: 'start', label: '开始创作' },
  { id: 'pricing', label: '价格' },
];
const NAV_OFFSET = 76;

/** "本页目录" — fixed left table of contents with scroll-spy. Visible after the hero, hidden once pricing takes over. */
export default function LandingToc() {
  const [active, setActive] = useState('overview');
  const [pastHero, setPastHero] = useState(false);
  const [atPricing, setAtPricing] = useState(false);

  useEffect(() => {
    const sections = items.map(item => document.getElementById(item.id)).filter((el): el is HTMLElement => !!el);
    const spy = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) setActive(entry.target.id); }), { rootMargin: '-40% 0px -55% 0px' });
    sections.forEach(section => spy.observe(section));
    const hero = document.getElementById('overview');
    const pricing = document.getElementById('pricing');
    const heroObserver = new IntersectionObserver(([entry]) => setPastHero(!entry.isIntersecting && entry.boundingClientRect.top < 0), { rootMargin: `-${NAV_OFFSET}px 0px 0px 0px` });
    const pricingObserver = new IntersectionObserver(([entry]) => setAtPricing(entry.isIntersecting || entry.boundingClientRect.top < 0), { rootMargin: '0px 0px -45% 0px' });
    if (hero) heroObserver.observe(hero);
    if (pricing) pricingObserver.observe(pricing);
    return () => { spy.disconnect(); heroObserver.disconnect(); pricingObserver.disconnect(); };
  }, []);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - NAV_OFFSET, behavior: reduced ? 'auto' : 'smooth' });
    setActive(id);
  };
  const visible = pastHero && !atPricing;

  return <nav className={`landing-toc${visible ? ' is-visible' : ''}`} aria-label="本页目录" aria-hidden={!visible} inert={!visible}>
    <p className="landing-toc-title">本页目录</p>
    <ol>
      {items.map(item => <li key={item.id}>
        <a href={`#${item.id}`} data-label={item.label} aria-current={active === item.id ? 'location' : undefined} className={active === item.id ? 'is-active' : ''} onClick={event => { event.preventDefault(); go(item.id); }}>
          <span>{item.label}</span>
        </a>
      </li>)}
    </ol>
  </nav>;
}
