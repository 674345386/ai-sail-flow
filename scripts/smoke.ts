import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import type { Project } from '../shared/domain';

const exec = promisify(execFile);
const temp = await mkdtemp(path.join(os.tmpdir(), 'sop-smoke-'));
const socket = net.createServer();
socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = (socket.address() as net.AddressInfo).port;
await new Promise<void>(resolve => socket.close(() => resolve()));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts', '--production'], {
  cwd: process.cwd(), env: { ...process.env, SOP_PORT: String(port), SOP_DATA_DIR: path.join(temp, 'data'), SOP_REQUIRE_AUTH: 'false', SOP_AGENT_ENABLED: 'false', SOP_OMNI_API_KEY: '', SOP_VEO_API_KEY: '', SOP_MINIMAX_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stdout.on('data', data => { logs += data.toString(); });
server.stderr.on('data', data => { logs += data.toString(); });
async function request(route: string, method = 'GET', body?: unknown) {
  return fetch(base + route, { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) });
}
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
  assert.equal(status.videoAnalysis.transport, 'agent-frames');
  assert.equal(status.videoGeneration.provider, 'omni_flash-1.2');
  assert.equal(status.videoGeneration.configured, false);
  assert.match(await (await request('/')).text(), /AI Creative Lab/);
  pass('production page and active video provider status');

  const created = await request('/api/projects', 'POST', { title: 'Smoke check' });
  assert.equal(created.status, 201);
  let p: Project = await created.json();
  const revision = p.revision;
  const renamed = await request(`/api/projects/${p.id}`, 'PUT', { revision, title: 'Renamed creative' });
  assert.equal(renamed.status, 200);
  assert.equal((await renamed.json()).title, 'Renamed creative');
  assert.equal((await request(`/api/projects/${p.id}`, 'PUT', { revision, title: 'Conflicting update' })).status, 409);
  pass('creative metadata and revision checks');

  const creative = `/api/projects/${p.id}`;
  assert.equal((await request('/api/studio/projects')).status, 404);
  assert.equal((await request('/api/studio/radar/tools')).status, 404);
  assert.equal((await request(`${creative}/export`)).status, 404);
  for (const route of ['workflow/start', 'jobs/analysis', 'tier/subjects/detect', 'remix/plan', 'generations', 'compose']) {
    assert.equal((await request(`${creative}/${route}`, 'POST', {})).status, 404);
  }
  assert.equal((await request(`${creative}/production`, 'POST', {})).status, 400);
  assert.equal((await request(`${creative}/production/compose`, 'POST', {})).status, 400);
  pass('retired routes return 404 and Agent production routes still validate input');

  const fake = new FormData(); fake.append('file', new Blob(['not a video'], { type: 'video/mp4' }), 'fake.mp4');
  assert.equal((await fetch(`${base}/api/projects/${p.id}/assets/video`, { method: 'POST', body: fake })).status, 400);
  pass('disguised video rejected');

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

  const outside = await fetch(`${base}/api/settings/omni`, { method: 'POST', headers: { Origin: 'https://outside.example', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(outside.status, 403);
  pass('cross-origin configuration request rejected');
  console.log(`\n${checks} focused checks passed. No model calls or browser automation.`);
} finally {
  server.kill('SIGTERM');
  if (server.exitCode === null) await Promise.race([once(server, 'exit'), new Promise(resolve => setTimeout(resolve, 1500))]);
  if (path.basename(temp).startsWith('sop-smoke-')) await rm(temp, { recursive: true, force: true });
}
