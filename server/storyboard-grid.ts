import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Analysis, Asset, Market, Shot, StoryboardGrid, StoryboardGridSize } from '../shared/domain';
import { uploadDir } from './store';

const exec = promisify(execFile);
const MAX_GRID_DURATION = 8;

function fixed(value: number) {
  return Number(value.toFixed(3));
}

function uniformFrameTimes(start: number, end: number, count: number) {
  const duration = end - start;
  return Array.from({ length: count }, (_, index) => fixed(start + duration * (index + .5) / count));
}

function representativeFrameTimes(analysis: Analysis, start: number, end: number, count: number) {
  const times = uniformFrameTimes(start, end, count);
  const shots = overlappingShots(analysis, start, end);
  const selected = shots.length <= count ? shots : Array.from({ length: count }, (_, index) => shots[Math.min(shots.length - 1, Math.floor((index + .5) * shots.length / count))]);
  const occupied = new Set<number>();
  for (const shot of selected) {
    const evidence = shot.evidenceFrames?.find(frame => frame.at >= start && frame.at < end)?.at;
    const preferred = evidence ?? (Math.max(start, shot.start) + Math.min(end, shot.end)) / 2;
    const target = Math.max(0, Math.min(count - 1, Math.floor((preferred - start) / (end - start) * count)));
    let slot = target;
    for (let offset = 0; occupied.has(slot) && offset < count; offset++) {
      const before = target - offset - 1, after = target + offset + 1;
      slot = before >= 0 && !occupied.has(before) ? before : after < count && !occupied.has(after) ? after : slot;
    }
    if (!occupied.has(slot)) {
      occupied.add(slot);
      times[slot] = fixed(Math.max(start + .01, Math.min(end - .04, preferred)));
    }
  }
  return times.sort((a, b) => a - b);
}

function cellRange(cells: number[]) {
  if (cells.length === 1) return `第${cells[0]}格`;
  return `第${cells[0]}–${cells.at(-1)}格`;
}

function shotCells(shot: Shot, times: number[]) {
  const direct = times.map((at, index) => at >= shot.start && at < shot.end ? index + 1 : 0).filter(Boolean);
  if (direct.length) return direct;
  const midpoint = (shot.start + shot.end) / 2;
  let closest = 0;
  for (let index = 1; index < times.length; index++) if (Math.abs(times[index] - midpoint) < Math.abs(times[closest] - midpoint)) closest = index;
  return [closest + 1];
}

function clean(value?: string) {
  return value?.trim() || '参考对应格子中的可见内容。';
}

function buildPrompt(analysis: Analysis, shots: Shot[], start: number, end: number, size: StoryboardGridSize, times: number[], aspectRatio: Market['aspectRatio']) {
  const duration = fixed(end - start);
  const count = size * size;
  const shotSections = shots.map((shot, index) => {
    const localStart = fixed(Math.max(start, shot.start) - start);
    const localEnd = fixed(Math.min(end, shot.end) - start);
    const cells = shotCells(shot, times);
    const motion = shot.motionBeats?.length
      ? shot.motionBeats.map(beat => beat.description).join('；')
      : clean(shot.action);
    return `镜头${index + 1}：${localStart.toFixed(2)}–${localEnd.toFixed(2)}秒，参考${cellRange(cells)}
${clean(shot.visual)}
主体与造型：${clean(shot.subject)}
动作发展：${motion}
机位与运镜：${clean(shot.camera)}
转场与效果：${clean([shot.transition, shot.effects].filter(Boolean).join('；'))}`;
  }).join('\n\n');

  return `生成一条${duration.toFixed(2)}秒、${aspectRatio}画幅视频。

【参考图的读取方式】
上传的参考图是一张${size}行×${size}列的连续分镜板，共${count}格。
按从左到右、从上到下的顺序，将每格编号为1至${count}。

每一格是同一条视频中某一时刻的画面参考。
请读取每格内部的有效画面，去掉宫格之间的白边和间隔。
最终视频在任意时刻只显示一个完整的${aspectRatio}镜头。

【镜头组织】
将${count}格按原片时间顺序整理为下列${shots.length}个连续镜头。
同一场景或同一动作的连续格子用于描述动作发展，不要在这些格子之间反复切镜。
原片确有场景或剪辑点变化时，按参考画面直接切换到下一镜头。

${shotSections}

【剪辑要求】
各镜头依次播放，保持原片的顺序、动作节奏和转场逻辑。
同一连续动作要生成完整的运动过程，不要把每格生成为独立的定格画面。
参考图中的模糊过渡格只用于理解运动方向，不要将模糊画面长时保留。
不要通过移动相机浏览整张宫格来代替剪辑。

【画面与运动】
根据每个参考格的内容重新构成完整的${aspectRatio}画面，优先保留人物、主体、商品、地标和关键动作。
保持同一主体的外观、服装、道具和空间关系连续稳定。
区分主体自身运动、物体或图形运动、运镜和剪辑转场，避免把所有元素当作一张静态图片整体摇晃。

【内容依据】
${analysis.summary}

【输出限制】
最终输出单一全画幅视频，总时长不得超过${duration.toFixed(2)}秒。
不要出现${size}×${size}宫格、多窗口、分屏、分镜边框、格子编号或白色间隔。
不要添加参考图以外的人物、物品、字幕、标志或新场景。
保持人物面部、手部、肢体、物体外形和背景结构稳定。`;
}

