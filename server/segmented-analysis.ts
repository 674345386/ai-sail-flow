import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { analysisSchema, validateTimeline, type Analysis, type AnalysisMeta, type ModelRequestSnapshot, type Project } from '../shared/domain';
import { MAX_STORYBOARD_GRID_DURATION } from '../shared/storyboard-grid';
import { uploadDir } from './store';

const exec = promisify(execFile);
const PARALLEL_SEGMENTS = 3;
type SegmentResult = { result: Analysis; meta: AnalysisMeta; usage: { input: number; output: number } };
type AnalyzeWhole = (project: Project, progress: (n: number, message: string) => void, trace?: (snapshot: ModelRequestSnapshot) => void) => Promise<SegmentResult>;

export async function analyzeInSegments(project: Project, progress: (n: number, message: string) => void, trace: ((snapshot: ModelRequestSnapshot) => void) | undefined, analyzeWhole: AnalyzeWhole): Promise<SegmentResult> {
  const video = project.assets.find(asset => asset.kind === 'video');
  if (!video?.duration) throw new Error('缺少参考视频时长，请重新上传视频。');
  const duration = video.duration;
  const ranges = Array.from({ length: Math.ceil(duration / MAX_STORYBOARD_GRID_DURATION) }, (_, index) => ({
    start: index * MAX_STORYBOARD_GRID_DURATION,
    end: Math.min(duration, (index + 1) * MAX_STORYBOARD_GRID_DURATION),
  }));
  if (ranges.length > 1 && ranges.at(-1)!.end - ranges.at(-1)!.start < 0.1) {
    ranges[ranges.length - 2].end = duration;
    ranges.pop();
  }
  const directory = await mkdtemp(path.join(uploadDir, '.analysis-segments-'));
  const results: SegmentResult[] = new Array(ranges.length);
  let next = 0, completed = 0;
  let failure: Error | undefined;
  progress(10, `正在按 10 秒分段，最多同时分析 ${PARALLEL_SEGMENTS} 段…`);
  try {
    await Promise.all(Array.from({ length: Math.min(PARALLEL_SEGMENTS, ranges.length) }, async () => {
      while (!failure) {
        const index = next++;
        if (index >= ranges.length) return;
        const range = ranges[index], segmentDuration = Number((range.end - range.start).toFixed(3));
        const filename = path.join(directory, `segment-${index + 1}.mp4`);
        try {
          await exec('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-ss', range.start.toFixed(3), '-i', path.join(uploadDir, video.filename), '-t', segmentDuration.toFixed(3), '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-threads', '2', '-c:a', 'aac', '-movflags', '+faststart', filename], { timeout: 120000, maxBuffer: 1024 * 1024 });
          if (failure) return;
          const segmentVideo = { ...video, filename: path.relative(uploadDir, filename), mime: 'video/mp4', duration: segmentDuration };
          const segmentProject = { ...project, assets: project.assets.map(asset => asset.id === video.id ? segmentVideo : asset) };
          results[index] = await analyzeWhole(segmentProject, () => {}, index === 0 && trace ? snapshot => trace({ ...snapshot, parameters: { ...snapshot.parameters, analysisMethod: 'segmented', segmentCount: ranges.length, segmentStart: range.start, segmentEnd: range.end } }) : undefined);
          completed++;
          progress(15 + Math.round(completed / ranges.length * 55), `正在并行分析视频片段：已完成 ${completed}/${ranges.length} 段`);
        } catch (error) {
          failure ||= new Error(`第 ${index + 1}/${ranges.length} 段（${range.start.toFixed(1)}–${range.end.toFixed(1)} 秒）分析失败：${error instanceof Error ? error.message : '请重试。'}`);
        }
      }
    }));
    if (failure) throw failure;

    const offsetPoint = (point: NonNullable<Analysis['focusPoints']>[number], start: number, length: number) => ({
      ...point, evidenceAt: point.evidenceAt === undefined ? undefined : Number((start + Math.min(length, Math.max(0, point.evidenceAt))).toFixed(3)),
    });
    const shots: Analysis['shots'] = [];
    results.forEach((segment, index) => {
      const { start, end } = ranges[index], length = end - start;
      for (const shot of segment.result.shots) {
        const at = (seconds: number) => Number((start + Math.min(length, Math.max(0, seconds))).toFixed(3));
        const shotStart = at(shot.start), shotEnd = at(shot.end);
        if (shotEnd <= shotStart) throw new Error(`第 ${index + 1} 段返回了无效的镜头时间。`);
        shots.push({ ...shot, id: `shot-${shots.length + 1}`, start: shotStart, end: shotEnd,
          evidenceFrames: shot.evidenceFrames?.map(frame => ({ ...frame, at: at(frame.at) })),
          motionBeats: shot.motionBeats?.map(beat => ({ ...beat, start: at(beat.start), end: at(beat.end) })).filter(beat => beat.end > beat.start),
          focusPoints: shot.focusPoints?.map(point => offsetPoint(point, start, length)),
        });
      }
    });
    if (shots.length > 120) throw new Error(`并行分析得到 ${shots.length} 个镜头，超过当前项目支持的 120 个，请缩短视频后重试。`);
    const unique = (items: string[], limit: number) => [...new Set(items.map(item => item.trim()).filter(Boolean))].slice(0, limit);
    const focusPoints = results.flatMap((segment, index) => (segment.result.focusPoints || []).map(point => offsetPoint(point, ranges[index].start, ranges[index].end - ranges[index].start)));
    const merged = analysisSchema.parse({
      summary: results.map((segment, index) => `${ranges[index].start.toFixed(1)}–${ranges[index].end.toFixed(1)} 秒：${segment.result.summary}`).join('\n').slice(0, 8000),
      sourceLanguage: unique(results.map(segment => segment.result.sourceLanguage), 5).join(' / ').slice(0, 100),
      duration, sellingPoints: unique(results.flatMap(segment => segment.result.sellingPoints), 15),
      productAppearance: unique(results.map(segment => segment.result.productAppearance), ranges.length).join('\n').slice(0, 6000),
      uncertainties: unique(results.flatMap(segment => segment.result.uncertainties), 30),
      focusPoints: focusPoints.slice(0, 12), shots,
    });
    const timelineError = validateTimeline(merged.shots, duration);
    if (timelineError) throw new Error(`分段结果合并失败：${timelineError}`);
    const first = results[0].meta;
    return { result: merged, meta: { ...first, mode: 'segmented-video', segmentCount: ranges.length, analyzedAt: new Date().toISOString() },
      usage: results.reduce((sum, segment) => ({ input: sum.input + segment.usage.input, output: sum.output + segment.usage.output }), { input: 0, output: 0 }) };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
