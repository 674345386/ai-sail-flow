import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { NOTIF_BLUE, type DotRender } from './bot/decor';
import { BotEngine, type BotFrame } from './bot/engine';
import { DEFAULT_EXPRESSION, EXPRESSION_BY_ID, type ExpressionId } from './bot/expressions';
import { clamp } from './bot/math';
import { DEMI_VIEWBOX, RAYON } from './bot/repere';
import { COLOR_BY_ID, DEFAULT_COLOR, DEFAULT_SHAPE, mixHex, SHAPE_BY_ID, type ColorId, type ShapeId } from './bot/skins';
import type { StateId } from './bot/states';
import { bloubPaperColor } from './bloubConfig';

const R = RAYON;
const VB = DEMI_VIEWBOX;
const VIEWBOX = `${-VB} ${-VB} ${VB * 2} ${VB * 2}`;

export interface BloubAvatarProps {
  size?: number;
  shape?: ShapeId;
  color?: ColorId;
  expression?: ExpressionId;
  state?: StateId;
  paper?: string;
  frameBackground?: string;
  frameOutline?: boolean;
  frozenAt?: number;
  followPointer?: boolean;
  framed?: boolean;
  className?: string;
  label?: string;
}

function renderDot(dot: DotRender, index: number, ink: string, paper: string) {
  const fill = dot.color ?? (dot.depth === undefined ? ink : mixHex(paper, ink, dot.depth));
  if (dot.d) {
    return (
      <path
        key={index}
        d={dot.d}
        transform={`translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${R})`}
        fill={fill}
        opacity={dot.opacity}
      />
    );
  }
  return <circle key={index} cx={dot.x} cy={dot.y} r={dot.r} fill={fill} opacity={dot.opacity} />;
}

