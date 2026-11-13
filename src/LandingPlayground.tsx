import { useEffect, useId, useState } from 'react';
import LandingBackground from './LandingBackground';
import { useLang } from './i18n';
import { DEFAULT_LIGHT_PATH, LIGHT_PATH_EVENT, LIGHT_PATH_STORAGE_KEY, loadLightPath, type LightPathConfig, type PrismShape } from './landing-light-path-config';

const sliders = [
  ['beamWidth', '光束宽度', 'Beam width', .5, 6, .1],
  ['intensity', '光谱亮度', 'Brightness', .25, 3, .05],
  ['dispersion', '色散展开', 'Dispersion', .5, 2, .05],
  ['prismScale', '棱镜大小', 'Prism size', 1, 3.5, .05],
  ['glassOpacity', '玻璃反光', 'Glass reflection', .2, 1, .02],
  ['mouseStrength', '鼠标响应', 'Pointer response', 0, 2, .05],
  ['scrollStrength', '滚动响应', 'Scroll response', 0, 2, .05],
] as const;

export default function LandingPlayground() {
  const [config, setConfig] = useState(loadLightPath);
  const [ambient, setAmbient] = useState(() => { try { return localStorage.getItem('sail-landing-ambient-overlay-v1') === 'true'; } catch { return false; } });
  const [copied, setCopied] = useState(false);
  const id = useId();
  const { lang } = useLang();
  const en = lang === 'en';
  const text = (zh: string, english: string) => en ? english : zh;
  const update = (patch: Partial<LightPathConfig>) => setConfig(current => ({ ...current, ...patch }));
  useEffect(() => {
    try { localStorage.setItem(LIGHT_PATH_STORAGE_KEY, JSON.stringify(config)); } catch { /* Settings still work without storage. */ }
    window.dispatchEvent(new CustomEvent(LIGHT_PATH_EVENT, { detail: config }));
  }, [config]);
  useEffect(() => { try { localStorage.setItem('sail-landing-ambient-overlay-v1', String(ambient)); } catch { /* Optional storage. */ } }, [ambient]);
  useEffect(() => { if (!copied) return; const timeout = window.setTimeout(() => setCopied(false), 1600); return () => window.clearTimeout(timeout); }, [copied]);

  const spectrum = <>
    <p className="lbg-type-description">{text('调整第二屏及后续的连续折射光路，第一屏保持现状。', 'Tune the continuous light path below the hero. The first screen stays as it is.')}</p>
    <div className="lbg-row lbg-inline"><label htmlFor={`${id}-enabled`}>{text('显示光路', 'Show light path')}</label><input id={`${id}-enabled`} type="checkbox" checked={config.enabled} onChange={event => update({ enabled: event.target.checked })} /></div>
    <div className="lbg-row"><label htmlFor={`${id}-shape`}>{text('棱镜形状', 'Prism shapes')}</label><select id={`${id}-shape`} value={config.shape} onChange={event => update({ shape: event.target.value as PrismShape })}>
      <option value="mixed">{text('多样组合', 'Mixed shapes')}</option><option value="triangle">{text('三角玻璃', 'Triangular glass')}</option><option value="rectangle">{text('矩形玻璃', 'Rectangular glass')}</option><option value="diamond">{text('菱形玻璃', 'Diamond glass')}</option>
    </select></div>
    {sliders.map(([key, zh, english, min, max, step]) => <div className="lbg-row" key={key}><label htmlFor={`${id}-${key}`}><span>{text(zh, english)}</span><output htmlFor={`${id}-${key}`}>{config[key].toFixed(2)}×</output></label><input id={`${id}-${key}`} type="range" min={min} max={max} step={step} value={config[key]} onChange={event => update({ [key]: +event.target.value })} /></div>)}
    <div className="lbg-btns"><button type="button" onClick={() => update({ paused: !config.paused })}>{text(config.paused ? '继续联动' : '暂停联动', config.paused ? 'Resume motion' : 'Pause motion')}</button><button type="button" onClick={() => setConfig({ ...DEFAULT_LIGHT_PATH })}>{text('重置光谱', 'Reset spectrum')}</button><button type="button" onClick={() => { void navigator.clipboard.writeText(JSON.stringify(config, null, 2)).then(() => setCopied(true), () => setCopied(false)); }}>{text('复制 JSON', 'Copy JSON')}</button></div>
    <div className="lbg-toast" role="status">{copied ? text('已复制', 'Copied') : ''}</div>
  </>;
  return <LandingBackground spectrumControls={spectrum} backgroundEnabled={ambient} onBackgroundEnabledChange={setAmbient} />;
}
