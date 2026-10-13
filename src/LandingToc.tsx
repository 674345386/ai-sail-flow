import { useEffect, useState } from 'react';
import './landing-toc.css';
import { useDict } from './i18n';
import { LANDING } from './landing-i18n';

const items = ['overview', 'tools', 'made', 'models', 'compare', 'creator', 'start', 'pricing'] as const;
const NAV_OFFSET = 76;

/** "本页目录" — fixed left table of contents with scroll-spy. Visible after the hero, hidden once pricing takes over. */
export default function LandingToc() {
  const t = useDict(LANDING).toc;
  const [active, setActive] = useState('overview');
  const [pastHero, setPastHero] = useState(false);
  const [atPricing, setAtPricing] = useState(false);

  useEffect(() => {
    const sections = items.map(id => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
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

  return <nav className={`landing-toc${visible ? ' is-visible' : ''}`} aria-label={t.title} aria-hidden={!visible} inert={!visible}>
    <p className="landing-toc-title">{t.title}</p>
    <ol>
      {items.map(id => <li key={id}>
        <a href={`#${id}`} data-label={t[id]} aria-current={active === id ? 'location' : undefined} className={active === id ? 'is-active' : ''} onClick={event => { event.preventDefault(); go(id); }}>
          <span>{t[id]}</span>
        </a>
      </li>)}
    </ol>
  </nav>;
}
