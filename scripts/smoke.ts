import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import JSZip from 'jszip';
import { analysisSchema, rewriteSchema, validateTimeline, type Project } from '../shared/domain';
import { buildPrompt, subtitles } from '../shared/export';

const exec = promisify(execFile);
const temp = await mkdtemp(path.join(os.tmpdir(), 'sop-smoke-'));
const socket = net.createServer();
socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = (socket.address() as net.AddressInfo).port;
await new Promise<void>(resolve => socket.close(() => resolve()));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.resolve('node_modules/tsx/dist/cli.mjs'), 'server/index.ts', '--production'], {
  cwd: process.cwd(), env: { ...process.env, SOP_PORT: String(port), SOP_DATA_DIR: path.join(temp, 'data'), GEMINI_API_KEY: '', GOOGLE_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stdout.on('data', data => { logs += data.toString(); });
server.stderr.on('data', data => { logs += data.toString(); });
async function request(route: string, method = 'GET', body?: unknown) {
  return fetch(base + route, { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) });
}
function patch(p: Project) { return { revision: p.revision, title: p.title, product: p.product, market: p.market, analysis: p.analysis, rewrite: p.rewrite }; }
let checks = 0;
function pass(label: string) { checks++; console.log(`PASS ${label}`); }
try {
  let ready = false;
  for (let i = 0; i < 70; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try { if ((await request('/api/status')).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert(ready, logs);
  const status = await (await request('/api/status')).json();
  assert.equal(status.model, 'gemini-3.8-flash'); assert.equal(status.configured, false);
  assert.match(await (await request('/')).text(), /SOP Studio/);
  pass('production page and fixed model status');

  let demo: Project = await (await request('/api/projects', 'POST', { demo: true })).json();
  assert(demo.isDemo); analysisSchema.parse(demo.analysis); rewriteSchema.parse(demo.rewrite);
  demo.rewrite!.shots[0].narration = 'Edited narration survives export.';
  demo = await (await request(`/api/projects/${demo.id}`, 'PUT', patch(demo))).json();
  assert.match(buildPrompt(demo), /Edited narration survives export/);
  assert.equal(validateTimeline(demo.analysis!.shots, demo.analysis!.duration), null);
  pass('editable demo persists valid analysis and latest narration');

  const archiveResponse = await request(`/api/projects/${demo.id}/export`);
  assert.equal(archiveResponse.status, 200);
  const archive = await JSZip.loadAsync(await archiveResponse.arrayBuffer());
  assert.equal(Object.keys(archive.files).length, 6);
  assert.match(await archive.file('02-seedance-prompt.txt')!.async('string'), /Edited narration survives export/);
  assert.match(await archive.file('05-subtitles-draft.srt')!.async('string'), /00:00:00,000 --> 00:00:03,000/);
  assert(JSON.parse(await archive.file('manifest.json')!.async('string')).demo);
  pass('ZIP contents, provenance and SRT draft timestamps');

  const outdatedRevision = demo.revision;
  demo.product.name = 'Changed target product';
  demo = await (await request(`/api/projects/${demo.id}`, 'PUT', patch(demo))).json();
  assert(demo.rewriteStale);
  assert.equal((await request(`/api/projects/${demo.id}/export`)).status, 409);
  assert.equal((await request(`/api/projects/${demo.id}`, 'PUT', { ...patch(demo), revision: outdatedRevision })).status, 409);
  pass('source changes invalidate exports and stale writes are rejected');

  let p: Project = await (await request('/api/projects', 'POST', {})).json();
  assert.equal((await request(`/api/projects/${p.id}/jobs/analysis`, 'POST', {})).status, 503);
  const fake = new FormData(); fake.append('file', new Blob(['not a video'], { type: 'video/mp4' }), 'fake.mp4');
  assert.equal((await fetch(`${base}/api/projects/${p.id}/assets/video`, { method: 'POST', body: fake })).status, 400);
  pass('missing credentials do not fake success; disguised files rejected');

  const videoPath = path.join(temp, 'fixture.mp4');
  await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=160x240:r=12', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000', '-t', '1.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', videoPath]);
  const media = new FormData(); media.append('file', new Blob([await readFile(videoPath)], { type: 'video/mp4' }), 'fixture.mp4');
  const upload = await fetch(`${base}/api/projects/${p.id}/assets/video`, { method: 'POST', body: media });
  assert.equal(upload.status, 201, await upload.clone().text());
  p = await upload.json();
  const video = p.assets[0];
  assert(video.duration! >= 1.4); assert.equal(video.width, 160); assert(video.hasAudio);
  const range = await fetch(base + video.url, { headers: { Range: 'bytes=0-100' } });
  assert.equal(range.status, 206); assert.match(range.headers.get('content-type')!, /video\/mp4/);
  assert.equal((await fetch(base + video.thumbnail)).status, 200);
  pass('real multipart video, ffprobe metadata, thumbnail and range playback');

  const jpeg = await (await fetch(base + video.thumbnail)).arrayBuffer();
  for (let i = 0; i < 3; i++) {
    const form = new FormData(); form.append('file', new Blob([jpeg], { type: 'image/jpeg' }), `product-${i}.jpg`);
    assert.equal((await fetch(`${base}/api/projects/${p.id}/assets/product`, { method: 'POST', body: form })).status, 201);
  }
  const extra = new FormData(); extra.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'extra.jpg');
  assert.equal((await fetch(`${base}/api/projects/${p.id}/assets/product`, { method: 'POST', body: extra })).status, 400);
  pass('product images persisted and three-image limit enforced');

  assert.equal((await fetch(`${base}/api/settings`, { method: 'POST', headers: { Origin: 'https://outside.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  p = await (await request(`/api/projects/${p.id}`)).json();
  p.market.platform = 'reels'; p.market.destination = 'shop';
  assert.equal((await request(`/api/projects/${p.id}`, 'PUT', patch(p))).status, 400);
  assert.match(subtitles([{ ...demo.rewrite!.shots[0], start: 61.125, end: 64.25 }]), /00:01:01,125 --> 00:01:04,250/);
  pass('cross-origin rejection, channel/CTA consistency and fractional timecodes');
  console.log(`\n${checks} focused checks passed. No model calls or browser automation.`);
} finally {
  server.kill('SIGTERM');
  if (server.exitCode === null) await Promise.race([once(server, 'exit'), new Promise(resolve => setTimeout(resolve, 1500))]);
  if (path.basename(temp).startsWith('sop-smoke-')) await rm(temp, { recursive: true, force: true });
}
