import { useEffect, useId, useRef } from "react";
import "./scroll-brand.css";

/**
 * ScrollBrand — scroll-driven logo: full wordmark "AI Creative Lab" at scrollY = 0
 * morphs into the S3 sail mark (A + I-mast + sail with two batten cut-outs).
 *
 * Geometry is in the S3 source coordinate space (S3-T2-light.svg, inner group):
 * cap height = 200 units, baseline y = 356. The A, I, sail and battens are copied
 * verbatim from the S3 file, so at progress = 1 the render is identical to S3.
 * "Creative Lab" uses the locally hosted Inter 500 font outlines, whose
 * stems match the 28.6-unit T2 I-mast.
 */

type Props = {
  /** Scroll distance (px) over which the full morph happens. */
  distance?: number;
  /** Per-frame lerp factor at 60fps (0..1). Lower = floatier. */
  smoothing?: number;
  className?: string;
};

// ---- S3 mark geometry (verbatim from /workspace/sail-icons/sail/S3-T2-light.svg) ----
const A_PATH =
  "M0.0,356.0 L74.6,156.0 L97.4,156.0 L172.0,356.0 L144.5,356.0 L120.7,292.2 L51.3,292.2 L27.5,356.0 Z M57.5,275.8 L114.5,275.8 L86.0,199.3 Z";
const I_PATH = "M196.0,156.0 L224.6,156.0 L224.6,356.0 L196.0,356.0 Z";
const SAIL_PATH = "M238.1,156.0 Q308.1,243.7 346.6,349.0 Q297.8,358.0 238.1,356.0 Z";
// Battens drawn mast -> leech (same segments as the source, reversed direction).
const BATTENS = ["M262.8,234.8 L289.5,218.3", "M278.0,298.6 L322.2,276.8"];
const BATTEN_W = 5;

