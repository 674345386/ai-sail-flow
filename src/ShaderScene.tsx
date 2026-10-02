import { GrainGradient, MeshGradient, SmokeRing } from '@paper-design/shaders-react';
import type { ShaderVariant } from './ShaderBackdrop';

const mist = ['#ffffff', '#e9f0f7', '#d5e8ee', '#f8fafc'];
const mint = ['#bed0ba', '#dce7cf', '#a6cfda'];
const lavender = ['#c8ccdf', '#e3d9df', '#b5cbd8'];
const smoke = ['#c8c8d0'];

// Remocn's shaders use these Paper Design components. Live speed replaces
// the frame-controlled Remotion clock used by the documentation examples.
export default function ShaderScene({ variant }: { variant: ShaderVariant }) {
  const shared = { width: '100%', height: '100%', minPixelRatio: 1, frame: 24000, fit: 'cover' as const, className: 'sail-shader-renderer' };
  // Remocn Smoke Ring defaults, with the speed from the requested preview URL.
  if (variant === 'hero') return <SmokeRing {...shared} speed={0.5} colorBack="#12121a" colors={smoke} radius={0.25} thickness={0.65} scale={0.8} maxPixelCount={600000} />;
  if (variant === 'automatic' || variant === 'manual') return <GrainGradient {...shared} colors={variant === 'automatic' ? mint : lavender} colorBack="#fafbf9" speed={0.3} softness={0.7} intensity={0.24} noise={0.12} shape="wave" maxPixelCount={240000} />;
  return <MeshGradient {...shared} colors={mist} speed={0.25} distortion={0.5} swirl={0.12} grainMixer={0.08} grainOverlay={0.035} maxPixelCount={180000} />;
}
