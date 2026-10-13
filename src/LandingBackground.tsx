import { useEffect, useRef, useState } from 'react';
import './landing-background.css';
import { getLang, useLang } from './i18n';

/* Animated ambient background for the landing page (original design: slow drifting blurred colour pools,
   vignette and grain). Fixed behind the landing content, with a collapsible live config panel. */

type Config = {
  preset: string | null; base: string; colors: string[]; count: number; blur: number; size: number;
  speed: number; amp: number; breathe: number; opacity: number; bright: number; sat: number;
  blend: 'normal' | 'screen' | 'lighten' | 'overlay'; vig: number; grain: number; paused: boolean;
};

const PRESETS: Record<string, { name: string; en: string; base: string; colors: string[] }> = {
  flow: { name: '暖棕石板', en: 'Warm / Slate', base: '#070708', colors: ['#7c4e26', '#5c2c16', '#3a4c5c', '#283846', '#46423c', '#6a4a2c', '#30404e', '#52361e'] },
  ocean: { name: '深海蓝', en: 'Deep Ocean', base: '#04070c', colors: ['#0f3a5f', '#1b5e7a', '#123050', '#2a6f8a', '#0b2440', '#1d4e6e', '#3a7f95', '#0e2f4c'] },
  aurora: { name: '极光紫绿', en: 'Aurora', base: '#05060a', colors: ['#1f7a5a', '#5b3a8c', '#2a9d7a', '#3d2a6e', '#1a5c6a', '#7a4aa0', '#227060', '#4a3080'] },
  gold: { name: '暖金', en: 'Warm Gold', base: '#0a0705', colors: ['#a8732a', '#7a4a18', '#c49040', '#5e3812', '#8a6030', '#b38038', '#6a4420', '#94622a'] },
  mono: { name: '单色灰', en: 'Monochrome', base: '#070707', colors: ['#4a4a4c', '#2e2e30', '#5a5a5c', '#383839', '#444446', '#525254', '#3a3a3c', '#4e4e50'] },
};

const DEFAULT: Config = { preset: 'flow', base: '#070708', colors: [...PRESETS.flow.colors], count: 5, blur: 90, size: 42, speed: 1, amp: 1, breathe: .15, opacity: 1, bright: 1, sat: 1.15, blend: 'normal', vig: .9, grain: .07, paused: false };

type NumKey = 'count' | 'size' | 'blur' | 'speed' | 'amp' | 'breathe' | 'opacity' | 'bright' | 'sat' | 'vig' | 'grain';
const SLIDERS: { group: string; key: NumKey; zh: string; en: string; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
  { group: '形态 · Shape', key: 'count', zh: '色块数量', en: 'Blob count', min: 3, max: 8, step: 1, fmt: v => String(v) },
  { group: '形态 · Shape', key: 'size', zh: '色块大小', en: 'Blob size', min: 15, max: 80, step: 1, fmt: v => `${v}vw` },
  { group: '形态 · Shape', key: 'blur', zh: '模糊半径', en: 'Blur radius', min: 0, max: 200, step: 1, fmt: v => `${v}px` },
  { group: '动态 · Motion', key: 'speed', zh: '速度', en: 'Speed', min: .1, max: 4, step: .05, fmt: v => `${v.toFixed(2)}×` },
  { group: '动态 · Motion', key: 'amp', zh: '漂移幅度', en: 'Drift amplitude', min: 0, max: 3, step: .05, fmt: v => `${v.toFixed(2)}×` },
  { group: '动态 · Motion', key: 'breathe', zh: '呼吸强度', en: 'Breathing', min: 0, max: .6, step: .01, fmt: v => `${Math.round(v * 100)}%` },
  { group: '色调 · Look', key: 'opacity', zh: '不透明度', en: 'Opacity', min: 0, max: 1, step: .01, fmt: v => `${Math.round(v * 100)}%` },
  { group: '色调 · Look', key: 'bright', zh: '亮度', en: 'Brightness', min: .3, max: 2.5, step: .01, fmt: v => v.toFixed(2) },
  { group: '色调 · Look', key: 'sat', zh: '饱和度', en: 'Saturation', min: 0, max: 2.5, step: .01, fmt: v => v.toFixed(2) },
  { group: '质感 · Finish', key: 'vig', zh: '暗角强度', en: 'Vignette', min: 0, max: 1, step: .01, fmt: v => `${Math.round(v * 100)}%` },
  { group: '质感 · Finish', key: 'grain', zh: '颗粒噪点', en: 'Grain', min: 0, max: .3, step: .005, fmt: v => `${Math.round(v * 100)}%` },
];