// ---- "Creative Lab" outlines from public/assets/fonts/workspace-inter-500.ttf ----
type Glyph = { ch: string; d: string };
const GLYPHS: Glyph[] = [
  {"ch": "C", "d": "M389.23 358.68Q363.33 358.68 342.93 346.4Q322.52 334.12 310.85 311.1Q299.17 288.08 299.17 256.13Q299.17 224.05 310.85 201.03Q322.52 178.01 342.93 165.66Q363.33 153.32 389.23 153.32Q405.07 153.32 418.97 157.88Q432.86 162.44 443.8 171.17Q454.74 179.89 461.92 192.38Q469.1 204.86 471.65 220.7H440.91Q439.03 211.17 434.27 203.85Q429.5 196.54 422.66 191.44Q415.81 186.34 407.36 183.79Q398.9 181.23 389.5 181.23Q372.32 181.23 358.7 189.89Q345.07 198.55 337.29 215.26Q329.5 231.97 329.5 256.13Q329.5 280.3 337.42 297.01Q345.34 313.72 358.9 322.24Q372.46 330.77 389.5 330.77Q398.9 330.77 407.29 328.15Q415.68 325.53 422.59 320.5Q429.5 315.46 434.27 308.08Q439.03 300.7 440.91 291.3H471.79Q469.5 306.07 462.52 318.35Q455.54 330.63 444.67 339.76Q433.8 348.89 419.77 353.79Q405.74 358.68 389.23 358.68Z"},
  {"ch": "r", "d": "M505.48 356V205.93H534.07V230.09H535.68Q539.84 217.74 550.17 210.77Q560.51 203.79 573.66 203.79Q576.48 203.79 580.11 203.99Q583.73 204.19 586.15 204.59V232.78Q584.54 232.24 579.97 231.7Q575.41 231.17 570.71 231.17Q560.51 231.17 552.32 235.46Q544.13 239.76 539.57 247.34Q535.01 254.93 535.01 264.86V356Z"},
  {"ch": "e", "d": "M676.48 359.09Q654.34 359.09 638.23 349.56Q622.12 340.03 613.46 322.71Q604.81 305.4 604.81 282.04Q604.81 258.95 613.33 241.37Q621.85 223.79 637.42 213.92Q652.99 204.05 673.93 204.05Q686.82 204.05 698.77 208.28Q710.71 212.51 720.24 221.5Q729.77 230.5 735.34 244.79Q740.91 259.09 740.91 279.49V289.96H621.32V267.95H725.74L711.92 275.19Q711.92 261.37 707.62 250.83Q703.33 240.3 694.94 234.39Q686.55 228.48 673.93 228.48Q661.45 228.48 652.59 234.52Q643.73 240.56 639.1 250.43Q634.47 260.3 634.47 271.97V287.01Q634.47 302.44 639.77 313.11Q645.07 323.79 654.6 329.22Q664.13 334.66 676.75 334.66Q685.07 334.66 691.79 332.31Q698.5 329.96 703.4 325.19Q708.3 320.43 710.85 313.45L738.63 320.03Q735.01 331.57 726.48 340.43Q717.96 349.29 705.28 354.19Q692.59 359.09 676.48 359.09Z"},
  {"ch": "a", "d": "M815.28 359.36Q801.05 359.36 789.5 354.05Q777.96 348.75 771.25 338.55Q764.54 328.35 764.54 313.58Q764.54 300.83 769.44 292.64Q774.34 284.46 782.72 279.62Q791.11 274.79 801.38 272.38Q811.65 269.96 822.26 268.75Q835.54 267.14 843.87 266.13Q852.19 265.13 856.15 262.78Q860.11 260.43 860.11 255.19V254.39Q860.11 245.93 856.89 240.16Q853.66 234.39 847.29 231.23Q840.91 228.08 831.38 228.08Q821.58 228.08 814.54 231.1Q807.49 234.12 803.13 238.82Q798.77 243.52 796.62 248.62L768.83 241.37Q773.93 227.95 783.46 219.76Q792.99 211.57 805.34 207.81Q817.69 204.05 830.85 204.05Q839.97 204.05 850.17 206.2Q860.38 208.35 869.37 213.99Q878.36 219.62 884 229.83Q889.64 240.03 889.64 256.4V356H861.05V335.46H859.57Q856.62 341.23 850.85 346.74Q845.07 352.24 836.28 355.8Q827.49 359.36 815.28 359.36ZM821.85 335.6Q833.93 335.6 842.52 330.9Q851.11 326.2 855.68 318.42Q860.24 310.63 860.24 301.91V282.71Q858.63 284.32 854.13 285.6Q849.64 286.87 843.87 287.88Q838.09 288.89 832.72 289.56Q827.36 290.23 823.87 290.63Q815.54 291.7 808.63 294.26Q801.72 296.81 797.62 301.5Q793.53 306.2 793.53 313.99Q793.53 321.1 797.22 325.93Q800.91 330.77 807.22 333.18Q813.53 335.6 821.85 335.6Z"},
  {"ch": "t", "d": "M993.53 205.93V229.96H912.19V205.93ZM934.07 170.23H963.6V315.46Q963.6 324.46 967.42 328.68Q971.25 332.91 979.97 332.91Q982.26 332.91 986.01 332.38Q989.77 331.84 992.46 331.3L997.69 354.93Q992.99 356.54 987.62 357.28Q982.26 358.01 977.02 358.01Q956.62 358.01 945.34 347.48Q934.07 336.94 934.07 317.88Z"},
  {"ch": "i", "d": "M1022.93 356V205.93H1052.46V356ZM1037.83 182.98Q1030.17 182.98 1024.74 177.88Q1019.3 172.78 1019.3 165.53Q1019.3 158.15 1024.74 153.05Q1030.17 147.95 1037.83 147.95Q1045.48 147.95 1050.98 153.05Q1056.48 158.15 1056.48 165.53Q1056.48 172.78 1050.98 177.88Q1045.48 182.98 1037.83 182.98Z"},
  {"ch": "v", "d": "M1135.14 356 1078.5 205.93H1110.44L1140.11 291.17Q1145.07 305.26 1148.56 319.42Q1152.05 333.58 1155.95 347.54H1147.09Q1150.85 333.58 1154.34 319.42Q1157.83 305.26 1162.66 291.17L1192.32 205.93H1224L1167.36 356Z"},
  {"ch": "e", "d": "M1314.87 359.09Q1292.72 359.09 1276.62 349.56Q1260.51 340.03 1251.85 322.71Q1243.19 305.4 1243.19 282.04Q1243.19 258.95 1251.72 241.37Q1260.24 223.79 1275.81 213.92Q1291.38 204.05 1312.32 204.05Q1325.21 204.05 1337.15 208.28Q1349.1 212.51 1358.63 221.5Q1368.16 230.5 1373.73 244.79Q1379.3 259.09 1379.3 279.49V289.96H1259.7V267.95H1364.13L1350.31 275.19Q1350.31 261.37 1346.01 250.83Q1341.72 240.3 1333.33 234.39Q1324.94 228.48 1312.32 228.48Q1299.84 228.48 1290.98 234.52Q1282.12 240.56 1277.49 250.43Q1272.86 260.3 1272.86 271.97V287.01Q1272.86 302.44 1278.16 313.11Q1283.46 323.79 1292.99 329.22Q1302.52 334.66 1315.14 334.66Q1323.46 334.66 1330.17 332.31Q1336.89 329.96 1341.79 325.19Q1346.68 320.43 1349.23 313.45L1377.02 320.03Q1373.4 331.57 1364.87 340.43Q1356.35 349.29 1343.66 354.19Q1330.98 359.09 1314.87 359.09Z"},
  {"ch": "L", "d": "M1487.22 356V156H1517.83V329.69H1608.43V356Z"},
  {"ch": "a", "d": "M1682.39 359.36Q1668.16 359.36 1656.62 354.05Q1645.07 348.75 1638.36 338.55Q1631.65 328.35 1631.65 313.58Q1631.65 300.83 1636.55 292.64Q1641.45 284.46 1649.84 279.62Q1658.23 274.79 1668.5 272.38Q1678.77 269.96 1689.37 268.75Q1702.66 267.14 1710.98 266.13Q1719.3 265.13 1723.26 262.78Q1727.22 260.43 1727.22 255.19V254.39Q1727.22 245.93 1724 240.16Q1720.78 234.39 1714.4 231.23Q1708.03 228.08 1698.5 228.08Q1688.7 228.08 1681.65 231.1Q1674.6 234.12 1670.24 238.82Q1665.88 243.52 1663.73 248.62L1635.95 241.37Q1641.05 227.95 1650.58 219.76Q1660.11 211.57 1672.46 207.81Q1684.81 204.05 1697.96 204.05Q1707.09 204.05 1717.29 206.2Q1727.49 208.35 1736.48 213.99Q1745.48 219.62 1751.11 229.83Q1756.75 240.03 1756.75 256.4V356H1728.16V335.46H1726.68Q1723.73 341.23 1717.96 346.74Q1712.19 352.24 1703.4 355.8Q1694.6 359.36 1682.39 359.36ZM1688.97 335.6Q1701.05 335.6 1709.64 330.9Q1718.23 326.2 1722.79 318.42Q1727.36 310.63 1727.36 301.91V282.71Q1725.74 284.32 1721.25 285.6Q1716.75 286.87 1710.98 287.88Q1705.21 288.89 1699.84 289.56Q1694.47 290.23 1690.98 290.63Q1682.66 291.7 1675.74 294.26Q1668.83 296.81 1664.74 301.5Q1660.64 306.2 1660.64 313.99Q1660.64 321.1 1664.34 325.93Q1668.03 330.77 1674.34 333.18Q1680.64 335.6 1688.97 335.6Z"},
  {"ch": "b", "d": "M1870.98 358.95Q1857.42 358.95 1848.77 354.32Q1840.11 349.69 1835.21 343.52Q1830.31 337.34 1827.62 332.51H1825.21V356H1796.48V156H1826.01V230.36H1827.62Q1830.31 225.66 1835.07 219.49Q1839.84 213.32 1848.36 208.68Q1856.89 204.05 1870.98 204.05Q1888.97 204.05 1903.13 213.18Q1917.29 222.31 1925.48 239.62Q1933.66 256.94 1933.66 281.37Q1933.66 305.53 1925.61 322.91Q1917.56 340.3 1903.4 349.62Q1889.23 358.95 1870.98 358.95ZM1864.4 333.85Q1877.29 333.85 1886.01 326.87Q1894.74 319.89 1899.1 307.95Q1903.46 296 1903.46 281.1Q1903.46 266.34 1899.1 254.59Q1894.74 242.85 1886.08 236Q1877.42 229.15 1864.4 229.15Q1851.79 229.15 1843.06 235.66Q1834.34 242.17 1829.91 253.79Q1825.48 265.4 1825.48 281.1Q1825.48 296.67 1829.97 308.55Q1834.47 320.43 1843.19 327.14Q1851.92 333.85 1864.4 333.85Z"},
];

