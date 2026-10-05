import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createSessionVerifier } from '../server/session-verifier';
import { setShotMediaCacheHeaders } from '../server/media-cache';

function token(exp: number, id = 'session') {
  return `header.${Buffer.from(JSON.stringify({ exp, id })).toString('base64url')}.signature`;
}
let time = 1_800_000_000_000;
let calls = 0;
let release!: () => void;
const gate = new Promise<void>(resolve => { release = resolve; });
const verifier = createSessionVerifier(async () => { calls++; await gate; return true; }, () => time);
const session = token(time / 1000 + 3600);
const simultaneous = Array.from({ length: 12 }, () => verifier.isAllowed(session));
await Promise.resolve();
assert.equal(calls, 1, 'simultaneous API/video/image requests share one remote lookup');
release();
assert((await Promise.all(simultaneous)).every(Boolean));
time += 40_000;
assert(await verifier.isAllowed(session));
assert.equal(calls, 1, 'idle playback after 30 seconds reuses verification');
time += 260_000;
assert(await verifier.isAllowed(session));
assert.equal(calls, 2, 'five-minute cache expires');
verifier.invalidate(session);
assert(await verifier.isAllowed(session));
assert.equal(calls, 3, 'logout invalidates cached verification');
console.log('PASS concurrent verification, idle playback, TTL and logout invalidation');

let shortCalls = 0;
const expiring = token(time / 1000 + 2);
const shortVerifier = createSessionVerifier(async () => { shortCalls++; return time < JSON.parse(Buffer.from(expiring.split('.')[1], 'base64url').toString()).exp * 1000; }, () => time);
assert(await shortVerifier.isAllowed(expiring));
time += 2000;
assert.equal(await shortVerifier.isAllowed(expiring), false);
assert.equal(shortCalls, 2, 'JWT expiry caps cache lifetime');
assert.equal(await shortVerifier.isAllowed(''), false);

let retries = 0;
const retryVerifier = createSessionVerifier(async () => { if (++retries === 1) throw new Error('temporary outage'); return true; });
await assert.rejects(retryVerifier.isAllowed(session), /temporary outage/);
assert(await retryVerifier.isAllowed(session));
assert.equal(retries, 2, 'remote errors do not leave a stuck pending request');
let deniedCalls = 0;
const deniedVerifier = createSessionVerifier(async () => { deniedCalls++; return false; }, () => time);
assert.equal(await deniedVerifier.isAllowed(session), false);
time += 14_000;
assert.equal(await deniedVerifier.isAllowed(session), false);
assert.equal(deniedCalls, 1);
time += 1000;
assert.equal(await deniedVerifier.isAllowed(session), false);
assert.equal(deniedCalls, 2, 'negative results only live for 15 seconds');
console.log('PASS token expiry, empty/denied sessions and retry after remote failure');

// Invalidation during verification must prevent the old request from refilling the cache.
let raceCalls = 0;
let finish!: () => void;
const raceGate = new Promise<void>(resolve => { finish = resolve; });
const raceVerifier = createSessionVerifier(async () => { raceCalls++; await raceGate; return true; });
const oldRequest = raceVerifier.isAllowed(session);
await Promise.resolve();
raceVerifier.invalidate(session);
finish();
await oldRequest;
await raceVerifier.isAllowed(session);
assert.equal(raceCalls, 2);
console.log('PASS logout during an in-flight lookup cannot refill its cache');

let boundedCalls = 0;
const boundedVerifier = createSessionVerifier(async value => { boundedCalls++; return value !== 'denied'; }, () => time);
const sessions = Array.from({ length: 129 }, (_, index) => token(time / 1000 + 3600, String(index)));
for (const value of sessions) assert(await boundedVerifier.isAllowed(value));
assert(await boundedVerifier.isAllowed(sessions[128]));
assert.equal(boundedCalls, 129, 'reaching the cache limit preserves recent sessions');
assert(await boundedVerifier.isAllowed(sessions[0]));
assert.equal(boundedCalls, 130, 'only the oldest session is evicted');
assert.equal(await boundedVerifier.isAllowed('denied'), false);
assert(await boundedVerifier.isAllowed(sessions[128]), 'different sessions do not share authorization results');
console.log('PASS bounded cache eviction and isolation between session tokens');

const temp = await mkdtemp(path.join(os.tmpdir(), 'sop-media-loading-'));
const clip = 'shot-0123456789abcdef01234567.mp4';
const frame = 'shot-0123456789abcdef01234567-0.jpg';
await Promise.all([writeFile(path.join(temp, clip), Buffer.alloc(256)), writeFile(path.join(temp, frame), Buffer.alloc(32)), writeFile(path.join(temp, 'original.mp4'), Buffer.alloc(256))]);
const app = express();
app.use('/media', express.static(temp, { setHeaders: setShotMediaCacheHeaders }));
const server = app.listen(0, '127.0.0.1');
try {
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/media/`;
  const full = await fetch(base + clip);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('cache-control'), 'private, max-age=300, immutable');
  await full.arrayBuffer();
  const partial = await fetch(base + clip, { headers: { Range: 'bytes=0-31' } });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get('content-range'), 'bytes 0-31/256');
  assert.equal(partial.headers.get('cache-control'), full.headers.get('cache-control'));
  assert.equal((await partial.arrayBuffer()).byteLength, 32);
  // Node fetch otherwise adds no-cache to conditional requests, forcing a 200 response.
  const conditional = await fetch(base + clip, { headers: { 'If-None-Match': full.headers.get('etag')!, 'Cache-Control': 'max-age=0' } });
  assert.equal(conditional.status, 304);
  assert.equal(conditional.headers.get('cache-control'), full.headers.get('cache-control'));
  const image = await fetch(base + frame);
  assert.equal(image.headers.get('cache-control'), full.headers.get('cache-control'));
  await image.arrayBuffer();
  const original = await fetch(base + 'original.mp4');
  assert.equal(original.headers.get('cache-control'), 'public, max-age=0');
  await original.arrayBuffer();
  console.log('PASS private clip/frame cache headers, byte ranges, conditional requests and unchanged original-media policy');
} finally {
  await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
  await rm(temp, { recursive: true, force: true });
}
