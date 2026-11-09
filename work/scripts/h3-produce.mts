// Generates the lens-portal shots through the app's MiniMax H3 client.
// Usage: NODE_USE_ENV_PROXY=1 node --import tsx work/scripts/h3-produce.mts S1,S6
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MinimaxH3Client } from '../../server/minimax-h3';
import { shots } from './h3-shots.mts';

process.loadEnvFile('.env');
const root = path.resolve('.');
const outDir = path.join(root, 'work/renux-produce');
const clipDir = path.join(outDir, 'clips');
const refDir = path.join(root, 'work/renux-ref/refs');
fs.mkdirSync(clipDir, { recursive: true });
const manifestPath = path.join(outDir, 'manifest.json');
const manifest: any = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { shots: {}, refs: {} };
const save = () => fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const wanted = (process.argv[2] || 'all').split(',').map(value => value.trim().toUpperCase()).filter(Boolean);
const selected = shots.filter(shot => wanted.includes('ALL') || wanted.includes(shot.id));
const client = new MinimaxH3Client();

async function assetFor(name: string) {
  if (manifest.refs[name]) return manifest.refs[name] as string;
  const filename = path.join(refDir, `${name}.jpg`);
  const bytes = await fs.promises.readFile(filename);
  const assetId = await client.uploadReference(`${name}.jpg`, 'image/jpeg', bytes);
  manifest.refs[name] = assetId;
  save();
  console.log(`[ref] ${name} -> ${assetId}`);
  return assetId;
}

async function run(shot: (typeof shots)[number]) {
  const entry = (manifest.shots[shot.id] ||= { title: shot.title, prompt: shot.prompt, duration: shot.duration, model: 'h3-video', resolution: '1080p', aspectRatio: '16:9' });
  const destination = path.join(clipDir, `${shot.id}.mp4`);
  if (entry.status === 'succeeded' && fs.existsSync(destination)) { console.log(`[${shot.id}] already done`); return; }
  const inputs = [];
  for (const ref of shot.refs) inputs.push({ asset_id: await assetFor(ref), role: 'reference_image' as const });
  if (!entry.requestId) {
    const request = {
      model: 'h3-video' as const,
      prompt: shot.prompt,
      inputs,
      parameters: { duration: shot.duration, resolution: '1080p' as const, aspect_ratio: '16:9' as const, generate_audio: true },
      optimize_prompt: false,
    };
    entry.request = request;
    entry.idempotencyKey ||= randomUUID();
    save();
    console.log(`[${shot.id}] submitting ${shot.duration}s 1080p 16:9 ...`);
    const task = await client.submit(request, entry.idempotencyKey);
    entry.requestId = task.id;
    entry.status = task.status;
    save();
    console.log(`[${shot.id}] task ${task.id}`);
  }
  const task = await client.wait(entry.requestId, (progress, message) => {
    entry.progress = progress;
    entry.message = message;
    save();
    console.log(`[${shot.id}] ${progress}% ${message}`);
  });
  entry.credits = task.credits;
  entry.optimizedPrompt = task.optimized_prompt || undefined;
  const output = task.outputs?.find(item => item.media_type === 'video' && item.download_url);
  if (!output) throw new Error(`${shot.id}: no video output`);
  const size = await client.download(output, destination);
  entry.status = 'succeeded';
  entry.file = destination;
  entry.bytes = size;
  entry.outputAssetId = output.asset_id;
  entry.finishedAt = new Date().toISOString();
  save();
  console.log(`[${shot.id}] saved ${(size / 1e6).toFixed(1)} MB -> ${destination}`);
}

const failed: string[] = [];
await Promise.all(selected.map(shot => run(shot).catch(error => {
  manifest.shots[shot.id] = { ...(manifest.shots[shot.id] || {}), status: 'failed', error: String(error?.message || error), finishedAt: new Date().toISOString() };
  save();
  failed.push(shot.id);
  console.error(`[${shot.id}] FAILED ${error?.message || error}`);
})));
console.log(failed.length ? `failed: ${failed.join(',')}` : 'all selected shots done');
