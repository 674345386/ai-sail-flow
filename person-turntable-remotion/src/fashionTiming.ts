import { Easing, interpolate } from 'remotion';

// Reference animation uses an 80 fps clock, spins 2.4 revolutions by 6.5s,
// then holds. Both the backdrop and model read this same clock and angle.
export const cardFrameAt = (frame: number, fps: number) => frame * 80 / fps;

export const fashionAngleAt = (cardFrame: number) => interpolate(
  cardFrame, [0, 400, 520], [0, Math.PI * 4, Math.PI * 4.8],
  {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: [Easing.linear, Easing.bezier(0.3, 0.45, 0.65, 1)],
  },
);

// Approximate view-angle calibration from the generated turntable. Sampling
// by angle compensates for the AI clip's uneven speed. No new AI request.
export const modelFrameAt = (angle: number) => {
  const degrees = ((angle * 180 / Math.PI) % 360 + 360) % 360;
  const seconds = interpolate(
    degrees,
    [0, 45, 90, 135, 180, 225, 270, 315, 360],
    [0, 0.75, 1.55, 2.2, 3.2, 4.25, 4.85, 5.5, 6.25],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );
  return Math.min(150, Math.round(seconds * 24));
};
