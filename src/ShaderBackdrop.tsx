import { lazy, Suspense, useEffect, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';
import { useDecorativeMedia } from './useDecorativeMedia';

const ShaderScene = lazy(() => import('./ShaderScene'));
export type ShaderVariant = 'hero' | 'heading' | 'automatic' | 'manual' | 'canvas';
let webGLAvailable: boolean | undefined;

function supportsWebGL() {
  if (webGLAvailable !== undefined) return webGLAvailable;
  try {
    const context = document.createElement('canvas').getContext('webgl2');
    webGLAvailable = !!context;
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webGLAvailable = false;
  }
  return webGLAvailable;
}

/** Decoration stays out of document flow and never intercepts workspace input. */
export default function ShaderBackdrop({ variant }: { variant: ShaderVariant }) {
  const reduced = useReducedMotion();
  const decorativeReady = useDecorativeMedia();
  const animated = decorativeReady && !reduced && variant !== 'heading' && variant !== 'canvas';
  const [supported, setSupported] = useState(false);
  useEffect(() => { if (animated) setSupported(supportsWebGL()); }, [animated]);
  return <span className={`sail-shader-background sail-shader-${variant}`} aria-hidden="true">
    {supported && animated && <Suspense fallback={null}><ShaderScene variant={variant} /></Suspense>}
    <span className="sail-shader-veil" />
  </span>;
}
