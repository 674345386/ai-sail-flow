import type { CSSProperties } from 'react';
import type { LightBackgroundConfig } from './landing-background-config';

// Stable, broad pools form a continuous colour field rather than recognizable ornaments.
const POOLS = [
  { x: 16, y: 22, scale: 1.15, ratio: 1.2 },
  { x: 80, y: 29, scale: 1, ratio: .92 },
  { x: 44, y: 77, scale: 1.12, ratio: 1.25 },
  { x: 89, y: 85, scale: .95, ratio: 1.1 },
  { x: 9, y: 78, scale: .9, ratio: .9 },
  { x: 49, y: 12, scale: .85, ratio: 1.15 },
  { x: 70, y: 60, scale: 1.1, ratio: 1.1 },
  { x: 30, y: 48, scale: .9, ratio: .95 },
] as const;

export default function LightBackground({ config }: { config: LightBackgroundConfig }) {
  const style = {
    '--lbg-light-blur': `${config.blur}px`, '--lbg-light-sat': config.sat,
    '--lbg-light-opacity': config.opacity, '--lbg-light-blend': config.blend,
    '--lbg-light-grow': 1 + config.breathe, '--lbg-light-shrink': 1 - config.breathe * .5,
  } as CSSProperties;
  return <div className={`lbg-light${config.paused ? ' is-paused' : ''}`} style={style}>
    <div className="lbg-light-pools">
      {POOLS.slice(0, config.count).map((pool, i) => {
        const color = config.colors[i % config.colors.length];
        const direction = i % 2 ? -1 : 1;
        return <span key={i} className="lbg-light-pool" style={{
          left: `${pool.x}%`, top: `${pool.y}%`, width: `${config.size * pool.scale}vmax`, aspectRatio: pool.ratio,
          background: `radial-gradient(ellipse at center, ${color}d9 0%, ${color}80 30%, ${color}00 70%)`,
          '--lbg-flow-x': `${direction * (7 + i % 3 * 2) * config.drift}vw`,
          '--lbg-flow-y': `${(i % 3 ? -1 : 1) * 7 * config.drift}vh`,
          '--lbg-flow-turn': `${direction * 10 * config.drift}deg`,
          animationDuration: `${(26 + i * 3.7) / config.speed}s`, animationDelay: `${-i * 7.9}s`,
        } as CSSProperties} />;
      })}
    </div>
  </div>;
}
