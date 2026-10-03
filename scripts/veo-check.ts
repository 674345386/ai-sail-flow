import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const temp = await mkdtemp(path.join(os.tmpdir(), 'sop-veo-check-'));
process.env.SOP_DATA_DIR = temp;
try {
  const { requestBody } = await import('../server/veo');
  const { buildVeoPlan, clipTiming } = await import('../shared/veo-plan');
  const { buildVeoUnitPrompt } = await import('../shared/export');
  const { demoProject } = await import('../shared/demo');
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
  assert.deepEqual(plan.map(unit => [unit.start, unit.end, unit.targetDuration, unit.sourceShotIds]), [[0, 3, 3, ['shot-1']], [3, 9, 6, ['shot-2']], [9, 15, 6, ['shot-3']]]);
  assert.deepEqual(plan.map(unit => unit.id), ['veo-shot-shot-1', 'veo-shot-shot-2', 'veo-shot-shot-3']);
  assert.deepEqual(clipTiming(3), { sourceSeconds: 3, videoScale: 1, audioTempo: 1 });
  assert.deepEqual(clipTiming(12), { sourceSeconds: 8, videoScale: 1.5, audioTempo: 2 / 3 });
  const project = demoProject('test-project');
  const firstUnit = buildVeoPlan(project.rewrite!.shots)[0];
  const nativePrompt = buildVeoUnitPrompt(project, firstUnit, 'veo-native');
  const visualPrompt = buildVeoUnitPrompt(project, firstUnit, 'tts-subtitles');
  assert(nativePrompt.includes(project.rewrite!.shots[0].narration));
  assert(nativePrompt.includes(project.rewrite!.shots[0].onScreenText));
  assert(!visualPrompt.includes(project.rewrite!.shots[0].narration));
  assert(!visualPrompt.includes(project.rewrite!.shots[0].onScreenText));
  assert.equal(requestBody({ unitId: 'veo-unit-01', prompt: 'raw prompt', mode: 't2v', resolution: '720p', aspectRatio: '9:16', images: [] }, 'raw prompt').prompt, 'raw prompt');
  const { keyframeBasis, keyframeCurrent } = await import('../shared/storyboard');
  const { videoCurrent, nextWorkflowAction } = await import('../shared/workflow');
  const shot = project.rewrite!.shots[0];
  project.rewrite!.shots.forEach(shot => { shot.sourceShotId = shot.id; });
  shot.keyframe = { status: 'completed', basis: keyframeBasis(project, shot), prompt: 'frame direction', model: 'test-image',
    sourceAt: 0, sourceFrameUrl: '/media/source.png', filename: 'recreation-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png',
    url: '/media/recreation-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png', mime: 'image/png' };
  assert(keyframeCurrent(project, shot));
  const prompt = JSON.parse(buildVeoUnitPrompt(project, firstUnit));
  assert.equal(prompt.imageToVideo.keyframe, shot.keyframe.url);
  assert.equal(prompt.storyboard.length, 1);
  const video = { id: 'clip', provider: 'veo-3.1' as const, model: 'veo_3_1-fl' as const, mode: 'i2v' as const,
    status: 'completed' as const, shotId: shot.id, unitId: firstUnit.id, prompt: '', duration: 8, aspectRatio: '9:16' as const,
    keyframeShotId: shot.id, keyframeFilename: shot.keyframe.filename, keyframeBasis: shot.keyframe.basis, startedAt: '' };
  assert(videoCurrent(project, video));
  const { uploadDir } = await import('../server/store');
  const { configureKeyframeStorage, publishKeyframe } = await import('../server/keyframe-storage');
  await writeFile(path.join(uploadDir, shot.keyframe.filename!), Buffer.from('test image'));
  configureKeyframeStorage('https://storage.example.com', 'test-server-secret-key', 'sop-keyframes');
  const originalFetch = globalThis.fetch;
  const calls: { url: string; method: string }[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input), method = init?.method || 'GET';
    calls.push({ url, method });
    if (url.endsWith('/bucket/sop-keyframes')) return Response.json({ id: 'sop-keyframes', public: false });
    if (url.includes('/object/sign/')) return Response.json({ signedURL: '/object/sign/sop-keyframes/frame.png?token=temporary' });
    if (url.includes('/object/sop-keyframes/')) return Response.json({ Key: 'frame.png' });
    throw new Error('Unexpected mocked storage request');
  }) as typeof fetch;
  try {
    const signedUrl = await publishKeyframe(project, shot);
    assert(signedUrl.startsWith('https://storage.example.com/storage/v1/object/sign/'));
    const body = requestBody({ unitId: firstUnit.id, prompt: 'animate', mode: 'i2v', resolution: '720p', aspectRatio: '9:16', images: [signedUrl] }, 'animate');
    assert('images' in body);
    assert.equal(body.images[0], signedUrl);
    assert.equal(await publishKeyframe(project, shot), signedUrl);
    assert.equal(calls.length, 3, 'Reuse a still-valid temporary image URL');
    assert(calls.some(call => call.url.includes(`/object/sop-keyframes/${project.id}/${shot.keyframe!.filename}`)));
  } finally { globalThis.fetch = originalFetch; }
  shot.visual += ' edited';
  assert(!keyframeCurrent(project, shot));
  assert(!videoCurrent(project, video));
  assert.deepEqual(nextWorkflowAction(project), { kind: 'keyframe', shotId: shot.id });
  project.rewrite!.shots.forEach(shot => { shot.keyframe = { ...project.rewrite!.shots[0].keyframe!, basis: keyframeBasis(project, shot) }; });
  assert.deepEqual(nextWorkflowAction(project), { kind: 'completed' }, 'Stop after valid keyframes without requesting any video');
  assert.equal(nextWorkflowAction(project, 'video').kind, 'generation');
  console.log('PASS per-shot i2v mapping, payloads, timing, stale frames and private-storage URL bridge (mocked, no live provider calls)');
} finally {
  await rm(temp, { recursive: true, force: true });
}
