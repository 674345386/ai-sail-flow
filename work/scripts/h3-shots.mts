// MiniMax H3 shot list for the "lens portal" remix.
// Uses the app's own H3 client (server/minimax-h3.ts) and the app's .env key.
export type Shot = { id: string; title: string; duration: number; refs: string[]; prompt: string };

export const shots: Shot[] = [
  {
    id: 'S1',
    title: 'sunglasses push-in -> through the lens into jungle',
    duration: 5,
    refs: ['sunglasses_day'],
    prompt: `Cinematic luxury sunglasses commercial, one continuous take. A pair of glossy black acetate wayfarer sunglasses with slim silver oval pins on the front corners rests on a pale textured limestone ledge. Warm late-afternoon sun casts crisp horizontal venetian-blind shadows across the cream wall and the stone. The lenses are deep black and mirror a sunlit tropical jungle. Camera: a slow deliberate dolly push-in on the right lens, then the push accelerates and the camera glides straight through the glass into the reflected jungle — palm fronds whip past, sunlight flares, green bokeh, heavy speed blur. Shot on 35mm anamorphic, shallow depth of field, fine natural grain, photoreal product detail, no text, no logo. Audio: soft breeze and distant birds, a rising airy whoosh as the camera enters the lens, no music, no voices.`,
  },
  {
    id: 'S2',
    title: 'jungle rush -> skyline reveal',
    duration: 4,
    refs: ['city'],
    prompt: `Fast first-person flight through dense tropical jungle: giant palm leaves, ferns and vines whip past the lens in strong motion blur, shafts of warm sunlight breaking through the canopy, drifting haze. The foliage suddenly parts to reveal the Manhattan skyline far ahead, the Empire State Building centered in warm afternoon haze. The camera keeps flying forward toward the city as the leaves clear out of frame. Photoreal, cinematic, 35mm anamorphic, heavy speed blur, no text. Audio: rushing leaves, jungle insects, rising wind, no music, no voices.`,
  },
  {
    id: 'S3',
    title: 'midtown skyline flyover',
    duration: 4,
    refs: ['city'],
    prompt: `Aerial FPV flyover across Midtown Manhattan at golden hour: skyscrapers whip past close to the lens in strong motion blur, the Empire State Building rises ahead, warm sunlight and blue haze over the skyline, a river and bridges far below. The camera banks slightly and pushes forward. Photoreal, cinematic, anamorphic, fine grain, no text. Audio: high-altitude wind, distant city rumble, no music, no voices.`,
  },
  {
    id: 'S4',
    title: 'alpine meadow toward snow peak',
    duration: 4,
    refs: ['mountain'],
    prompt: `Fast low tracking shot skimming an alpine wildflower meadow: orange, white and violet flowers streak past in motion blur, dark spruce trees pass on both sides, a massive snow-capped mountain peak fills the distance under a clear blue sky. The camera pushes forward and rises slightly, sunlight glinting on the snow. Photoreal, cinematic, anamorphic, natural grain, no text. Audio: mountain wind, soft grass rustle, no music, no voices.`,
  },
  {
    id: 'S5',
    title: 'shooting star',
    duration: 4,
    refs: ['comet'],
    prompt: `Deep night sky filled with stars and the Milky Way, a bright shooting star streaks across the upper right, trailing a long glowing tail; slow drifting camera, faint nebula glow, subtle film grain. No ground, no horizon, no text. Audio: vast quiet ambience, a faint shimmering tail, no music, no voices.`,
  },
  {
    id: 'S6',
    title: 'hero: night sky in the lenses',
    duration: 4,
    refs: ['sunglasses_night'],
    prompt: `Extreme close-up of the black acetate wayfarer sunglasses with silver oval pins on the pale limestone ledge; warm afternoon venetian-blind shadows still stripe the stone, but inside both lenses a deep night sky glows: the Milky Way and a bright shooting star across the right lens. The camera slowly pulls back to reveal the whole pair, subtle parallax, the starfield alive in the glass, dust motes drifting in the sunbeam. Photoreal macro product photography, 35mm anamorphic, shallow depth of field, cinematic, no text, no logo. Audio: quiet afternoon air, a soft magical shimmer, no music, no voices.`,
  },
];