export function BloubAvatar({
  size = 40,
  shape = DEFAULT_SHAPE,
  color = DEFAULT_COLOR,
  expression = DEFAULT_EXPRESSION,
  state = 'idle',
  paper: paperProp,
  frameBackground,
  frameOutline = true,
  frozenAt,
  followPointer = false,
  framed = false,
  className,
  label,
}: BloubAvatarProps) {
  const uid = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement | null>(null);
  const ink = COLOR_BY_ID.get(color)?.hex ?? COLOR_BY_ID.get(DEFAULT_COLOR)!.hex;
  const paper = paperProp ?? bloubPaperColor(color);
  const shapeObj = SHAPE_BY_ID.get(shape) ?? SHAPE_BY_ID.get(DEFAULT_SHAPE)!;
  const exprObj = EXPRESSION_BY_ID.get(expression) ?? EXPRESSION_BY_ID.get(DEFAULT_EXPRESSION)!;

  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const isStatic = frozenAt !== undefined || reducedMotion;

  const staticFrame = useMemo<BotFrame | null>(() => {
    if (!isStatic) return null;
    const staticEngine = new BotEngine(R, state, shapeObj.radii, exprObj);
    return staticEngine.sample(frozenAt ?? 0);
  }, [isStatic, frozenAt, state, shapeObj, exprObj]);

  const engineRef = useRef<BotEngine | null>(null);
  const timeRef = useRef(0);
  const [liveFrame, setLiveFrame] = useState<BotFrame>(() => {
    const initial = new BotEngine(R, state, shapeObj.radii, exprObj);
    return initial.sample(0);
  });

  useEffect(() => {
    if (isStatic) return;
    if (!engineRef.current) {
      engineRef.current = new BotEngine(R, state, shapeObj.radii, exprObj);
    }
    const engine = engineRef.current;
    engine.setState(state, timeRef.current);
    engine.setShape(shapeObj.radii, timeRef.current);
    engine.setExpression(exprObj, timeRef.current);
  }, [isStatic, state, shapeObj, exprObj]);

  useEffect(() => {
    if (isStatic) return;
    if (!engineRef.current) {
      engineRef.current = new BotEngine(R, state, shapeObj.radii, exprObj);
    }
    const engine = engineRef.current;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!document.hidden) {
        timeRef.current += dt;
        setLiveFrame(engine.sample(timeRef.current));
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [isStatic]);

  useEffect(() => {
    if (isStatic || !followPointer) return;
    const onMove = (event: PointerEvent) => {
      const el = svgRef.current;
      const engine = engineRef.current;
      if (!el || !engine) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = event.clientX - cx;
      const dy = event.clientY - cy;
      const reach = Math.max(rect.width * 3.5, 220);
      const nx = clamp(dx / reach, -1, 1);
      const ny = clamp(dy / reach, -1, 1);
      const dist = Math.hypot(nx, ny);
      engine.setLook(
        {
          yaw: nx * 36,
          pitch: -ny * 26,
          mix: clamp(dist * 1.15, 0, 1),
          spin: 0,
          wander: clamp(1 - dist * 1.1, 0.15, 1),
        },
        timeRef.current,
      );
    };
    const onLeave = () => {
      engineRef.current?.setLook(null, timeRef.current, 0.55);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
    };
  }, [isStatic, followPointer]);

  const frame = staticFrame ?? liveFrame;
  const maskId = `bloub-mask-${uid}`;

  const svg = (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox={VIEWBOX}
      className={framed ? 'bloub-svg' : className ? `bloub-svg ${className}` : 'bloub-svg'}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <mask id={maskId}>
          <path d={frame.bodyPath} fill="#fff" />
          {frame.eyes.map((eye, i) => (
            <path key={i} d={eye.d} transform={eye.matrix} fill="#000" opacity={eye.alpha} />
          ))}
          {frame.notch && <circle cx={frame.notch.x} cy={frame.notch.y} r={frame.notch.r} fill="#000" />}
        </mask>
        {frame.arcs.map((arc) => (
          <linearGradient
            key={arc.id}
            id={`${uid}-${arc.id}`}
            gradientUnits="userSpaceOnUse"
            x1={arc.grad.x1}
            y1={arc.grad.y1}
            x2={arc.grad.x2}
            y2={arc.grad.y2}
          >
            {arc.grad.stops.map((color, index, stops) => (
              <stop key={index} offset={index / (stops.length - 1)} stopColor={color} />
            ))}
          </linearGradient>
        ))}
      </defs>

      {frame.arcs.map((arc) => (
        <path
          key={arc.id}
          d={arc.back}
          fill="none"
          stroke={`url(#${uid}-${arc.id})`}
          strokeWidth={arc.width}
          strokeLinecap="round"
          opacity={arc.opacity}
        />
      ))}

      {frame.dotsBehind && frame.dots.map((dot, i) => renderDot(dot, i, ink, paper))}

      <g opacity={frame.bodyAlpha}>
        <path d={frame.bodyPath} fill={paper} />
        <rect x={-VB} y={-VB} width={VB * 2} height={VB * 2} fill={ink} mask={`url(#${maskId})`} />
      </g>

      {!frame.dotsBehind && frame.dots.map((dot, i) => renderDot(dot, i, ink, paper))}

      {frame.notif && <circle cx={frame.notif.x} cy={frame.notif.y} r={frame.notif.r} fill={NOTIF_BLUE} />}

      {frame.arcs.map((arc) => (
        <path
          key={arc.id}
          d={arc.front}
          fill="none"
          stroke={`url(#${uid}-${arc.id})`}
          strokeWidth={arc.width}
          strokeLinecap="round"
          opacity={arc.opacity}
        />
      ))}
    </svg>
  );

  if (!framed) return svg;

  const outlineColor = color === 'creme' ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.08)';

  return (
    <span
      className={className ? `bloub-avatar-frame ${className}` : 'bloub-avatar-frame'}
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: frameBackground ?? paper,
        boxShadow: frameOutline ? `inset 0 0 0 1px ${outlineColor}` : undefined,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {svg}
    </span>
  );
}