function overlappingShots(analysis: Analysis, start: number, end: number) {
  return analysis.shots.filter(shot => shot.end > start && shot.start < end);
}

export async function generateStoryboardGrids(video: Asset, analysis: Analysis, size: StoryboardGridSize, aspectRatio: Market['aspectRatio'], progress?: (done: number, total: number) => void): Promise<StoryboardGrid[]> {
  if (!video.duration || !video.width || !video.height) throw new Error('缺少参考视频的时长或尺寸信息。');
  const total = Math.ceil(video.duration / MAX_GRID_DURATION);
  const source = path.join(uploadDir, video.filename);
  const probe = await exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=duration,r_frame_rate', '-of', 'json', source], { timeout: 20000 });
  const stream = JSON.parse(probe.stdout).streams?.[0];
  const [rateNumerator, rateDenominator] = String(stream?.r_frame_rate || '0/1').split('/').map(Number);
  const frameDuration = rateNumerator > 0 && rateDenominator > 0 ? rateDenominator / rateNumerator : 0.1;
  const streamDuration = Number(stream?.duration);
  const lastFrameTime = Math.max(0, (Number.isFinite(streamDuration) && streamDuration > 0 ? Math.min(streamDuration, video.duration) : video.duration) - frameDuration * 2);
  const portrait = video.height > video.width;
  const cellWidth = portrait ? 270 : 480;
  const cellHeight = portrait ? 480 : 270;
  const grids: StoryboardGrid[] = [];
  for (let index = 0; index < total; index++) {
    const start = fixed(index * MAX_GRID_DURATION);
    const end = fixed(Math.min(video.duration, start + MAX_GRID_DURATION));
    const duration = end - start;
    const count = size * size;
    const times = representativeFrameTimes(analysis, start, end, count).map(at => fixed(Math.min(at, lastFrameTime)));
    const filename = `storyboard-grid-${randomUUID()}.jpg`;
    const inputs = times.flatMap(at => ['-ss', at.toFixed(3), '-threads', '1', '-i', source]);
    const cells = times.map((_, cell) => `[${cell}:v]scale=${cellWidth}:${cellHeight}:force_original_aspect_ratio=decrease,pad=${cellWidth}:${cellHeight}:(ow-iw)/2:(oh-ih)/2:black[c${cell}]`).join(';');
    const layout = times.map((_, cell) => `${cell % size * (cellWidth + 8)}_${Math.floor(cell / size) * (cellHeight + 8)}`).join('|');
    const filter = `${cells};${times.map((_, cell) => `[c${cell}]`).join('')}xstack=inputs=${count}:layout=${layout}:fill=white[stack];[stack]pad=iw+24:ih+24:12:12:white[out]`;
    await exec('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-protocol_whitelist', 'file,pipe', ...inputs, '-filter_complex_threads', '1', '-filter_complex', filter, '-map', '[out]', '-frames:v', '1', '-threads', '1', '-pix_fmt', 'yuvj420p', '-q:v', '2', path.join(uploadDir, filename)], { timeout: 120000, maxBuffer: 1024 * 1024 });
    const shots = overlappingShots(analysis, start, end);
    grids.push({ id: randomUUID(), start, end, gridSize: size, frameTimes: times, filename, url: `/media/${filename}`,
      prompt: buildPrompt(analysis, shots.length ? shots : analysis.shots.slice(0, 1), start, end, size, times, aspectRatio), generatedAt: new Date().toISOString(), included: true });
    progress?.(index + 1, total);
  }
  return grids;
}
