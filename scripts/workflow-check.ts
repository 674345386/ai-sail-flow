import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const exec = promisify(execFile);
const temp = await mkdtemp(path.join(os.tmpdir(), 'sop-workflow-check-'));
process.env.SOP_DATA_DIR = temp;
process.env.GEMINI_API_KEY = 'test-only';
process.env.SOP_GEMINI_BASE_URL = 'https://models.example.test/v1';
process.env.SOP_VEO_API_KEY = 'test-only';
const originalFetch = globalThis.fetch;
try {
  const { createProject, saveProject, getProject, uploadDir } = await import('../server/store');
  const { demoProject } = await import('../shared/demo');
  const { buildVeoPlan } = await import('../shared/veo-plan');
  const { buildVeoUnitPrompt } = await import('../shared/export');
  const { finalVideo, nextWorkflowAction, workflowBusy } = await import('../shared/workflow');
  const { startWorkflow, setWorkflowMode } = await import('../server/workflow');
  const seed = demoProject(randomUUID());
  seed.analysis!.duration = 8;
  seed.analysis!.shots = [{ ...seed.analysis!.shots[0], start: 0, end: 8 }];
  seed.rewrite!.shots = [{ ...seed.rewrite!.shots[0], start: 0, end: 8 }];
  const filename = `veo-${randomUUID()}.mp4`;
  await exec('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=96x160:d=8:r=10', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-c:v', 'libx264', '-c:a', 'aac', '-t', '8', path.join(uploadDir, filename)], { timeout: 20_000 });
  const fixture = await readFile(path.join(uploadDir, filename));
  let project = createProject();
  project = saveProject({ ...project, product: seed.product, assets: [{ id: randomUUID(), kind: 'video', filename, name: 'reference.mp4', mime: 'video/mp4', size: fixture.length, url: `/media/${filename}`, duration: 8 }], productionMode: 'veo-native' });
  assert.equal(nextWorkflowAction(project).kind, 'analysis');
  let analyzeCalls = 0, rewriteCalls = 0, submits = 0, polls = 0;
  let submittedPrompt = '';
  globalThis.fetch = async (url, options) => {
    const target = String(url);
    if (target.includes(':generateContent')) {
      analyzeCalls++;
      setWorkflowMode(project.id, 'manual');
      return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(seed.analysis) }] } }] });
    }
    if (target.endsWith('/chat/completions')) {
      rewriteCalls++;
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(seed.rewrite) } }] });
    }
    if (target === 'https://gaorui.cc/v1/videos' && options?.method === 'POST') {
      submits++; submittedPrompt = JSON.parse(String(options.body)).prompt;
      return Response.json({ id: 'mock-task-1' });
    }
    if (target.endsWith('/videos/mock-task-1')) {
      polls++;
      if (polls === 1) throw new Error('模拟轮询连接中断');
      return Response.json({ status: 'completed', video_url: 'https://media.example.test/fixture.mp4' });
    }
    if (target === 'https://media.example.test/fixture.mp4') return new Response(fixture);
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
  startWorkflow(project.id, 1);
  project = await stopped();
  assert.equal(project.workflow?.status, 'paused');
  assert(project.analysis && !project.rewrite, 'Takeover must preserve analysis and stop before rewrite');
  assert.equal(project.workflowMode, 'manual');
  startWorkflow(project.id, 0);
  project = await stopped();
  assert.equal(project.workflow?.status, 'needs-input');
  assert(project.rewrite && !project.rewriteStale);
  assert.equal(submits, 0, 'A zero generation limit must prevent submission');
  const unit = buildVeoPlan(project.rewrite!.shots)[0];
  const rawPrompt = 'Keep this exact editable prompt. No JSON format is required.';
  project = saveProject({ ...project, veoPromptDrafts: { [`veo-native:${unit.id}`]: { prompt: rawPrompt, basis: buildVeoUnitPrompt(project, unit) } } });
  startWorkflow(project.id, 1);
  project = await stopped();
  assert.equal(project.workflow?.status, 'failed');
  assert.equal(project.generatedVideos[0].requestId, 'mock-task-1');
  assert.equal(project.workflow?.newClipCount, 1);
  assert.equal(submittedPrompt, rawPrompt, 'Automatic continuation must preserve the edited prompt');
  startWorkflow(project.id, 1);
  project = await stopped();
  assert.equal(project.workflow?.status, 'completed');
  assert.equal(analyzeCalls, 1);
  assert.equal(rewriteCalls, 1);
  assert.equal(submits, 1, 'Recovery must reuse the paid task ID');
  const final = finalVideo(project);
  assert(final && final.duration === 8);
  const info = JSON.parse((await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', path.join(uploadDir, final.filename)])).stdout);
  assert(info.streams.some((stream: { codec_type: string }) => stream.codec_type === 'audio'));
  assert(Math.abs(Number(info.format.duration) - 8) < 0.1);
  assert.equal(project.jobHistory?.length, 5);
  console.log('PASS automatic stages, takeover, budget stop, exact edited prompt, task recovery and native final video (all provider responses mocked)');
} finally {
  globalThis.fetch = originalFetch;
  await rm(temp, { recursive: true, force: true });
}
