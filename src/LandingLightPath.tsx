import { useEffect, useRef } from 'react';
import { useReducedMotion } from './useReducedMotion';
import { buildLightRoute, projectLightRoute, LIGHT_FRAGMENT_SHADER, LIGHT_VERTEX_SHADER, type LightAnchor } from './landing-light-path-scene';
import { LIGHT_PATH_EVENT, loadLightPath, normalizeLightPath } from './landing-light-path-config';
import './landing-light-path.css';

/** A single continuation layer. The existing hero owns and renders the entire first screen. */
export default function LandingLightPath() {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const element = canvas.current;
    const page = host.current?.parentElement;
    const hero = page?.querySelector<HTMLElement>('.lp-prism-hero');
    if (!element || !page || !hero) return;
    const gl = element.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!gl) return;
    const shaders: WebGLShader[] = [];
    const compile = (kind: number, source: string) => {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error('Unable to create the continuation light shader.');
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Light shader compilation failed.');
      return shader;
    };
    const program = gl.createProgram();
    if (!program) return;
    const slots = Math.max(1, Math.min(4, Math.floor((Number(gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)) - 5) / 4)));
    let buffer: WebGLBuffer | null = null;
    try {
      gl.attachShader(program, compile(gl.VERTEX_SHADER, LIGHT_VERTEX_SHADER));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, LIGHT_FRAGMENT_SHADER.replace('#define MAX_LIGHTS 4', `#define MAX_LIGHTS ${slots}`)));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Light program linking failed.');
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const attribute = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
    } catch (error) {
      shaders.forEach(shader => gl.deleteShader(shader)); gl.deleteProgram(program); gl.deleteBuffer(buffer);
      console.warn('The continuation light path is unavailable.', error); return;
    }

    const uniform = (name: string) => gl.getUniformLocation(program, name);
    const locations = { resolution: uniform('uResolution'), ratio: uniform('uRatio'), clip: uniform('uClipTop'), segmentCount: uniform('uSegmentCount'), prismCount: uniform('uPrismCount'), segments: uniform('uSegments[0]'), beams: uniform('uBeams[0]'), prisms: uniform('uPrisms[0]'), prismMeta: uniform('uPrismMeta[0]'), material: uniform('uMaterial') };
    const segments = new Float32Array(slots * 4), beams = new Float32Array(slots * 4), prisms = new Float32Array(slots * 4), prismMeta = new Float32Array(slots * 4);
    let anchors: LightAnchor[] = [];
    let width = 0, height = 0, ratio = 1, heroBottom = 0;
    let frame = 0, measurePending = true, disposed = false, wasClear = false;
    let lastScroll = Number.NaN, lastFrame = 0;
    let config = loadLightPath(), configDirty = true, frozenPhase = 0, lastPhase = 0;
    let pointer: [number, number] = [.5, .5], target: [number, number] = [.5, .5];
    const observers: HTMLElement[] = [];

    const measure = () => {
      measurePending = false;
      width = document.documentElement.clientWidth; height = window.innerHeight;
      ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2200000 / Math.max(1, width * height)));
      element.width = Math.max(1, Math.round(width * ratio)); element.height = Math.max(1, Math.round(height * ratio));
      gl.viewport(0, 0, element.width, element.height);
      const scrollY = window.scrollY;
      heroBottom = hero.getBoundingClientRect().bottom + scrollY;
      const sections = [...page.querySelectorAll<HTMLElement>(':scope > section, :scope > footer')].filter(section => section !== hero);
      for (const section of sections) if (!observers.includes(section)) { resizeObserver.observe(section); observers.push(section); }
      anchors = buildLightRoute(width, height, heroBottom, sections.map(section => {
        const rect = section.getBoundingClientRect(); return { top: rect.top + scrollY, height: rect.height };
      }).filter(section => section.height > 0));
      lastScroll = Number.NaN;
    };
    const draw = (scrollY: number) => {
      const phase = reducedMotion ? 0 : config.paused ? frozenPhase : scrollY / Math.max(1, height);
      lastPhase = phase;
      const points = projectLightRoute(anchors, width, height, scrollY, pointer, { ...config, phase });
      let segmentCount = 0, prismCount = 0;
      const scrollPhase = phase * config.scrollStrength;
      for (let index = 0; index < points.length - 1 && segmentCount < slots; index++) {
        const a = points[index], b = points[index + 1];
        if (Math.max(a.y, b.y) < -120 || Math.min(a.y, b.y) > height + 120) continue;
        segments.set([a.x, a.y, b.x, b.y], segmentCount * 4);
        const cone = 18 + (Math.sin(scrollPhase * .65 + index * .85) + 1) * 9 + pointer[1] * 9 * config.mouseStrength;
        const coneWidth = Math.min(cone * config.beamWidth * config.dispersion, width * .18, b.radius > 0 ? b.radius * .95 : 200);
        beams.set([4.5 * config.beamWidth, coneWidth, (.66 + pointer[0] * .16) * config.intensity, 0], segmentCount * 4);
        segmentCount++;
      }
      for (const point of points) if (point.radius > 0 && point.y > -point.radius * 1.5 && point.y < height + point.radius * 1.5 && prismCount < slots) {
        prisms.set([point.x, point.y, point.radius, point.angle], prismCount * 4); prismCount++;
        const shape = config.shape === 'mixed' ? point.shape ?? 0 : ({ triangle: 0, rectangle: 1, diamond: 2 } as const)[config.shape];
        prismMeta.set([shape, .27 + (pointer[0] - .5) * .25 * config.mouseStrength, -.18 + (pointer[1] - .5) * .18 * config.mouseStrength, 1], (prismCount - 1) * 4);
      }
      gl.useProgram(program);
      gl.uniform2f(locations.resolution, element.width, element.height); gl.uniform1f(locations.ratio, ratio);
      gl.uniform1f(locations.clip, Math.max(0, heroBottom - scrollY));
      gl.uniform1i(locations.segmentCount, segmentCount); gl.uniform1i(locations.prismCount, prismCount);
      gl.uniform4fv(locations.segments, segments); gl.uniform4fv(locations.beams, beams); gl.uniform4fv(locations.prisms, prisms);
      gl.uniform4fv(locations.prismMeta, prismMeta);
      // These are the original homepage's dark-glass IOR, reflection and exposure.
      gl.uniform4f(locations.material, 1.645, 2.14, 2.3, config.glassOpacity);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      wasClear = false;
    };
    const tick = (time: number) => {
      frame = 0;
      if (disposed || document.hidden || gl.isContextLost()) return;
      if (measurePending) measure();
      const scrollY = window.scrollY;
      const blend = reducedMotion ? 1 : 1 - Math.pow(.88, Math.min(3, (time - (lastFrame || time - 16.67)) / 16.67));
      lastFrame = time;
      const moving = !config.paused && Math.hypot(pointer[0] - target[0], pointer[1] - target[1]) > .0003;
      if (moving) pointer = [pointer[0] + (target[0] - pointer[0]) * blend, pointer[1] + (target[1] - pointer[1]) * blend];
      // Polling the scroll offset keeps the GPU demand-driven without scroll event handlers.
      if (!config.enabled || scrollY + height <= heroBottom + 1) {
        if (!wasClear) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); wasClear = true; }
      } else if (scrollY !== lastScroll || moving || wasClear || configDirty) draw(scrollY);
      configDirty = false;
      lastScroll = scrollY;
      frame = requestAnimationFrame(tick);
    };
    const start = () => { if (!frame && !disposed && !document.hidden) { lastFrame = 0; frame = requestAnimationFrame(tick); } };
    const onPointer = (event: PointerEvent) => {
      if (reducedMotion || config.paused || config.mouseStrength === 0 || event.isPrimary === false || event.pointerType === 'touch') return;
      target = [Math.max(0, Math.min(1, event.clientX / Math.max(1, width))), Math.max(0, Math.min(1, event.clientY / Math.max(1, height)))];
    };
    const onResize = () => { measurePending = true; start(); };
    const onVisibility = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else { lastScroll = Number.NaN; start(); } };
    const onConfig = (event: Event) => {
      const next = normalizeLightPath((event as CustomEvent).detail);
      if (next.paused && !config.paused) frozenPhase = lastPhase;
      config = next; configDirty = true; start();
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(page); resizeObserver.observe(hero);
    const mutationObserver = new MutationObserver(onResize); mutationObserver.observe(page, { childList: true });
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener(LIGHT_PATH_EVENT, onConfig);
    void document.fonts.ready.then(() => { if (!disposed) onResize(); });
    start();
    return () => {
      disposed = true; cancelAnimationFrame(frame); resizeObserver.disconnect(); mutationObserver.disconnect();
      window.removeEventListener('pointermove', onPointer); window.removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener(LIGHT_PATH_EVENT, onConfig);
      gl.deleteBuffer(buffer); shaders.forEach(shader => gl.deleteShader(shader)); gl.deleteProgram(program);
    };
  }, [reducedMotion]);

  return <div className="landing-light-path" ref={host} aria-hidden="true"><canvas ref={canvas} /></div>;
}
