import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Eclipse, Layers2, Megaphone, Sun, X } from 'lucide-react';
import LightBackground from './LightBackground';
import AtmosphereBackground, { atmosphereStyle } from './AtmosphereBackground';
import AtmosphereBackgroundSettings from './AtmosphereBackgroundSettings';
import { DEFAULT_ATMOSPHERE_BACKGROUND, randomAtmosphereBackground, type AtmosphereBackgroundConfig } from './atmosphere-background';
import { agentContrastColor } from './intelligent-ui/theme';
import LandingAnnouncementSettings from './LandingAnnouncementSettings';
import { backgroundStorageKeys, DEFAULT_LIGHT_BACKGROUND, LIGHT_PRESETS, LIGHT_SLIDERS, loadAtmosphereBackground, loadBackgroundType, loadLightBackground, type BackgroundType, type LightBackgroundConfig } from './landing-background-config';
import './landing-background.css';
import './light-background.css';
import './atmosphere-background.css';
import { getLang, useLang } from './i18n';

/* Animated ambient background for the landing page (original design: slow drifting blurred colour pools,
   vignette and grain). Fixed behind the landing content, with a collapsible live config panel. */

type Config = {
  preset: string | null; base: string; colors: string[]; count: number; blur: number; size: number;
  speed: number; amp: number; breathe: number; opacity: number; bright: number; sat: number;
  blend: 'normal' | 'screen' | 'lighten' | 'overlay'; vig: number; grain: number; paused: boolean;
};
type PanelOffset = { x: number; y: number };

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
const BACKGROUND_TYPES = [
  { value: 'ambient', zh: '原有色块', en: 'Ambient', Icon: Layers2 },
  { value: 'light', zh: '浅色流光', en: 'Light flow', Icon: Sun },
  { value: 'atmosphere', zh: '氛围渐变', en: 'Atmosphere', Icon: Eclipse },
] as const;

function loadConfig(storageKey = KEY): Config {
  try { const raw = JSON.parse(localStorage.getItem(storageKey) || (storageKey !== KEY ? localStorage.getItem(KEY) : null) || '{}'); return { ...DEFAULT, ...raw, colors: Array.isArray(raw.colors) && raw.colors.length >= 8 ? raw.colors : [...DEFAULT.colors] }; }
  catch { return { ...DEFAULT, colors: [...DEFAULT.colors] }; }
}

function loadPanelOffset(storageKey: string): PanelOffset {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
    return { x: Number.isFinite(value?.x) ? value.x : 0, y: Number.isFinite(value?.y) ? value.y : 0 };
  } catch { return { x: 0, y: 0 }; }
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

