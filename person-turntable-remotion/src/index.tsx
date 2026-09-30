import { Composition, registerRoot } from 'remotion';
import { PersonTurntable } from './PersonTurntable';
import { FashionColorShowcase } from './FashionColorShowcase';

const Root = () => (
  <>
    <Composition
      id="FashionColorShowcase"
      component={FashionColorShowcase}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={270}
    />
    <Composition
      id="PersonTurntable"
      component={PersonTurntable}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={240}
    />
    <Composition
      id="PersonTurntableLoop"
      component={PersonTurntable}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={480}
    />
  </>
);

registerRoot(Root);
