import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { planNarrationTiming, sliceNarrationTiming } from '../shared/narration-timing';

const timing = planNarrationTiming([
  { shotId: 'shot-1', text: 'First sentence', preferredStart: 0, sourceDuration: 1 },
  { shotId: 'shot-3', text: 'Keep the complete third sentence', preferredStart: 4, sourceDuration: 6.6 },
  { shotId: 'shot-4', text: 'Last sentence', preferredStart: 7.2, sourceDuration: 2 },
], 15);
assert(!timing.needsExtension);
assert.equal(timing.speed, 1);
assert(timing.segments[1].end > 7.2, 'Speech must be allowed to continue beyond a 3.2-second visual cut');
assert(timing.segments.every((segment, index) => index === 0 || segment.start >= timing.segments[index - 1].end));
const firstUnit = sliceNarrationTiming(timing.segments, 0, 8);
const secondUnit = sliceNarrationTiming(timing.segments, 8, 15);
const carry = secondUnit.find(segment => segment.shotId === 'shot-3')!;
assert.equal(carry.start, 0);
assert.equal(carry.offset, 8 - timing.segments[1].start);
assert(Math.abs(firstUnit.find(segment => segment.shotId === 'shot-3')!.length + carry.length - 6.6) < 0.001);
assert(!planNarrationTiming([{ shotId: 'x', text: 'x', preferredStart: 0, sourceDuration: 2.1 }], 2).needsExtension);
assert(planNarrationTiming([{ shotId: 'x', text: 'x', preferredStart: 0, sourceDuration: 6.6 }], 3.2).needsExtension);

const exec = promisify(execFile);
const temp = await mkdtemp(path.join(os.tmpdir(), 'sop-compose-check-'));
process.env.SOP_DATA_DIR = temp;
try {
  const { uploadDir } = await import('../server/store');
  const { demoProject } = await import('../shared/demo');
  const { composeVideo, TimingConfirmationRequired, listTtsVoices } = await import('../server/compose');
  const available = await listTtsVoices();
  const voice = available.find(item => item.name === 'Samantha' && item.language === 'en-US');
  assert(voice, 'English system voice is unavailable');
  const id = randomUUID();
  const filename = `veo-${id}.mp4`;
  await exec('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x223344:s=96x160:d=8:r=15',
    '-c:v', 'libx264', '-t', '8', path.join(uploadDir, filename)], { timeout: 30_000 });
  const project = demoProject(randomUUID());
  project.productionMode = 'tts-subtitles';
  const rewrite = project.rewrite!;
  rewrite.shots = [
    { ...project.rewrite!.shots[0], start: 0, end: 0.4, narration: 'Enjoy a fresh cup of coffee every morning.', onScreenText: 'Coffee time' },
    { ...project.rewrite!.shots[0], id: 'shot-2', start: 0.4, end: 8, narration: '', onScreenText: '' },
  ];
  const video = { id, provider: 'veo-3.1' as const, model: 'veo_3_1' as const, unitId: 'veo-unit-01', shotId: 'shot-1',
    productionMode: 'tts-subtitles' as const, status: 'completed' as const, prompt: '', duration: 8, aspectRatio: '9:16' as const,
    filename, startedAt: new Date().toISOString() };
  const rendered = await composeVideo(project, [video], voice.name, () => {});
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', path.join(uploadDir, rendered.filename)]);
  const info = JSON.parse(stdout);
  assert(info.streams.some((stream: { codec_type: string }) => stream.codec_type === 'video'));
  assert(info.streams.some((stream: { codec_type: string }) => stream.codec_type === 'audio'));
  assert(Math.abs(Number(info.format.duration) - 8) < 0.2);
  const caption = rendered.renderTrace.captionCues.find(cue => cue.caption)!;
  const track = rendered.renderTrace.voiceSegments[0];
  assert(caption.end > 0.4, 'The complete sentence must not be clipped at the visual cut');
  assert.equal(caption.end, track.start + track.length);
  assert((await readFile(path.join(uploadDir, rendered.subtitleFilename), 'utf8')).includes(rewrite.shots[0].narration));

  rewrite.shots = [{ ...rewrite.shots[0], end: 0.5 }];
  const filesBefore = await readdir(uploadDir);
  let approval = '';
  await assert.rejects(() => composeVideo(project, [video], voice.name, () => {}), error => {
    assert(error instanceof TimingConfirmationRequired);
    assert(error.notice.requiredDuration > 0.5);
    approval = error.notice.basis;
    return true;
  });
  assert.deepEqual(await readdir(uploadDir), filesBefore, 'Do not create a longer video before approval');
  const extended = await composeVideo(project, [video], voice.name, () => {}, approval);
  assert(extended.duration > 0.5 && extended.renderTrace.extendedBy > 0);
  assert(extended.renderTrace.filterGraph.includes('tpad=stop_mode=clone'));
  const extendedInfo = JSON.parse((await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', path.join(uploadDir, extended.filename)])).stdout);
  assert(Math.abs(Number(extendedInfo.format.duration) - extended.duration) < 0.1);
  assert.equal(extended.renderTrace.voiceSegments[0].text, rewrite.shots[0].narration);
  console.log('PASS continuous speech across cuts/units, synchronized captions, approval before extension and final MP4 (no provider calls)');
} finally {
  await rm(temp, { recursive: true, force: true });
}
