import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const exec = promisify(execFile);
const temp = await mkdtemp(path.join(os.tmpdir(), 'sop-workflow-check-'));
const fixtureBin = path.join(temp, 'codex-fixture');
const turnLog = path.join(temp, 'turn.json');
await writeFile(fixtureBin, `#!${process.execPath}
const fs = require('node:fs');
const readline = require('node:readline');
readline.createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line);
  if (!request.id) return;
  let result = {};
  if (request.method === 'model/list') result = { data: [{ model: 'workflow-test-vision' }] };
  if (request.method === 'thread/start') result = { thread: { id: 'workflow-thread' } };
  if (request.method === 'turn/start') result = { turn: { id: 'workflow-turn' } };
  console.log(JSON.stringify({ id: request.id, result }));
  if (request.method === 'turn/start') fs.writeFileSync(process.env.SOP_WORKFLOW_TURN_LOG, JSON.stringify({ pid: process.pid, model: request.params.model }));
});
`, { mode: 0o700 });
process.env.SOP_DATA_DIR = temp;
process.env.SOP_AGENT_CODEX_BIN = fixtureBin;
process.env.SOP_AGENT_PROVIDER = 'codex';
process.env.SOP_AGENT_MODEL = 'gpt-6.1-terra';
process.env.SOP_WORKFLOW_TURN_LOG = turnLog;
process.env.GEMINI_API_KEY = 'test-only';
process.env.SOP_GEMINI_BASE_URL = 'https://models.example.test/v1';
process.env.SOP_IMAGE_API_KEY = 'test-only';
process.env.SOP_MINIMAX_API_KEY = 'test-only';
process.env.SOP_MINIMAX_BASE_URL = 'https://minimax.example.test/v1';
delete process.env.SOP_VEO_API_KEY;
const originalFetch = globalThis.fetch;
let agentPid: number | undefined;
try {
  const { createProject, saveProject, getProject, uploadDir } = await import('../server/store');
  const { demoProject } = await import('../shared/demo');
  const { buildVeoPlan } = await import('../shared/veo-plan');
  const { buildVeoUnitPrompt } = await import('../shared/export');
  const { finalVideo, nextWorkflowAction, workflowBusy } = await import('../shared/workflow');
  const { startWorkflow, setWorkflowMode } = await import('../server/workflow');
  const { setAgentModel } = await import('../server/creative-agent');
  const { pendingReferenceAnalysis } = await import('../server/agent-video-analysis');
  await mkdir(uploadDir, { recursive: true });
  const seed = demoProject(randomUUID());
  const focus = { category: 'product' as const, text: '保持杯体外观', selected: true };
  seed.analysis!.duration = 8;
  seed.analysis!.focusPoints = [{ ...focus, id: 'focus', source: 'ai', userEdited: false }];
  seed.analysis!.shots = [{ ...seed.analysis!.shots[0], start: 0, end: 8, subject: '杯子', effects: '', transition: '', reconstructionPrompt: 'A coffee cup.', evidenceFrames: [{ at: 0.5, reason: '杯体' }], focusPoints: seed.analysis!.focusPoints }];
  seed.rewrite!.shots = [{ ...seed.rewrite!.shots[0], start: 0, end: 8, sourceShotId: 'shot-1', keyframePrompt: 'A coffee cup on a desk.' }];
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=', 'base64');
  const productFilename = `${randomUUID()}.png`;
  await writeFile(path.join(uploadDir, productFilename), image);
  const filename = `veo-${randomUUID()}.mp4`;
  await exec('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=96x160:d=8:r=10', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-c:v', 'libx264', '-c:a', 'aac', '-t', '8', path.join(uploadDir, filename)], { timeout: 20_000 });
  const fixture = await readFile(path.join(uploadDir, filename));
  let project = createProject();
  project = saveProject({ ...project, product: seed.product, market: { ...project.market, duration: 'original' }, assets: [{ id: randomUUID(), kind: 'video', filename, name: 'reference.mp4', mime: 'video/mp4', size: fixture.length, url: `/media/${filename}`, duration: 8 }, { id: randomUUID(), kind: 'product', filename: productFilename, name: 'product.png', mime: 'image/png', size: image.length, url: `/media/${productFilename}` }], productionMode: 'veo-native' });
  assert.equal(nextWorkflowAction(project).kind, 'analysis');
  await setAgentModel(project.id, 'workflow-test-vision');
  let rewriteCalls = 0, submits = 0, downloads = 0;
  let submittedPrompt = '';
  globalThis.fetch = async (url, options) => {
    const target = String(url);
    if (target.endsWith('/images/edits')) return Response.json({ data: [{ b64_json: image.toString('base64') }] });
    if (target === 'https://minimax.example.test/v1/uploads' && options?.method === 'POST') {
      assert.match(JSON.parse(String(options.body)).filename, /^recreation-/);
      return Response.json({ asset_id: 'mock-first-frame', reused: true, state: 'READY' });
    }
    if (target.endsWith('/chat/completions')) {
      rewriteCalls++;
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(seed.rewrite) } }] });
    }
    if (target === 'https://minimax.example.test/v1/generations' && options?.method === 'POST') {
      const body = JSON.parse(String(options.body));
      assert.equal(body.model, 'h3-video-frames');
      assert.deepEqual(body.inputs, [{ asset_id: 'mock-first-frame', role: 'first_frame' }]);
      assert.deepEqual(body.parameters, { duration: 8, resolution: '720p', aspect_ratio: project.market.aspectRatio, generate_audio: true });
      assert(new Headers(options.headers).get('Idempotency-Key'));
      submits++; submittedPrompt = body.prompt;
      return Response.json({ id: 'mock-task-1', status: 'queued' });
    }
    if (target === 'https://minimax.example.test/v1/generations/mock-task-1') {
      return Response.json({ id: 'mock-task-1', status: 'succeeded', outputs: [{ asset_id: 'mock-output', media_type: 'video', download_url: 'https://media.example.test/fixture.mp4' }] });
    }
    if (target === 'https://media.example.test/fixture.mp4') {
      if (++downloads === 1) return new Response(null, { status: 503 });
      return new Response(fixture);
    }
    throw new Error(`Unexpected network call blocked: ${target}`);
  };
  async function stopped() {
    const deadline = Date.now() + 30_000;
    while (workflowBusy(getProject(project.id)!)) {
      if (Date.now() > deadline) throw new Error('Mock workflow timed out');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    await new Promise(resolve => setTimeout(resolve, 20));
    return getProject(project.id)!;
  }
  startWorkflow(project.id, 1, 'video');
  let turn: { pid: number; model: string } | undefined;
  for (let attempt = 0; !turn && attempt < 250 && workflowBusy(getProject(project.id)!); attempt++) {
    turn = await readFile(turnLog, 'utf8').then(text => JSON.parse(text)).catch(() => undefined);
    if (!turn) await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert(turn, `The automatic analysis should start a creative Agent turn: ${getProject(project.id)?.workflow?.message}`);
  agentPid = turn.pid;
  assert.equal(turn.model, 'workflow-test-vision');
  const pausing = setWorkflowMode(project.id, 'manual');
  const analysis = pendingReferenceAnalysis(pausing);
  assert(analysis?.kind === 'analysis');
  await analysis.save({
    result: seed.analysis!,
    meta: { mode: 'sampled-frames', transport: 'agent-frames', audioSubmitted: false, requestedModel: turn.model, analyzedAt: new Date().toISOString() },
    scenes: [{ title: '杯子', visual: '杯体', shotCount: 1, frameAt: 0.5, start: 0, end: 8 }],
  });
  project = await stopped();
  assert.equal(project.workflow?.status, 'paused');
  assert(project.analysis && !project.rewrite, 'Takeover must preserve analysis and stop before rewrite');
  assert.equal(project.analysisMeta?.requestedModel, 'workflow-test-vision');
  assert.equal(project.workflowMode, 'manual');
  startWorkflow(project.id, 0, 'video');
  project = await stopped();
  assert.equal(project.workflow?.status, 'needs-input');
  assert(project.rewrite && !project.rewriteStale);
  assert.equal(submits, 0, 'A zero generation limit must prevent submission');
  const unit = buildVeoPlan(project.rewrite!.shots)[0];
  const shot = project.rewrite!.shots[0];
  const legacy = {
    id: randomUUID(), provider: 'veo-3.1' as const, model: 'veo_3_1-fl' as const, shotId: shot.id, unitId: unit.id, mode: 'i2v' as const,
    requestId: 'old-veo-task', status: 'failed' as const, prompt: 'Previous Veo clip.', duration: 8, aspectRatio: project.market.aspectRatio,
    startedAt: new Date().toISOString(), keyframeShotId: shot.id, keyframeFilename: shot.keyframe!.filename, keyframeBasis: shot.keyframe!.basis,
  };
  assert.equal(nextWorkflowAction({ ...project, generatedVideos: [{ ...legacy, status: 'completed', filename }] }, 'video').kind, 'compose');
  const rawPrompt = 'Keep this exact editable prompt. No JSON format is required.';
  project = saveProject({ ...project, generatedVideos: [legacy], veoPromptDrafts: { [`veo-native:${unit.id}`]: { prompt: rawPrompt, basis: buildVeoUnitPrompt(project, unit) } } });
  startWorkflow(project.id, 1, 'video');
  project = await stopped();
  assert.equal(project.workflow?.status, 'failed');
  assert.equal(project.generatedVideos.find(video => video.provider === 'minimax-h3')?.requestId, 'mock-task-1');
  assert.equal(project.workflow?.newClipCount, 1);
  assert.equal(submittedPrompt, rawPrompt, 'Automatic continuation must preserve the edited prompt');
  startWorkflow(project.id, 1, 'video');
  project = await stopped();
  assert.equal(project.workflow?.status, 'completed');
  assert.equal(rewriteCalls, 1);
  assert.equal(submits, 1, 'Recovery must reuse the paid task ID');
  assert.equal(downloads, 2, 'Recovery must download the original H3 result');
  const final = finalVideo(project);
  assert(final && final.duration === 8);
  const info = JSON.parse((await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', path.join(uploadDir, final.filename)])).stdout);
  assert(info.streams.some((stream: { codec_type: string }) => stream.codec_type === 'audio'));
  assert(Math.abs(Number(info.format.duration) - 8) < 0.1);
  assert.equal(project.jobHistory?.length, 5);
  console.log('PASS automatic stages, takeover, H3 routing, budget stop, exact edited prompt, task recovery and native final video (all provider responses mocked)');
} finally {
  globalThis.fetch = originalFetch;
  if (agentPid) process.kill(agentPid);
  await rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}
