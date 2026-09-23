import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);
const temp = await mkdtemp(path.join(os.tmpdir(), 'sop-compose-check-'));
process.env.SOP_DATA_DIR = temp;
try {
  const { uploadDir } = await import('../server/store');
  const { demoProject } = await import('../shared/demo');
  const { composeVideo, listTtsVoices } = await import('../server/compose');
  const available = await listTtsVoices();
  const voice = available.find(item => item.name === 'Samantha' && item.language === 'en-US');
  assert(voice, 'English system voice is unavailable');
  const id = randomUUID();
  const filename = `veo-${id}.mp4`;
  await exec('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x223344:s=720x1280:d=2:r=15',
    '-c:v', 'libx264', '-t', '2', path.join(uploadDir, filename)], { timeout: 30_000 });
  const project = demoProject(randomUUID());
  project.rewrite!.shots = [{ ...project.rewrite!.shots[0], start: 0, end: 2, narration: 'Hello.', onScreenText: 'Coffee time' }];
  const video = { id, provider: 'veo-3.1' as const, model: 'veo_3_1' as const, unitId: 'veo-unit-01', shotId: 'shot-1',
    productionMode: 'tts-subtitles' as const, status: 'completed' as const, prompt: '', duration: 8, aspectRatio: '9:16' as const,
    filename, startedAt: new Date().toISOString() };
  const rendered = await composeVideo(project, [video], voice.name, () => {});
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', path.join(uploadDir, rendered.filename)]);
  const info = JSON.parse(stdout);
  assert(info.streams.some((stream: { codec_type: string }) => stream.codec_type === 'video'));
  assert(info.streams.some((stream: { codec_type: string }) => stream.codec_type === 'audio'));
  assert(Math.abs(Number(info.format.duration) - 2) < 0.2);
  console.log('PASS local TTS, burned captions and final MP4 composition (no provider calls)');
} finally {
  await rm(temp, { recursive: true, force: true });
}
