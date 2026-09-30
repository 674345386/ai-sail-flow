import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { ColorCardBackdrop } from './ColorCardBackdrop';
import { cardFrameAt, fashionAngleAt, modelFrameAt } from './fashionTiming';

export const FashionColorShowcase = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const clock = cardFrameAt(frame, fps);
  const angle = fashionAngleAt(clock);
  const modelFrame = modelFrameAt(angle);

  return (
    <AbsoluteFill style={{backgroundColor: '#fbfaf8', overflow: 'hidden'}}>
      <ColorCardBackdrop clock={clock} />
      <div style={{
        position: 'absolute', left: 315, top: 1708, width: 450, height: 66, zIndex: 1,
        background: 'radial-gradient(ellipse, rgba(56,40,31,.18), transparent 70%)',
      }} />
      <Img
        name="模特转身 · 与色卡同一旋转进度"
        src={staticFile(`model-matte/${String(modelFrame).padStart(3, '0')}.png`)}
        style={{
          position: 'absolute', left: 69, top: 82, zIndex: 2,
          width: 942, height: 1675, objectFit: 'contain',
          filter: 'drop-shadow(0px 14px 16px rgba(40,28,22,.11))',
        }}
      />
    </AbsoluteFill>
  );
};
