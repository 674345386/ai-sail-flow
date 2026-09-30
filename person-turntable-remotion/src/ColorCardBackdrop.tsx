import {
  AbsoluteFill,
  Easing,
  interpolate,
} from "remotion";
import { Fragment, type CSSProperties, type FC } from "react";
import { fashionAngleAt } from "./fashionTiming";

type ColorCard = { name: string; code: string; color: string };

const palette: ColorCard[] = [
  { name: "PALE AQUA", code: "13-4409 TCX", color: "#a9dce2" },
  { name: "DUSTY BLUE", code: "15-3917 TCX", color: "#9cb3d0" },
  { name: "COBALT BLUE", code: "JACKET", color: "#176bd5" },
  { name: "TANGERINE", code: "16-1359 TCX", color: "#ed6a3b" },
  { name: "CITRUS", code: "13-0758 TCX", color: "#e5d159" },
  { name: "LILAC", code: "15-3817 TCX", color: "#b5a4d2" },
  { name: "MINT", code: "14-6330 TCX", color: "#8bcbb0" },
  { name: "MOCHA BROWN", code: "SKIRT / BOOTS", color: "#785340" },
  { name: "ROSE", code: "17-1929 TCX", color: "#e47791" },
  { name: "ORCHID", code: "18-3224 TCX", color: "#a456a0" },
  { name: "FOREST GREEN", code: "KNIT", color: "#13513d" },
  { name: "DENIM", code: "18-4027 TCX", color: "#45719f" },
  { name: "SAND", code: "13-1008 TCX", color: "#d8be9b" },
  { name: "TOMATO", code: "17-1563 TCX", color: "#e84f3b" },
  { name: "LEMON", code: "12-0752 TCX", color: "#f0dc54" },
  { name: "JADE", code: "17-5734 TCX", color: "#1d927f" },
  { name: "PLUM", code: "19-1718 TCX", color: "#564456" },
  { name: "CORAL", code: "16-1546 TCX", color: "#ee927c" },
];

const ringCount = 32;
const fanCards = Array.from({ length: ringCount }, (_, index) => ({
  item: palette[index % palette.length],
  angle: (index / ringCount) * Math.PI * 2,
}));

const fanCenter = { x: 540, y: 2160 };
const fanRadius = 328;
const ticketWidth = 138;
const ticketHeight = 625;

const targets = [
  { x: 345, y: 340, w: 660, h: 530, rotation: -15, strip: "left" as const },
  { x: 785, y: 860, w: 620, h: 500, rotation: 18, strip: "right" as const },
  { x: 345, y: 1360, w: 660, h: 510, rotation: -16, strip: "left" as const },
];
const featured = [2, 10, 7];
const popFrames = [91, 144, 197];
const flightEase = Easing.bezier(0.3, 0.1, 0.25, 1);

const zigzagClip = (steps = 18) => {
  const points: string[] = ["0% 0%"];
  for (let i = 1; i <= steps; i++) points.push(`${(i / steps) * 100}% ${i % 2 ? 1.2 : 0}%`);
  for (let i = 1; i <= steps; i++) points.push(`${i % 2 ? 98.8 : 100}% ${(i / steps) * 100}%`);
  for (let i = 1; i <= steps; i++) points.push(`${100 - (i / steps) * 100}% ${i % 2 ? 98.8 : 100}%`);
  for (let i = 1; i <= steps; i++) points.push(`${i % 2 ? 1.2 : 0}% ${100 - (i / steps) * 100}%`);
  return `polygon(${points.join(",")})`;
};

const ticketClip = zigzagClip(22);
const swatchClip = zigzagClip(20);

const clampInterpolate = (frame: number, input: number[], output: number[], easing = flightEase) =>
  interpolate(frame, input, output, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });

const wheelAt = fashionAngleAt;

const sourceAt = (index: number, frame: number) => {
  const angle = fanCards[index].angle + wheelAt(frame);
  return {
    x: fanCenter.x + Math.sin(angle) * fanRadius,
    y: fanCenter.y - Math.cos(angle) * fanRadius,
    angle,
  };
};

const closestFanIndexForAngle = (angle: number, frame: number) => {
  const baseAngle = angle - wheelAt(frame);
  let closestIndex = 0;
  let closestDistance = Infinity;
  fanCards.forEach((card, index) => {
    const difference = Math.atan2(Math.sin(card.angle - baseAngle), Math.cos(card.angle - baseAngle));
    const distance = Math.abs(difference);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });
  return closestIndex;
};

