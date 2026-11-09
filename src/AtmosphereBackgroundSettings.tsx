import { useId } from 'react';
import { Check } from 'lucide-react';
import { useLang } from './i18n';
import AtmosphereBackground from './AtmosphereBackground';
import { ATMOSPHERE_COMPOSITIONS, ATMOSPHERE_PRESETS, ATMOSPHERE_SLIDERS, atmospherePreset, type AtmosphereBackgroundConfig } from './atmosphere-background';

export default function AtmosphereBackgroundSettings({ config, onChange, showHeroSetting }: {
  config: AtmosphereBackgroundConfig;
  onChange: (patch: Partial<AtmosphereBackgroundConfig>) => void;
  showHeroSetting: boolean;
}) {
  const id = useId();
  const { lang } = useLang();
  const plain = (zh: string, en: string) => lang === 'en' ? en : zh;
  const customize = (patch: Partial<AtmosphereBackgroundConfig>) => onChange({ ...patch, preset: null });

  return <>
    <p className="lbg-type-description">{plain('一张连续的光色背景，贯穿导航、首屏和内容。', 'One continuous colour field across navigation, hero and content.')}</p>
    <div className="lbg-atmosphere-presets" aria-label={plain('氛围预设', 'Atmosphere presets')}>
      {(Object.keys(ATMOSPHERE_PRESETS) as (keyof typeof ATMOSPHERE_PRESETS)[]).map(key => {
        const preset = ATMOSPHERE_PRESETS[key];
        return <button type="button" key={key} aria-pressed={config.preset === key} onClick={() => onChange({ ...atmospherePreset(key), paused: config.paused, hero: config.hero })}>
          <span className="lbg-atmosphere-swatch"><AtmosphereBackground config={atmospherePreset(key)} preview /></span>
          <span className="lbg-atmosphere-preset-name">{plain(preset.name, preset.en)}{config.preset === key && <Check size={12} aria-hidden="true" />}</span>
        </button>;
      })}
    </div>
    <div className="lbg-row">
      <label htmlFor={`${id}-composition`}>{plain('光线构图', 'Composition')}</label>
      <select id={`${id}-composition`} value={config.composition} onChange={event => customize({ composition: event.target.value as AtmosphereBackgroundConfig['composition'] })}>
        {ATMOSPHERE_COMPOSITIONS.map(item => <option key={item.value} value={item.value}>{plain(item.zh, item.en)}</option>)}
      </select>
    </div>
    {showHeroSetting && <div className="lbg-row">
      <label htmlFor={`${id}-hero`}>{plain('首屏背景', 'Hero background')}</label>
      <select id={`${id}-hero`} value={config.hero} onChange={event => onChange({ hero: event.target.value as AtmosphereBackgroundConfig['hero'] })}>
        <option value="gradient">{plain('渐变贯穿', 'Continuous gradient')}</option>
        <option value="video">{plain('视频画面', 'Video')}</option>
      </select>
    </div>}
    <div className="lbg-atmosphere-colors">
      {([
        { key: 'base', zh: '底色', en: 'Base' },
        { key: 'primary', zh: '主色', en: 'Primary' },
        { key: 'secondary', zh: '光色', en: 'Light' },
        { key: 'accent', zh: '余辉', en: 'Glow' },
      ] as const).map(color => <label key={color.key}>
        <input type="color" value={config[color.key]} aria-label={plain(color.zh, color.en)} onChange={event => customize({ [color.key]: event.target.value })} />
        <span>{plain(color.zh, color.en)}</span>
      </label>)}
    </div>
    {([
      { key: 'composition', zh: '位置与铺展', en: 'Position & spread' },
      { key: 'finish', zh: '光线与质感', en: 'Light & texture' },
      { key: 'motion', zh: '缓慢流动', en: 'Slow motion' },
    ] as const).map(section => <details className="lbg-atmosphere-controls" key={section.key} open={section.key === 'composition'}>
      <summary>{plain(section.zh, section.en)}</summary>
      {ATMOSPHERE_SLIDERS.filter(slider => slider.group === section.key).map(slider => <div className="lbg-row" key={slider.key}>
        <label htmlFor={`${id}-${slider.key}`}><span>{plain(slider.zh, slider.en)}</span><output htmlFor={`${id}-${slider.key}`}>{slider.format(config[slider.key])}</output></label>
        <input id={`${id}-${slider.key}`} type="range" min={slider.min} max={slider.max} step={slider.step} value={config[slider.key]} onChange={event => customize({ [slider.key]: Number(event.target.value) })} />
      </div>)}
    </details>)}
  </>;
}
