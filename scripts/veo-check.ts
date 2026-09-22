import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const temp = await mkdtemp(path.join(os.tmpdir(), 'sop-veo-check-'));
process.env.SOP_DATA_DIR = temp;
try {
  const { requestBody } = await import('../server/veo');
  const { buildVeoPlan } = await import('../shared/veo-plan');
  const t2v = requestBody({ unitId: 'veo-unit-01', prompt: 'scene', mode: 't2v', resolution: '720p', aspectRatio: '9:16', images: [] }, 'scene');
  assert.equal(t2v.model, 'veo_3_1');
  assert(!('images' in t2v));
  assert(!('duration' in t2v));
  const first = 'https://cdn.example.com/first.jpg';
  const last = 'https://cdn.example.com/last.jpg';
  const i2v = requestBody({ unitId: 'veo-unit-01', prompt: 'scene', mode: 'i2v', images: [first, last], resolution: '1080p', aspectRatio: '16:9' }, 'scene');
  assert.equal(i2v.model, 'veo_3_1-fl');
  assert('images' in i2v);
  assert.deepEqual(i2v.images, [first, last]);
  const r2v = requestBody({ unitId: 'veo-unit-01', prompt: 'scene', mode: 'r2v', images: [last, first], resolution: 'lite', aspectRatio: '9:16' }, 'scene');
  assert.equal(r2v.model, 'veo_3_1-components');
  assert('images' in r2v);
  assert.deepEqual(r2v.images, [last, first]);
  assert.equal(r2v.resolution, 'lite');
  const blank = { visual: '', action: '', camera: '', narration: '', onScreenText: '', sound: '', productPresence: '', uncertainty: '', generationPrompt: '' };
  const plan = buildVeoPlan([
    { ...blank, id: 'shot-1', start: 0, end: 3, role: 'hook' as const },
    { ...blank, id: 'shot-2', start: 3, end: 9, role: 'demo' as const },
    { ...blank, id: 'shot-3', start: 9, end: 15, role: 'cta' as const },
  ]);
  assert.deepEqual(plan.map((unit: { start: number; end: number; targetDuration: number; sourceShotIds: string[] }) => [unit.start, unit.end, unit.targetDuration, unit.sourceShotIds]), [[0, 8, 8, ['shot-1', 'shot-2']], [8, 15, 7, ['shot-2', 'shot-3']]]);
  console.log('PASS Veo 3.1 payloads and deterministic 8-second production planning (no provider calls)');
} finally {
  await rm(temp, { recursive: true, force: true });
}