const Ticket: FC<{ item: ColorCard; style: CSSProperties }> = ({ item, style }) => (
  <div
    style={{
      position: "absolute",
      overflow: "hidden",
      clipPath: ticketClip,
      backgroundColor: "#fbfaf8",
      boxShadow: "0 24px 38px rgba(30,26,23,.2)",
      ...style,
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: "19% 0 0",
        backgroundColor: item.color,
        backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,.08) 0px, rgba(255,255,255,.08) 1px, transparent 1px, transparent 4px), repeating-linear-gradient(90deg, rgba(0,0,0,.045) 0px, rgba(0,0,0,.045) 1px, transparent 1px, transparent 5px)",
        backgroundBlendMode: "soft-light",
      }}
    />
    <div style={{ position: "absolute", left: "8%", top: "4.5%", color: "#20211f", fontFamily: "Arial, sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: ".025em", whiteSpace: "nowrap" }}>
      {item.code}
    </div>
    <div style={{ position: "absolute", left: "8%", top: "11%", color: "#383733", fontFamily: "Arial, sans-serif", fontWeight: 600, fontSize: 11, letterSpacing: ".07em", whiteSpace: "nowrap" }}>
      {item.name}
    </div>
    <div style={{ position: "absolute", top: "19%", left: "6%", right: "6%", height: 1, background: "rgba(45,42,38,.2)" }} />
  </div>
);

const Swatch: FC<{
  item: ColorCard;
  target: (typeof targets)[number];
  style: CSSProperties;
}> = ({ item, target, style }) => (
  <div
    style={{
      position: "absolute",
      overflow: "hidden",
      clipPath: swatchClip,
      backgroundColor: item.color,
      backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,.075) 0px, rgba(255,255,255,.075) 1px, transparent 1px, transparent 5px), repeating-linear-gradient(90deg, rgba(0,0,0,.04) 0px, rgba(0,0,0,.04) 1px, transparent 1px, transparent 6px)",
      backgroundBlendMode: "soft-light",
      boxShadow: "0 28px 44px rgba(30,26,23,.16)",
      ...style,
    }}
  >
    {target.strip === "right" && <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "17%", background: "#fbfaf8" }} />}
    {target.strip === "left" && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "17%", background: "#fbfaf8" }} />}
    {target.strip === "bottom" && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "17%", background: "#fbfaf8" }} />}
    <div
      style={{
        position: "absolute",
        ...(target.strip === "right" ? { right: "1.5%", top: "50%", width: "14%", translate: "0 -50%", rotate: "90deg" } : {}),
        ...(target.strip === "left" ? { left: "1.5%", top: "50%", width: "14%", translate: "0 -50%", rotate: "-90deg" } : {}),
        ...(target.strip === "bottom" ? { left: "56%", bottom: "2.5%", width: "40%", translate: "-50% 0" } : {}),
        display: "grid",
        gap: 8,
        justifyItems: "center",
        color: "#20211f",
        fontFamily: "Arial, sans-serif",
        fontWeight: 700,
        textAlign: "center",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: 31, letterSpacing: ".02em" }}>{item.name}</span>
      <span style={{ fontSize: 23 }}>{item.code}</span>
    </div>
  </div>
);

export const ColorCardBackdrop: FC<{clock: number}> = ({clock}) => {
  const frame = clock;
  const fps = 80;
  const wheelAngle = wheelAt(frame);

  return (
    <AbsoluteFill style={{ backgroundColor: "#fbfaf8", overflow: "hidden", zIndex: 0 }}>
      {fanCards.map(({ item, angle }, index) => {
        const currentAngle = angle + wheelAngle;
        const x = fanCenter.x + Math.sin(currentAngle) * fanRadius;
        const y = fanCenter.y - Math.cos(currentAngle) * fanRadius;
        return (
          <Ticket
            key={`fan-${index}`}
            item={item}
            style={{
              left: x,
              top: y,
              width: ticketWidth,
              height: ticketHeight,
              marginLeft: -ticketWidth / 2,
              marginTop: -ticketHeight / 2,
              rotate: `${(currentAngle * 180) / Math.PI}deg`,
              zIndex: index + 1,
            }}
          />
        );
      })}

      {featured.map((paletteIndex, index) => {
        const item = palette[paletteIndex];
        const target = targets[index];
        const start = popFrames[index];
        const launchAngle = Math.asin((target.x - fanCenter.x) / fanRadius);
        const source = sourceAt(closestFanIndexForAngle(launchAngle, start), start);
        const rawProgress = clampInterpolate(frame, [start, start + 104], [0, 1]);
        const arc = Math.sin(rawProgress * Math.PI) * 112;
        const appearance = clampInterpolate(frame, [start, start + 4], [0, 1]);
        const drift = frame > start + 40 ? Math.sin((frame / fps) * 1.1 + index * 1.4) * 5 : 0;
        const cardX = source.x + (target.x - source.x) * rawProgress;
        const cardY = source.y + (target.y - source.y) * rawProgress - arc;
        const cardRotation = source.angle + ((target.rotation * Math.PI) / 180 - source.angle) * rawProgress;

        return (
          <Fragment key={`pop-${index}`}>
            <Swatch
              item={item}
              target={target}
              style={{
                left: cardX,
                top: cardY + drift * rawProgress,
                width: target.w,
                height: target.h,
                marginLeft: -target.w / 2,
                marginTop: -target.h / 2,
                rotate: `${(cardRotation * 180) / Math.PI + (1 - rawProgress) * 3}deg`,
                opacity: appearance,
                scale: `${0.2 + rawProgress * 0.8}`,
                zIndex: 100 + index,
              }}
            />
          </Fragment>
        );
      })}

      <AbsoluteFill
        style={{
          background: "linear-gradient(180deg, rgba(251,250,248,0) 72%, rgba(251,250,248,.12) 100%)",
          pointerEvents: "none",
          zIndex: 200,
        }}
      />
    </AbsoluteFill>
  );
};
