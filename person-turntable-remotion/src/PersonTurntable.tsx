import { Video } from '@remotion/media';
import { AbsoluteFill, staticFile } from 'remotion';

export const PersonTurntable = () => (
  <AbsoluteFill style={{ backgroundColor: '#000000' }}>
    <Video
      name="人物360度转身"
      src={staticFile('turntable-source.mp4')}
      muted
      loop
      objectFit="contain"
      style={{ width: '100%', height: '100%' }}
    />
  </AbsoluteFill>
);
