import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, rename, stat, unlink } from 'node:fs/promises';
import ffmpeg from 'ffmpeg-static';

const run = promisify(execFile);
const compressionThreshold = 8 * 1024 * 1024;

// Replace the upload only after encoding succeeds and produces a smaller file.
export async function compressUploadedVideo(input: string, size: number): Promise<number> {
  if (size < compressionThreshold) return size;
  const output = `${input}.compressing.mp4`;
  try {
    if (!ffmpeg) throw new Error('FFmpeg is unavailable on this platform.');
    await run(ffmpeg, [
      '-nostdin', '-y', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', input,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'libx264', '-crf', '27', '-preset', 'fast',
      '-pix_fmt', 'yuv420p', '-fps_mode', 'vfr',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', output,
    ], { timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 });
    const compressedSize = (await stat(output)).size;
    if (!compressedSize) throw new Error('FFmpeg produced an empty file.');
    if (compressedSize >= size) return size;
    await chmod(output, 0o600);
    await rename(output, input);
    return compressedSize;
  } catch {
    throw new Error('视频压缩失败，请重新上传或先压缩为 MP4 后重试。');
  } finally {
    await unlink(output).catch(() => {});
  }
}
