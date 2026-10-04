import { AbsoluteFill, Composition, Img, interpolate, registerRoot, staticFile, useCurrentFrame } from 'remotion';

const WIDTH = 1440;
const HEIGHT = 684;
const DURATION = 360;
const SCENE_LENGTH = 120;
const DISSOLVE = 28;
const scenes = ['global-shipping', 'product-earbuds-black-creator', 'product-tote-middle-eastern'];

// Thin moving trails connect the commerce scenes without competing with the live page copy.
const routes = [
  { start: [30, 590], control: [490, -170], end: [1430, 240], offset: 0 },
  { start: [-70, 340], control: [810, 850], end: [1460, 360], offset: 0.33 },
  { start: [240, 700], control: [1460, 390], end: [1310, -80], offset: 0.66 },
];

function CommerceHero() {
  const frame = useCurrentFrame();
  const cycle = frame / DURATION;
  return <AbsoluteFill style={{ backgroundColor: '#182521', overflow: 'hidden' }}>
    {scenes.map((scene, index) => {
      const phase = (frame - index * SCENE_LENGTH + DURATION) % DURATION;
      return <AbsoluteFill key={scene} style={{
        opacity: interpolate(phase, [0, DISSOLVE, SCENE_LENGTH, SCENE_LENGTH + DISSOLVE], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      }}>
        <Img src={staticFile(`commerce/${scene}.jpg`)} style={{
          width: WIDTH,
          height: HEIGHT,
          objectFit: 'cover',
          scale: interpolate(phase, [0, SCENE_LENGTH + DISSOLVE], [1.045, 1.105], { extrapolateRight: 'clamp' }),
          translate: `${interpolate(phase, [0, SCENE_LENGTH + DISSOLVE], [index % 2 ? 12 : -12, index % 2 ? -12 : 12], { extrapolateRight: 'clamp' })}px 0`,
          filter: 'saturate(.8) contrast(1.03)',
        }} />
      </AbsoluteFill>;
    })}
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(12,25,22,.08), transparent 45%, rgba(12,25,22,.12))' }} />
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <linearGradient id="route" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#f5e3bd" stopOpacity="0" />
          <stop offset=".35" stopColor="#f5e3bd" stopOpacity=".42" />
          <stop offset=".8" stopColor="#f5e3bd" stopOpacity=".38" />
          <stop offset="1" stopColor="#f5e3bd" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="packet">
          <stop offset="0" stopColor="#fff2d5" stopOpacity=".75" />
          <stop offset=".2" stopColor="#fff2d5" stopOpacity=".6" />
          <stop offset="1" stopColor="#ffe2a1" stopOpacity="0" />
        </radialGradient>
      </defs>
      {routes.map(({ start, control, end, offset }, index) => {
        const t = (cycle + offset) % 1;
        const x = (1 - t) ** 2 * start[0] + 2 * (1 - t) * t * control[0] + t ** 2 * end[0];
        const y = (1 - t) ** 2 * start[1] + 2 * (1 - t) * t * control[1] + t ** 2 * end[1];
        return <g key={index}>
          <path d={`M ${start.join(' ')} Q ${control.join(' ')} ${end.join(' ')}`} fill="none" stroke="url(#route)" strokeWidth="1" />
          <g opacity={Math.sin(t * Math.PI) * .75}>
            <circle cx={x} cy={y} r="22" fill="url(#packet)" />
            <circle cx={x} cy={y} r="2.6" fill="#fceac7" />
          </g>
        </g>;
      })}
    </svg>
    {/* The light breathes over a complete period so the last-to-first cut stays continuous. */}
    <AbsoluteFill style={{
      opacity: .13 + Math.sin(cycle * Math.PI * 2) * .045,
      background: 'radial-gradient(ellipse at 80% 12%, #ffdc9b, transparent 65%)',
      mixBlendMode: 'soft-light',
    }} />
  </AbsoluteFill>;
}

function HeroRoot() {
  return <Composition id="CommerceHero" component={CommerceHero} width={WIDTH} height={HEIGHT} fps={30} durationInFrames={DURATION} />;
}

registerRoot(HeroRoot);
