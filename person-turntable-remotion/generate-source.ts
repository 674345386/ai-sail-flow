import { randomUUID } from 'node:crypto';
import { copyFile, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

process.loadEnvFile(path.resolve('.env'));
const root = path.resolve('person-turntable-remotion');
const { generateVideo, resumeVideo } = await import('../server/veo');
const prompt = `Create one continuous photorealistic fashion turntable shot lasting exactly 8 seconds. The first and last reference images depict the SAME adult woman in the SAME pose. Preserve her face, black chin-length bob haircut with bangs, cobalt-blue oversized jacket with brown collar lining, dark-green ribbed turtleneck, brown pleated mini skirt, brown knee-high heeled leather boots, and both hands resting in her jacket pockets. Preserve her proportions and all garment colors and textures.
The entire woman smoothly rotates exactly one full 360-degree revolution around a vertical axis through the middle of her body, like a rigid mannequin on an invisible motorized turntable. Rotate steadily in one direction: front at 0s, her right profile at 2s, full back at 4s, her left profile at 6s, and the original front-facing pose at 8s. Her head, torso, jacket, skirt, legs and boots rotate together. Show the entire body including both boot soles throughout. No walking, no independent head turning, no dancing, no arm motion. Keep the hands in pockets and preserve the same leg stance throughout. Invent a plausible consistent back of the jacket, skirt and haircut from the front reference.
Camera locked at the original full-body framing, fixed eye-level camera, no zoom, no orbit, no cuts. Pure solid black seamless background, soft studio lighting on the subject. No platform, no props, no typography, no subtitles, no logos, no music, no speech. Finish aligned to the first frame for a clean loop.`;
await writeFile(path.join(root, 'prompt.txt'), prompt + '\n');
const progress = (percent: number, message: string) => console.log(`${percent}% ${message}`);
let hostedFile = '';
try {
  let remote: {id: string; url: string};
  if (process.argv[2] === '--resume') {
    const saved = JSON.parse(await readFile(path.join(root, 'generation.json'), 'utf8'));
    remote = await resumeVideo(saved.requestId, progress);
  } else {
    // Only the reference is temporarily shared through the existing static
    // tunnel. Remove it after the provider finishes; no server changes needed.
    const tunnels = await (await fetch('http://127.0.0.1:4040/api/tunnels')).json();
    const tunnel = tunnels.tunnels.find((item: any) => item.config.addr === 'http://127.0.0.1:4174');
    if (!tunnel) throw new Error('The existing reference-image tunnel is unavailable.');
    const fileName = `turntable-reference-${randomUUID()}.jpg`;
    hostedFile = path.join('/Users/cppeng/Downloads/project/new-world-game/public/game/generated-assets', fileName);
    await copyFile(path.join(root, 'public/reference.jpg'), hostedFile);
    const referenceUrl = `${tunnel.public_url}/generated-assets/${fileName}`;
    const reference = await fetch(referenceUrl, { signal: AbortSignal.timeout(30000), headers: {'ngrok-skip-browser-warning': '1'} });
    if (!reference.ok || !Buffer.from(await reference.arrayBuffer()).equals(await readFile(hostedFile))) throw new Error('The public reference URL did not return the expected JPEG.');
    remote = await generateVideo({ unitId: 'person-turntable', mode: 'i2v', resolution: '1080p', aspectRatio: '9:16', images: [referenceUrl, referenceUrl], prompt }, prompt, progress, async (requestId) => {
      await writeFile(path.join(root, 'generation.json'), JSON.stringify({ requestId, model: 'veo_3_1-fl', startedAt: new Date().toISOString() }, null, 2));
      console.log(`Submitted task ${requestId}`);
    });
  }
  const result = await fetch(remote.url, { signal: AbortSignal.timeout(120000) });
  if (!result.ok) throw new Error(`Download failed: HTTP ${result.status}`);
  await writeFile(path.join(root, 'public/turntable-source.mp4'), Buffer.from(await result.arrayBuffer()));
  await writeFile(path.join(root, 'generation.json'), JSON.stringify({ requestId: remote.id, model: 'veo_3_1-fl', completedAt: new Date().toISOString() }, null, 2));
  console.log('Saved person-turntable-remotion/public/turntable-source.mp4');
} finally {
  if (hostedFile) await unlink(hostedFile).catch(() => {});
}
