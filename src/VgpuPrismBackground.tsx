import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';
import './vgpu-prism-hero.css';

type PrismRenderer = { ready: Promise<void>; dispose: () => void };
type OriginalPrismModule = {
  DEFAULT_PRISM_CONTROLS: Record<string, unknown>;
  createPrismRenderer: (options: {
    canvas: HTMLCanvasElement;
    framingElement: HTMLElement;
    initialMode: 'dark';
    initialQuality: 'auto';
    initialControls: Record<string, unknown>;
    debugPreviews: false;
    performanceSampling: false;
    onError: (error: unknown) => void;
  }) => PrismRenderer;
};

/** Original vgpu homepage runtime, including its shaders, optics and pointer interaction. */
export default function VgpuPrismBackground() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const framing = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'poster' | 'ready' | 'unavailable'>('poster');
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const element = canvas.current;
    const frame = framing.current;
    let renderer: PrismRenderer | undefined;
    let disposed = false;
    setState('poster');
    if (!element || !frame || reducedMotion || !(navigator as Navigator & { gpu?: unknown }).gpu) return;

    const fail = (error: unknown) => {
      if (disposed) return;
      setState('unavailable');
      console.warn('The vgpu prism background is unavailable.', error);
    };
    const moduleUrl = '/vendor/vgpu/prism-renderer.js';
    void import(/* @vite-ignore */ moduleUrl).then((module: OriginalPrismModule) => {
      if (disposed) return;
      renderer = module.createPrismRenderer({
        canvas: element,
        framingElement: frame,
        initialMode: 'dark',
        initialQuality: 'auto',
        initialControls: { ...module.DEFAULT_PRISM_CONTROLS, wallColor: '#000000' },
        debugPreviews: false,
        performanceSampling: false,
        onError: fail,
      });
      return renderer.ready.then(() => { if (!disposed) setState('ready'); });
    }).catch(fail);

    return () => { disposed = true; renderer?.dispose(); };
  }, [reducedMotion]);

  return <div className="vgpu-prism" data-state={state} aria-hidden="true">
    <canvas ref={canvas} className="vgpu-prism-canvas" />
    <div className="vgpu-prism-poster" />
    <div ref={framing} className="vgpu-prism-framing" data-triangle-container="true" />
  </div>;
}