const KEY = 'sail-landing-bg-v1';
const UI_KEY = 'sail-landing-bg-ui-v1';

function loadConfig(): Config {
  try { const raw = JSON.parse(localStorage.getItem(KEY) || '{}'); return { ...DEFAULT, ...raw, colors: Array.isArray(raw.colors) && raw.colors.length >= 8 ? raw.colors : [...DEFAULT.colors] }; }
  catch { return { ...DEFAULT, colors: [...DEFAULT.colors] }; }
}

// Stable per-index motion seeds so the field doesn't reshuffle when the count changes.
function seed(i: number) {
  const a = (n: number) => Math.abs((Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453) % 1);
  return { x: .12 + a(1) * .76, y: .15 + a(2) * .7, fx: .6 + a(3) * .8, fy: .6 + a(4) * .8, px: a(5) * 6.28, py: a(6) * 6.28, ps: a(7) * 6.28, sk: .75 + a(8) * .6 };
}

function hsl(h: number, s: number, l: number) {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export default function LandingBackground() {
  const [cfg, setCfg] = useState<Config>(loadConfig);
  const [open, setOpen] = useState<boolean>(() => { try { return localStorage.getItem(UI_KEY) === 'open'; } catch { return false; } });
  const [toast, setToast] = useState('');
  const cfgRef = useRef(cfg);
  const poolsRef = useRef<HTMLDivElement>(null);
  const blobRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const panelRef = useRef<HTMLElement>(null);

  // Keep the panel just below the sticky nav (which sits lower while the announcement banner is in view).
  useEffect(() => {
    let raf = 0;
    const place = () => { raf = 0; const nav = document.querySelector('.landing-nav'); const bottom = nav ? nav.getBoundingClientRect().bottom : 76;
      panelRef.current?.style.setProperty('--lbg-top', `${Math.max(0, Math.round(bottom)) + 16}px`); };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(place); };
    place(); window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onScroll);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, []);

  useEffect(() => { cfgRef.current = cfg; try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* storage unavailable */ } }, [cfg]);
  useEffect(() => { try { localStorage.setItem(UI_KEY, open ? 'open' : 'closed'); } catch { /* storage unavailable */ } }, [open]);
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(''), 1800); return () => window.clearTimeout(id); }, [toast]);

  // One rAF loop drives blob transforms. Time only advances while visible, unpaused and motion is allowed;
  // when nothing moves the loop parks itself and restarts on the next relevant change.
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let t = 0, last = performance.now(), raf = 0, stopped = false;
    const render = () => {
      const c = cfgRef.current, w = .2 * Math.PI, vw = window.innerWidth, W = vw * 1.4, H = window.innerHeight * 1.4;
      blobRefs.current.forEach((el, i) => {
        if (!el) return; const s = seed(i), d = c.size * s.sk / 100 * vw;
        const x = s.x * W - d / 2 + Math.sin(t * w * s.fx + s.px) * .09 * W * c.amp;
        const y = s.y * H - d / 2 + Math.cos(t * w * s.fy + s.py) * .09 * H * c.amp;
        const sc = 1 + Math.sin(t * w * .7 + s.ps) * .12 * Math.min(c.amp, 1.5);
        el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${sc.toFixed(3)})`;
      });
      if (poolsRef.current) poolsRef.current.style.opacity = String(c.opacity * (1 - c.breathe * (.5 + .5 * Math.sin(t * 2 * Math.PI / 18))));
    };
    const moving = () => !cfgRef.current.paused && !document.hidden && !reduce.matches;
    const frame = (now: number) => {
      const dt = Math.min(now - last, 100) / 1000; last = now;
      if (moving()) t += dt * cfgRef.current.speed;
      render();
      raf = moving() && !stopped ? requestAnimationFrame(frame) : 0;
    };
    const kick = () => { if (!raf && !stopped) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    (window as unknown as { __sailBgKick?: () => void }).__sailBgKick = kick;
    document.addEventListener('visibilitychange', kick); reduce.addEventListener('change', kick); window.addEventListener('resize', kick);
    kick();
    return () => { stopped = true; cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', kick); reduce.removeEventListener('change', kick); window.removeEventListener('resize', kick); };
  }, []);
  // Re-render a frame (and resume if needed) after any config change.
  useEffect(() => { (window as unknown as { __sailBgKick?: () => void }).__sailBgKick?.(); }, [cfg]);

  const update = (patch: Partial<Config>) => setCfg(c => ({ ...c, ...patch }));
  const setColor = (i: number, v: string) => setCfg(c => { const colors = [...c.colors]; colors[i] = v; return { ...c, colors, preset: null }; });
  const randomize = () => {
    const r = (a: number, b: number) => a + Math.random() * (b - a), h = r(0, 360), spread = r(20, 160);
    update({ preset: null, base: hsl(h, .3, .03), colors: Array.from({ length: 8 }, (_, i) => hsl((h + (i % 2 ? spread : 0) + r(-15, 15) + 360) % 360, r(.3, .65), r(.18, .38))),
      count: Math.round(r(3, 8)), size: Math.round(r(30, 60)), blur: Math.round(r(60, 140)), speed: +r(.5, 2).toFixed(2), amp: +r(.6, 1.8).toFixed(2), breathe: +r(.05, .3).toFixed(2), sat: +r(.9, 1.5).toFixed(2), bright: +r(.8, 1.3).toFixed(2) });
  };
  const copy = async () => {
    const json = JSON.stringify({ ...cfg, colors: cfg.colors.slice(0, cfg.count) }, null, 2);
    try { await navigator.clipboard.writeText(json); }
    catch { const ta = document.createElement('textarea'); ta.value = json; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    setToast(getLang() === 'en' ? 'JSON copied' : '已复制 JSON');
  };

  const style = { '--lbg-base': cfg.base, '--lbg-blur': `${cfg.blur}px`, '--lbg-bright': cfg.bright, '--lbg-sat': cfg.sat, '--lbg-blend': cfg.blend, '--lbg-vig': cfg.vig, '--lbg-grain': cfg.grain } as React.CSSProperties;
  const groups = [...new Set(SLIDERS.map(s => s.group))];
  // English UI shows English only; Chinese UI keeps the English term as small helper text.
  const { lang } = useLang();
  const en = lang === 'en';
  const bi = (zh: string, eng: string) => en ? <>{eng}</> : <>{zh}<small>{eng}</small></>;
  const plain = (zh: string, eng: string) => en ? eng : zh;
  const group = (g: string) => { const [zh, eng] = g.split(' · '); return plain(`${zh} · ${eng}`, eng); };
  const slider = (s: typeof SLIDERS[number]) => <div className="lbg-row" key={s.key}>
    <label><span>{bi(s.zh, s.en)}</span><output>{s.fmt(cfg[s.key])}</output></label>
    <input type="range" min={s.min} max={s.max} step={s.step} value={cfg[s.key]} aria-label={plain(s.zh, s.en)} onChange={e => update({ [s.key]: +e.target.value } as Partial<Config>)} />
  </div>;

  return <>
    <div className={`lbg${cfg.paused ? ' is-paused' : ''}`} style={style} aria-hidden="true">
      <div className="lbg-pools" ref={poolsRef}>
        {Array.from({ length: cfg.count }, (_, i) => { const d = cfg.size * seed(i).sk, c = cfg.colors[i % cfg.colors.length];
          return <span key={i} className="lbg-pool" ref={el => { blobRefs.current[i] = el; }} style={{ width: `${d}vw`, height: `${d}vw`, background: `radial-gradient(circle, ${c}c0 0%, ${c}00 68%)` }} />; })}
      </div>
      <div className="lbg-vignette" />
      <div className="lbg-grain" />
    </div>

    <aside ref={panelRef} className={`lbg-panel${open ? '' : ' is-collapsed'}`} style={style} aria-label={plain('背景配置', 'Background settings')}>
      <button type="button" className="lbg-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span><i className="lbg-dot" />{bi('背景配置', 'Background')}</span><span className="lbg-chev" aria-hidden="true">▾</span>
      </button>
      {open && <div className="lbg-body">
        <div className="lbg-sec">{plain('配色 · Palette', 'Palette')}</div>
        <div className="lbg-presets">{Object.entries(PRESETS).map(([k, p]) => <button type="button" key={k} className={cfg.preset === k ? 'is-on' : ''} onClick={() => update({ preset: k, base: p.base, colors: [...p.colors] })}>
          <span>{bi(p.name, p.en)}</span><span className="lbg-sw">{p.colors.slice(0, 5).map(c => <i key={c} style={{ background: c }} />)}</span></button>)}</div>
        <div className="lbg-row"><label><span>{bi('色块颜色', 'Blob colours')}</span></label>
          <div className="lbg-colors">{Array.from({ length: cfg.count }, (_, i) => <input key={i} type="color" value={cfg.colors[i]} title={plain(`色块 ${i + 1}`, `Blob ${i + 1}`)} aria-label={plain(`色块 ${i + 1} 颜色`, `Blob ${i + 1} colour`)} onChange={e => setColor(i, e.target.value)} />)}</div></div>
        <div className="lbg-row lbg-inline"><label><span>{bi('底色', 'Base colour')}</span></label><input type="color" value={cfg.base} aria-label={plain('底色', 'Base colour')} onChange={e => update({ base: e.target.value, preset: null })} /></div>
        {groups.map(g => <div key={g}><div className="lbg-sec">{group(g)}</div>{SLIDERS.filter(s => s.group === g).map(slider)}
          {g === '色调 · Look' && <div className="lbg-row"><label><span>{bi('混合模式', 'Blend mode')}</span></label>
            <select value={cfg.blend} onChange={e => update({ blend: e.target.value as Config['blend'] })}><option value="normal">{plain('普通 normal', 'Normal')}</option><option value="screen">{plain('滤色 screen', 'Screen')}</option><option value="lighten">{plain('变亮 lighten', 'Lighten')}</option><option value="overlay">{plain('叠加 overlay', 'Overlay')}</option></select></div>}</div>)}
        <div className="lbg-btns">
          <button type="button" onClick={() => update({ paused: !cfg.paused })}>{cfg.paused ? bi('▶ 播放', en ? '▶ Play' : 'Play') : bi('⏸ 暂停', en ? '⏸ Pause' : 'Pause')}</button>
          <button type="button" onClick={randomize}>{bi('🎲 随机', en ? '🎲 Randomize' : 'Randomize')}</button>
          <button type="button" onClick={() => { setCfg({ ...DEFAULT, colors: [...DEFAULT.colors] }); setToast(plain('已重置', 'Reset done')); }}>{bi('↺ 重置', en ? '↺ Reset' : 'Reset')}</button>
          <button type="button" onClick={copy}>{bi('⧉ 复制 JSON', en ? '⧉ Copy JSON' : 'Copy')}</button>
        </div>
        <div className="lbg-toast" role="status">{toast}</div>
      </div>}
    </aside>
  </>;
}