export default function LandingBackground({ showControls = true, storageKey = KEY, uiStorageKey = UI_KEY, onBaseColorChange, controlsOpen, onControlsClose }: { showControls?: boolean; storageKey?: string; uiStorageKey?: string; onBaseColorChange?: (color: string) => void; controlsOpen?: boolean; onControlsClose?: () => void } = {}) {
  const [cfg, setCfg] = useState<Config>(() => loadConfig(storageKey));
  const [backgroundType, setBackgroundType] = useState<BackgroundType>(() => loadBackgroundType(storageKey));
  const [lightCfg, setLightCfg] = useState<LightBackgroundConfig>(() => loadLightBackground(storageKey));
  const [atmosphereCfg, setAtmosphereCfg] = useState<AtmosphereBackgroundConfig>(() => loadAtmosphereBackground(storageKey));
  const [settingsTab, setSettingsTab] = useState<'background' | 'announcements'>('background');
  const tabsId = useId();
  const announcementSettings = storageKey === KEY && settingsTab === 'announcements';
  const light = backgroundType === 'light';
  const atmosphere = backgroundType === 'atmosphere';
  const activeConfig = { ambient: cfg, light: lightCfg, atmosphere: atmosphereCfg }[backgroundType];
  const activeBase = activeConfig.base;
  const lightPage = light || (atmosphere && agentContrastColor(activeBase) === '#000000');
  useEffect(() => { onBaseColorChange?.(activeBase); }, [activeBase, onBaseColorChange]);
  const [open, setOpen] = useState<boolean>(() => { try { return localStorage.getItem(uiStorageKey) === 'open'; } catch { return false; } });
  const controlled = controlsOpen !== undefined;
  const panelOpen = controlsOpen ?? open;
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!showControls || !controlled || !panelOpen) return;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onControlsClose?.(); } };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showControls, controlled, panelOpen, onControlsClose]);
  const panelOffsetKey = `${uiStorageKey}-position`;
  const [panelOffset, setPanelOffset] = useState<PanelOffset>(() => loadPanelOffset(panelOffsetKey));
  const [toast, setToast] = useState('');
  const cfgRef = useRef(cfg);
  const poolsRef = useRef<HTMLDivElement>(null);
  const blobRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const panelRef = useRef<HTMLElement>(null);
  const panelDrag = useRef<{ pointerId: number; startX: number; startY: number; offset: PanelOffset; baseLeft: number; baseTop: number; width: number; height: number; moved: boolean; next: PanelOffset } | null>(null);
  const suppressToggle = useRef(false);

  const startPanelDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    panelDrag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, offset: panelOffset,
      baseLeft: rect.left - panelOffset.x, baseTop: rect.top - panelOffset.y, width: rect.width, height: rect.height, moved: false, next: panelOffset };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePanelDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = panelDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    const minX = 8 - drag.baseLeft, minY = 8 - drag.baseTop;
    const maxX = Math.max(minX, window.innerWidth - drag.width - 8 - drag.baseLeft);
    const maxY = Math.max(minY, window.innerHeight - drag.height - 8 - drag.baseTop);
    drag.next = { x: Math.max(minX, Math.min(maxX, drag.offset.x + dx)), y: Math.max(minY, Math.min(maxY, drag.offset.y + dy)) };
    setPanelOffset(drag.next);
  };
  const endPanelDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = panelDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    panelDrag.current = null;
    if (!drag.moved) return;
    setPanelOffset(drag.next);
    try { localStorage.setItem(panelOffsetKey, JSON.stringify(drag.next)); } catch { /* Storage may be unavailable. */ }
    suppressToggle.current = true;
    window.setTimeout(() => { suppressToggle.current = false; }, 0);
  };

  // Keep the panel just below the sticky nav (which sits lower while the announcement banner is in view).
  useEffect(() => {
    let raf = 0;
    const place = () => { raf = 0; const nav = document.querySelector('.landing-nav'); const bottom = nav ? nav.getBoundingClientRect().bottom : 76;
      panelRef.current?.style.setProperty('--lbg-top', `${Math.max(0, Math.round(bottom)) + 16}px`); };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(place); };
    const page = document.querySelector('.landing-page');
    const observer = new ResizeObserver(onScroll);
    if (page) observer.observe(page);
    place(); window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onScroll);
    return () => { observer.disconnect(); cancelAnimationFrame(raf); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, []);

  useEffect(() => { cfgRef.current = cfg; try { localStorage.setItem(storageKey, JSON.stringify(cfg)); } catch { /* storage unavailable */ } }, [cfg, storageKey]);
  useEffect(() => { try { localStorage.setItem(backgroundStorageKeys(storageKey).type, JSON.stringify(backgroundType)); } catch { /* storage unavailable */ } }, [backgroundType, storageKey]);
  useEffect(() => { try { localStorage.setItem(backgroundStorageKeys(storageKey).light, JSON.stringify(lightCfg)); } catch { /* storage unavailable */ } }, [lightCfg, storageKey]);
  useEffect(() => { try { localStorage.setItem(backgroundStorageKeys(storageKey).atmosphere, JSON.stringify(atmosphereCfg)); } catch { /* storage unavailable */ } }, [atmosphereCfg, storageKey]);
  useEffect(() => {
    const page = document.querySelector<HTMLElement>('.landing-page');
    if (!page) return;
    page.classList.toggle('landing-light', lightPage);
    page.style.setProperty('--lbg-page-base', activeBase);
    return () => { page.classList.remove('landing-light'); page.style.removeProperty('--lbg-page-base'); };
  }, [lightPage, activeBase]);
  useEffect(() => {
    const page = document.querySelector<HTMLElement>('.landing-page');
    if (!page || !atmosphere) return;
    const variables = atmosphereStyle(atmosphereCfg);
    page.classList.add('landing-atmosphere');
    page.dataset.atmosphereHero = atmosphereCfg.hero;
    for (const [key, value] of Object.entries(variables)) page.style.setProperty(key, String(value));
    return () => {
      page.classList.remove('landing-atmosphere');
      delete page.dataset.atmosphereHero;
      for (const key of Object.keys(variables)) page.style.removeProperty(key);
    };
  }, [atmosphere, atmosphereCfg]);
  useEffect(() => { if (!controlled) { try { localStorage.setItem(uiStorageKey, open ? 'open' : 'closed'); } catch { /* storage unavailable */ } } }, [open, uiStorageKey, controlled]);
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(''), 1800); return () => window.clearTimeout(id); }, [toast]);

  // One rAF loop drives blob transforms. Time only advances while visible, unpaused and motion is allowed;
  // when nothing moves the loop parks itself and restarts on the next relevant change.
  useEffect(() => {
    if (backgroundType !== 'ambient') return;
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
  }, [backgroundType]);
  // Re-render a frame (and resume if needed) after any config change.
  useEffect(() => { (window as unknown as { __sailBgKick?: () => void }).__sailBgKick?.(); }, [cfg]);

  const update = (patch: Partial<Config>) => setCfg(c => ({ ...c, ...patch }));
  const updateLight = (patch: Partial<LightBackgroundConfig>) => setLightCfg(c => ({ ...c, ...patch }));
  const updateAtmosphere = (patch: Partial<AtmosphereBackgroundConfig>) => setAtmosphereCfg(current => ({ ...current, ...patch }));
  const setColor = (i: number, v: string) => setCfg(c => { const colors = [...c.colors]; colors[i] = v; return { ...c, colors, preset: null }; });
  const randomize = () => {
    const r = (a: number, b: number) => a + Math.random() * (b - a), h = r(0, 360), spread = r(20, 160);
    update({ preset: null, base: hsl(h, .3, .03), colors: Array.from({ length: 8 }, (_, i) => hsl((h + (i % 2 ? spread : 0) + r(-15, 15) + 360) % 360, r(.3, .65), r(.18, .38))),
      count: Math.round(r(3, 8)), size: Math.round(r(30, 60)), blur: Math.round(r(60, 140)), speed: +r(.5, 2).toFixed(2), amp: +r(.6, 1.8).toFixed(2), breathe: +r(.05, .3).toFixed(2), sat: +r(.9, 1.5).toFixed(2), bright: +r(.8, 1.3).toFixed(2) });
  };
  const randomizeLight = () => {
    const presets = Object.entries(LIGHT_PRESETS);
    const [preset, palette] = presets[Math.floor(Math.random() * presets.length)];
    updateLight({ preset, base: palette.base, colors: [...palette.colors],
      count: 3 + Math.floor(Math.random() * 4), size: 36 + Math.round(Math.random() * 24), blur: 60 + Math.round(Math.random() * 50),
      speed: +(.5 + Math.random()).toFixed(2), drift: +(.5 + Math.random()).toFixed(2) });
  };
  const copy = async () => {
    const payload = atmosphere ? { type: 'atmosphere', ...atmosphereCfg } : light ? { type: 'light', ...lightCfg } : { ...cfg, colors: cfg.colors.slice(0, cfg.count) };
    const json = JSON.stringify(payload, null, 2);
    try { await navigator.clipboard.writeText(json); }
    catch { const ta = document.createElement('textarea'); ta.value = json; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    setToast(getLang() === 'en' ? 'JSON copied' : '已复制 JSON');
  };

  const style = { '--lbg-base': activeBase, '--lbg-blur': `${cfg.blur}px`, '--lbg-bright': cfg.bright, '--lbg-sat': cfg.sat, '--lbg-blend': cfg.blend, '--lbg-vig': cfg.vig, '--lbg-grain': cfg.grain } as React.CSSProperties;
  const panelStyle = { ...style, transform: !controlled && (panelOffset.x || panelOffset.y) ? `translate3d(${panelOffset.x}px, ${panelOffset.y}px, 0)` : undefined } as React.CSSProperties;
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
  const paused = activeConfig.paused;
  const togglePaused = () => {
    if (atmosphere) updateAtmosphere({ paused: !paused });
    else if (light) updateLight({ paused: !paused });
    else update({ paused: !paused });
  };
  const randomizeCurrent = () => {
    if (atmosphere) setAtmosphereCfg(current => ({ ...randomAtmosphereBackground(), paused: current.paused, hero: current.hero }));
    else if (light) randomizeLight();
    else randomize();
  };
  const resetCurrent = () => {
    if (atmosphere) setAtmosphereCfg({ ...DEFAULT_ATMOSPHERE_BACKGROUND });
    else if (light) setLightCfg({ ...DEFAULT_LIGHT_BACKGROUND, colors: [...DEFAULT_LIGHT_BACKGROUND.colors] });
    else setCfg({ ...DEFAULT, colors: [...DEFAULT.colors] });
    setToast(plain('已重置当前类型', 'Current type reset'));
  };

  return <>
    <div className={`lbg${paused ? ' is-paused' : ''}`} data-background-type={backgroundType} style={style} aria-hidden="true">
      {atmosphere ? <AtmosphereBackground config={atmosphereCfg} /> : light ? <LightBackground config={lightCfg} /> : <>
      <div className="lbg-pools" ref={poolsRef}>
        {Array.from({ length: cfg.count }, (_, i) => { const d = cfg.size * seed(i).sk, c = cfg.colors[i % cfg.colors.length];
          return <span key={i} className="lbg-pool" ref={el => { blobRefs.current[i] = el; }} style={{ width: `${d}vw`, height: `${d}vw`, background: `radial-gradient(circle, ${c}c0 0%, ${c}00 68%)` }} />; })}
      </div>
      <div className="lbg-vignette" />
      <div className="lbg-grain" />
      </>}
    </div>

    {showControls && (!controlled || panelOpen) && <aside ref={panelRef} id={controlled ? 'agent-background-controls' : undefined} className={`lbg-panel${panelOpen ? '' : ' is-collapsed'}${controlled ? ' is-docked' : ''}`} style={panelStyle} aria-label={plain('背景调色板', 'Background palette')}>
      <div className="lbg-panel-header">
      {controlled ? <div className="lbg-head lbg-docked-title"><span><i className="lbg-dot" />{plain('Background 调色板', 'Background palette')}</span></div> : <button type="button" className="lbg-head" aria-expanded={panelOpen} title={plain('拖动移动；点击展开或收起', 'Drag to move; click to open or close')}
        onPointerDown={startPanelDrag} onPointerMove={movePanelDrag} onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag} onLostPointerCapture={endPanelDrag}
        onClick={event => { if (suppressToggle.current) { event.preventDefault(); suppressToggle.current = false; return; } setOpen(o => !o); }}>
        <span><i className="lbg-dot" />{bi('背景配置', 'Background')}</span><span className="lbg-chev" aria-hidden="true">▾</span>
      </button>}
      {panelOpen && <button type="button" className="lbg-close" ref={closeButton} title={plain('关闭调色板', 'Close palette')} aria-label={plain('关闭调色板', 'Close palette')} onClick={() => { if (controlled) onControlsClose?.(); else setOpen(false); }}><X size={17} aria-hidden="true" /></button>}
      </div>
      {panelOpen && <>
      {storageKey === KEY && <div className="lbg-type-tabs lbg-section-tabs" role="tablist" aria-label={plain('配置分类', 'Settings category')}>
        {(['background', 'announcements'] as const).map(section => <button type="button" key={section} id={`${tabsId}-section-${section}`} role="tab" aria-selected={settingsTab === section} aria-controls={`${tabsId}-section-settings`} tabIndex={settingsTab === section ? 0 : -1}
          onClick={() => setSettingsTab(section)} onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 'background' : event.key === 'End' ? 'announcements' : section === 'background' ? 'announcements' : 'background';
            setSettingsTab(next);
            document.getElementById(`${tabsId}-section-${next}`)?.focus();
          }}>{section === 'background' ? <Layers2 size={14} aria-hidden="true" /> : <Megaphone size={14} aria-hidden="true" />}<span>{plain(section === 'background' ? '页面背景' : '头部活动栏', section === 'background' ? 'Background' : 'Header bars')}</span></button>)}
      </div>}
      <div className="lbg-settings-section" id={`${tabsId}-section-settings`} role={storageKey === KEY ? 'tabpanel' : undefined} aria-labelledby={storageKey === KEY ? `${tabsId}-section-${settingsTab}` : undefined}>
      {announcementSettings ? <div className="lbg-body lbg-announcement-settings"><LandingAnnouncementSettings /></div> : <>
      <div className="lbg-type-tabs lbg-background-tabs" role="tablist" aria-label={plain('背景类型', 'Background type')}>
        {BACKGROUND_TYPES.map(({ value: type, zh, en: english, Icon }, index) => <button type="button" key={type} id={`${tabsId}-${type}`} role="tab" aria-selected={backgroundType === type} aria-controls={`${tabsId}-settings`} tabIndex={backgroundType === type ? 0 : -1}
          onClick={() => setBackgroundType(type)} onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            let nextIndex = (index + (event.key === 'ArrowRight' ? 1 : -1) + BACKGROUND_TYPES.length) % BACKGROUND_TYPES.length;
            if (event.key === 'Home') nextIndex = 0;
            if (event.key === 'End') nextIndex = BACKGROUND_TYPES.length - 1;
            const next = BACKGROUND_TYPES[nextIndex].value;
            setBackgroundType(next);
            document.getElementById(`${tabsId}-${next}`)?.focus();
          }}><Icon size={14} aria-hidden="true" /><span>{plain(zh, english)}</span></button>)}
      </div>
      <div key={backgroundType} className={`lbg-body${light ? ' lbg-light-settings' : ''}`} id={`${tabsId}-settings`} role="tabpanel" aria-labelledby={`${tabsId}-${backgroundType}`} tabIndex={0}>
        {atmosphere ? <AtmosphereBackgroundSettings config={atmosphereCfg} onChange={updateAtmosphere} showHeroSetting={storageKey === KEY} /> : light ? <>
          <p className="lbg-type-description">{plain('浅色底上缓慢流动的柔和彩色光块。', 'Soft pools of colour flowing slowly across a light canvas.')}</p>
          <div className="lbg-sec">{plain('配色 · Palette', 'Palette')}</div>
          <div className="lbg-presets">{Object.entries(LIGHT_PRESETS).map(([key, preset]) => <button type="button" key={key} className={lightCfg.preset === key ? 'is-on' : ''} onClick={() => updateLight({ preset: key, base: preset.base, colors: [...preset.colors] })}>
            <span>{bi(preset.name, preset.en)}</span><span className="lbg-sw">{preset.colors.slice(0, 5).map(color => <i key={color} style={{ background: color }} />)}</span>
          </button>)}</div>
          <div className="lbg-row"><label><span>{bi('光块颜色', 'Pool colours')}</span></label><div className="lbg-colors">
            {Array.from({ length: lightCfg.count }, (_, i) => <input key={i} type="color" value={lightCfg.colors[i]} aria-label={plain(`光块 ${i + 1} 颜色`, `Pool ${i + 1} colour`)} onChange={event => { const value = event.target.value; setLightCfg(c => ({ ...c, preset: null, colors: c.colors.map((color, index) => index === i ? value : color) })); }} />)}
          </div></div>
          <div className="lbg-row lbg-inline"><label htmlFor={`${tabsId}-base`}><span>{bi('底色', 'Base colour')}</span></label>
            <input id={`${tabsId}-base`} type="color" value={lightCfg.base} onChange={event => updateLight({ base: event.target.value, preset: null })} /></div>
          {[...new Set(LIGHT_SLIDERS.map(s => s.group))].map(g => <div key={g}><div className="lbg-sec">{group(g)}</div>{LIGHT_SLIDERS.filter(s => s.group === g).map(s => <div className="lbg-row" key={s.key}>
            <label htmlFor={`${tabsId}-${s.key}`}><span>{bi(s.zh, s.en)}</span><output htmlFor={`${tabsId}-${s.key}`}>{s.fmt(lightCfg[s.key])}</output></label>
            <input id={`${tabsId}-${s.key}`} type="range" min={s.min} max={s.max} step={s.step} value={lightCfg[s.key]} onChange={event => updateLight({ [s.key]: +event.target.value })} />
          </div>)}{g === '色调 · Look' && <div className="lbg-row"><label htmlFor={`${tabsId}-blend`}><span>{bi('混合模式', 'Blend mode')}</span></label>
            <select id={`${tabsId}-blend`} value={lightCfg.blend} onChange={event => updateLight({ blend: event.target.value as LightBackgroundConfig['blend'] })}>
              <option value="multiply">{plain('柔和叠色', 'Soft multiply')}</option><option value="normal">{plain('普通混合', 'Normal')}</option>
            </select></div>}</div>)}
        </> : <>
        <div className="lbg-sec">{plain('配色 · Palette', 'Palette')}</div>
        <div className="lbg-presets">{Object.entries(PRESETS).map(([k, p]) => <button type="button" key={k} className={cfg.preset === k ? 'is-on' : ''} onClick={() => update({ preset: k, base: p.base, colors: [...p.colors] })}>
          <span>{bi(p.name, p.en)}</span><span className="lbg-sw">{p.colors.slice(0, 5).map(c => <i key={c} style={{ background: c }} />)}</span></button>)}</div>
        <div className="lbg-row"><label><span>{bi('色块颜色', 'Blob colours')}</span></label>
          <div className="lbg-colors">{Array.from({ length: cfg.count }, (_, i) => <input key={i} type="color" value={cfg.colors[i]} title={plain(`色块 ${i + 1}`, `Blob ${i + 1}`)} aria-label={plain(`色块 ${i + 1} 颜色`, `Blob ${i + 1} colour`)} onChange={e => setColor(i, e.target.value)} />)}</div></div>
        <div className="lbg-row lbg-inline"><label><span>{bi('底色', 'Base colour')}</span></label><input type="color" value={cfg.base} aria-label={plain('底色', 'Base colour')} onChange={e => update({ base: e.target.value, preset: null })} /></div>
        {groups.map(g => <div key={g}><div className="lbg-sec">{group(g)}</div>{SLIDERS.filter(s => s.group === g).map(slider)}
          {g === '色调 · Look' && <div className="lbg-row"><label><span>{bi('混合模式', 'Blend mode')}</span></label>
            <select value={cfg.blend} onChange={e => update({ blend: e.target.value as Config['blend'] })}><option value="normal">{plain('普通 normal', 'Normal')}</option><option value="screen">{plain('滤色 screen', 'Screen')}</option><option value="lighten">{plain('变亮 lighten', 'Lighten')}</option><option value="overlay">{plain('叠加 overlay', 'Overlay')}</option></select></div>}</div>)}
        </>}
        <div className={`lbg-btns${atmosphere ? ' lbg-btns--atmosphere' : ''}`}>
          {!atmosphere && <button type="button" onClick={togglePaused}>{paused ? bi('▶ 播放', en ? '▶ Play' : 'Play') : bi('⏸ 暂停', en ? '⏸ Pause' : 'Pause')}</button>}
          <button type="button" onClick={randomizeCurrent}>{bi('🎲 随机', en ? '🎲 Randomize' : 'Randomize')}</button>
          <button type="button" onClick={resetCurrent}>{bi('↺ 重置', en ? '↺ Reset' : 'Reset')}</button>
          <button type="button" onClick={copy}>{bi('⧉ 复制 JSON', en ? '⧉ Copy JSON' : 'Copy')}</button>
        </div>
        <div className="lbg-toast" role="status">{toast}</div>
      </div></>}
      </div></>}
    </aside>}
  </>;
}