const VB_X = 0;
const VB_W = 1955; // covers the full wordmark
const VB_Y = 156; // cap top
const VB_H = 200; // cap height

// ---- easing helpers ----
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeIn = (t: number) => t * t * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number, s = 1.6) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);

export default function ScrollBrand({ distance = 420, smoothing = 0.1, className }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const maskId = `sb-battens-${uid}`;

  const rootRef = useRef<HTMLSpanElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const letterRefs = useRef<(SVGPathElement | null)[]>([]);
  const sailRef = useRef<SVGGElement>(null);
  const battenRefs = useRef<(SVGPathElement | null)[]>([]);

  useEffect(() => {
    const root = rootRef.current;
    const svg = svgRef.current;
    const sail = sailRef.current;
    if (!root || !svg || !sail) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = mq.matches;
    let wordScale = 0.5;
    const readScale = () => {
      const v = parseFloat(getComputedStyle(root).getPropertyValue("--sb-word-scale"));
      wordScale = Number.isFinite(v) && v > 0 ? v : 0.5;
    };
    readScale();

    const target = () => clamp01(window.scrollY / distance);
    let current = reduced ? (target() >= 0.5 ? 1 : 0) : target();
    let raf = 0;
    let last = 0;
    let reducedState = current;

    // Letters fold away right to left, with duration independent of the brand name length.
    const letters = letterRefs.current;
    const hyphenIdx = GLYPHS.findIndex((g) => g.ch === "-");
    const order = letters
      .map((_, i) => i)
      .filter((i) => i !== hyphenIdx)
      .reverse();

    const render = (p: number) => {
      readScale(); // pick up CSS size changes (breakpoints, hot reload)
      // Whole lockup grows from wordmark size to mark size (centre-left anchored).
      const s = wordScale + (1 - wordScale) * easeInOut(seg(p, 0.18, 0.78));
      svg.style.transform = `scale(${s.toFixed(4)})`;

      // Letters: overlapping stagger, each rises, tilts back, squashes, blurs and fades.
      const start = 0.02;
      const step = 0.36 / Math.max(1, order.length - 1);
      const dur = 0.2;
      order.forEach((li, k) => {
        const el = letters[li];
        if (!el) return;
        const t = seg(p, start + k * step, start + k * step + dur);
        const e = easeIn(t);
        const eo = easeOut(t);
        const lift = -70 * eo; // units (cap = 200)
        const drift = 18 * eo;
        const rot = -26 * e;
        const sy = 1 - 0.5 * e;
        el.style.transform = `translate(${drift.toFixed(2)}px, ${lift.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${(1 - 0.12 * e).toFixed(4)}, ${sy.toFixed(4)})`;
        el.style.opacity = (1 - easeInOut(t)).toFixed(3);
        el.style.filter = t > 0.001 && t < 0.999 ? `blur(${(9 * e).toFixed(2)}px)` : "";
        el.style.visibility = t >= 1 ? "hidden" : "";
      });

      // Hyphen collapses toward the I-mast.
      const hy = letters[hyphenIdx];
      if (hy) {
        const t = seg(p, 0.42, 0.62);
        const e = easeInOut(t);
        hy.style.transform = `scale(${(1 - e).toFixed(4)}, ${(1 - 0.5 * e).toFixed(4)})`;
        hy.style.opacity = (1 - easeIn(t)).toFixed(3);
        hy.style.visibility = t >= 1 ? "hidden" : "";
      }

      // Sail hoists up the mast with an overshoot, belly billows out then settles.
      const ht = seg(p, 0.56, 0.9);
      const sy = ht <= 0 ? 0 : ht >= 1 ? 1 : easeOutBack(ht);
      const billow = ht <= 0 || ht >= 1 ? 0 : Math.sin(Math.PI * ht * 1.6) * Math.pow(1 - ht, 1.4);
      const sxBase = 0.5 + 0.5 * easeOut(clamp01(ht * 1.35));
      const sx = sxBase * (1 + 0.2 * billow);
      const skew = -7 * Math.sin(Math.PI * ht) * (1 - ht);
      sail.style.transform =
        ht >= 1 ? "none" : `skewY(${skew.toFixed(3)}deg) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
      sail.style.opacity = easeOut(seg(ht, 0, 0.25)).toFixed(3);
      sail.style.visibility = ht <= 0 ? "hidden" : "";

      // Battens are cut in last (mask strokes drawn mast -> leech).
      battenRefs.current.forEach((b, i) => {
        if (!b) return;
        const t = easeInOut(seg(p, 0.82 + i * 0.07, 0.93 + i * 0.07));
        b.style.strokeDashoffset = (1 - t).toFixed(4);
      });

      root.parentElement?.style.setProperty("--sb-p", p.toFixed(4));
      root.dataset.state = p >= 1 ? "mark" : p <= 0 ? "wordmark" : "morph";
    };

    // Intro on page load: start as the mark, hold briefly, then unfold into the wordmark.
    const INTRO_HOLD = 350, INTRO_DUR = 1900;
    let introStart = reduced ? -1 : 0;
    const introEase = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    if (!reduced) current = 1;

    const tick = (now: number) => {
      raf = 0;
      const tgt = target();
      if (introStart >= 0) {
        if (introStart === 0) introStart = now;
        const t = Math.min(1, Math.max(0, (now - introStart - INTRO_HOLD) / INTRO_DUR));
        current = tgt + (1 - tgt) * (1 - introEase(t));
        render(current);
        if (t < 1) { raf = requestAnimationFrame(tick); return; }
        introStart = -1; last = 0;
        return;
      }
      const dt = last ? Math.min(64, now - last) : 16.67;
      last = now;
      const k = 1 - Math.pow(1 - smoothing, dt / 16.67);
      current += (tgt - current) * k;
      if (Math.abs(tgt - current) < 0.0008) current = tgt;
      render(current);
      if (current !== tgt) raf = requestAnimationFrame(tick);
      else last = 0;
    };

    const onScroll = () => {
      if (reduced) {
        const next = target() >= 0.5 ? 1 : 0;
        if (next !== reducedState) {
          reducedState = next;
          current = next;
          render(next);
          // instant crossfade: restart a short opacity fade-in
          root.classList.remove("sb-fade");
          void root.offsetWidth;
          root.classList.add("sb-fade");
        }
        return;
      }
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onMq = () => {
      reduced = mq.matches;
      reducedState = target() >= 0.5 ? 1 : 0;
      if (reduced) {
        current = reducedState;
        render(current);
      } else onScroll();
    };
    const onResize = () => {
      readScale();
      render(current);
    };

    render(current);
    if (introStart === 0) raf = requestAnimationFrame(tick);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    mq.addEventListener("change", onMq);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      mq.removeEventListener("change", onMq);
    };
  }, [distance, smoothing]);

  return (
    <span
      ref={rootRef}
      className={className ? `scroll-brand ${className}` : "scroll-brand"}
      role="img"
      aria-label="AI Creative Lab"
    >
      <svg
        ref={svgRef}
        className="scroll-brand__svg"
        viewBox={`${VB_X} ${VB_Y} ${VB_W} ${VB_H}`}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="200" y="100" width="200" height="300">
            <rect x="200" y="100" width="200" height="300" fill="#fff" />
            {BATTENS.map((d, i) => (
              <path
                key={d}
                ref={(el) => {
                  battenRefs.current[i] = el;
                }}
                d={d}
                pathLength={1}
                fill="none"
                stroke="#000"
                strokeWidth={BATTEN_W}
                strokeLinecap="butt"
                strokeDasharray="1 1"
                strokeDashoffset={1}
              />
            ))}
          </mask>
        </defs>
        <g fill="currentColor" fillRule="evenodd">
          <path className="scroll-brand__bold" d={A_PATH} />
          <path className="scroll-brand__bold" d={I_PATH} />
          {GLYPHS.map((g, i) => (
            <path
              key={i}
              ref={(el) => {
                letterRefs.current[i] = el;
              }}
              className={g.ch === "-" ? "scroll-brand__glyph scroll-brand__hyphen scroll-brand__bold" : "scroll-brand__glyph scroll-brand__bold"}
              d={g.d}
            />
          ))}
          <g ref={sailRef} className="scroll-brand__sail">
            <path d={SAIL_PATH} mask={`url(#${maskId})`} />
          </g>
        </g>
      </svg>
    </span>
  );
}
