import type { CSSProperties } from 'react';
import type { AtmosphereBackgroundConfig } from './atmosphere-background';
import { agentContrastColor } from './intelligent-ui/theme';

export function atmosphereStyle(config: AtmosphereBackgroundConfig): CSSProperties {
  const light = agentContrastColor(config.base) === '#000000';
  return {
    '--atmo-base': config.base,
    '--atmo-primary': config.primary,
    '--atmo-secondary': config.secondary,
    '--atmo-accent': config.accent,
    '--atmo-ink': light ? '#211c26' : '#faf7ff',
    '--atmo-muted': `color-mix(in srgb, var(--atmo-ink) 78%, ${config.base})`,
    '--atmo-line': 'color-mix(in srgb, var(--atmo-ink) 20%, transparent)',
    '--atmo-surface': `color-mix(in srgb, ${config.base} 94%, var(--atmo-ink))`,
    '--atmo-x': `${config.focusX}%`,
    '--atmo-y': `${config.focusY}%`,
    '--atmo-spread': config.spread,
    '--atmo-angle': `${config.angle}deg`,
    '--atmo-softness': `${config.softness}px`,
    '--atmo-intensity': config.intensity,
    '--atmo-grain': config.grain,
    '--atmo-dots': config.dots,
    '--atmo-duration': `${48 / config.speed}s`,
    '--atmo-drift-x': `${config.drift * 3}%`,
    '--atmo-drift-y': `${config.drift * 2}%`,
    '--atmo-scheme': light ? 'light' : 'dark',
  } as CSSProperties;
}

export default function AtmosphereBackground({ config, preview = false }: { config: AtmosphereBackgroundConfig; preview?: boolean }) {
  return <span className={`lbg-atmosphere${config.paused ? ' is-paused' : ''}${preview ? ' is-preview' : ''}`} data-composition={config.composition} style={atmosphereStyle(config)} aria-hidden="true">
    <span className="lbg-atmosphere-field" />
    <span className="lbg-atmosphere-fade" />
    <span className="lbg-grain lbg-atmosphere-grain" />
    <span className="lbg-atmosphere-dots" />
  </span>;
}
