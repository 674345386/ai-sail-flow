import { z } from 'zod';
import type { GeneratedVideo } from './domain';

export function minimaxVideoRecoverable(video: GeneratedVideo) {
  return video.provider === 'minimax-h3' && video.status === 'failed' && !!video.minimax &&
    !['failed', 'cancelled'].includes(video.minimax.upstreamStatus || '') && !!(video.requestId || video.minimax.request);
}

/** Automatic recovery only queries a known task ID; it never replays a submission. */
export function minimaxVideoNeedsReconciliation(video: GeneratedVideo, now = Date.now()) {
  if (video.provider !== 'minimax-h3' || !video.requestId || !video.minimax || video.status === 'completed' || ['failed', 'cancelled'].includes(video.minimax.upstreamStatus || '')) return false;
  if (video.status === 'running') return true;
  const pending = video.minimax.recoveryPending ?? /重启|等待超时|本地保存失败/.test(video.error || '');
  return pending && (!video.minimax.nextRecoveryAt || Date.parse(video.minimax.nextRecoveryAt) <= now);
}

export const MINIMAX_MODELS = ['h3-video', 'h3-video-flex', 'h3-video-frames'] as const;
export const MINIMAX_RESOLUTIONS = ['480p', '720p', '768p', '960p', '1080p'] as const;
export const MINIMAX_RATIOS = ['16:9', '9:16', '21:9', '4:3', '1:1', '3:4'] as const;

// Shared by the HTTP boundary and MCP tool, independent of Omni/Veo settings.
export const minimaxVideoInput = z.object({
  stepId: z.string().min(1).optional(),
  requestKey: z.string().trim().min(1).max(160).optional().describe('Stable key for one intended generation. Reuse it on retries; use a new key only for a deliberately new version. Reusing a key with different parameters is rejected. Omit to deduplicate identical requests within the current user message.'),
  prompt: z.string().min(1).max(12000).refine(value => !!value.trim(), '请填写生成提示词。'),
  model: z.enum(MINIMAX_MODELS).default('h3-video'),
  duration: z.number().int().min(4).max(30).default(6),
  resolution: z.enum(MINIMAX_RESOLUTIONS).default('768p'),
  aspectRatio: z.enum(MINIMAX_RATIOS).optional(),
  generateAudio: z.boolean().default(true),
  optimizePrompt: z.boolean().default(false),
  referenceIds: z.array(z.string().min(1)).max(9).default([]),
  firstFrameId: z.string().min(1).optional(),
  lastFrameId: z.string().min(1).optional(),
}).strict().superRefine((input, ctx) => {
  const issue = (field: string, message: string) => ctx.addIssue({ code: 'custom', path: [field], message });
  if (new Set(input.referenceIds).size !== input.referenceIds.length) issue('referenceIds', '参考图不能重复。');
  if (input.model === 'h3-video-frames') {
    if (!input.firstFrameId && !input.lastFrameId) issue('firstFrameId', 'H3 Frames 至少需要首帧或尾帧。');
    if (input.referenceIds.length) issue('referenceIds', '首尾帧模型不能混入普通参考图。');
  } else if (input.firstFrameId || input.lastFrameId) issue('model', '使用首尾帧时请选择 h3-video-frames。');
  const maxDuration = input.model !== 'h3-video' || ['960p', '1080p'].includes(input.resolution) ? 15 : input.resolution === '768p' && input.aspectRatio === '21:9' ? 20 : 30;
  if (input.duration > maxDuration) issue('duration', `此配置最长 ${maxDuration} 秒。`);
  if (input.model === 'h3-video-flex' && input.resolution === '1080p' && input.aspectRatio === '21:9' && input.duration > 10) issue('duration', 'Flex 的 1080p 21:9 最长 10 秒。');
  if (input.resolution === '720p' && input.aspectRatio && !['16:9', '9:16'].includes(input.aspectRatio)) issue('aspectRatio', '720p 仅支持 16:9 或 9:16；其他画幅请选择 768p 等分辨率。');
});
export type MinimaxVideoInput = z.infer<typeof minimaxVideoInput>;
export type MinimaxAssetInput = { asset_id: string; role: 'reference_image' | 'first_frame' | 'last_frame' | 'reference_audio' | 'reference_video' };
export type MinimaxGenerationDetails = {
  recordedAt: string; createdAt?: string; completedAt?: string;
  outputCount?: number; generateAudio?: boolean; muteReferenceVideo?: boolean; optimizePrompt?: boolean;
  modelRunMs?: number; totalTimeMs?: number;
};
export type MinimaxGenerationRequest = {
  model: typeof MINIMAX_MODELS[number]; prompt: string; inputs: MinimaxAssetInput[];
  parameters: { duration: number; resolution: typeof MINIMAX_RESOLUTIONS[number]; aspect_ratio: typeof MINIMAX_RATIOS[number]; generate_audio: boolean };
  optimize_prompt: boolean;
};

export const minimaxVideoTool = {
  name: 'generate_minimax_video',
  description: 'Generate a real MiniMax H3 video via Hi/SparkCine, as an independent alternative to Omni. Use when MiniMax/H3 is requested or its capabilities fit the task. Default h3-video, 6 seconds, 768p, creative aspect ratio. h3-video supports text or up to 9 reference images; h3-video-flex supports up to 15 seconds; h3-video-frames takes firstFrameId and/or lastFrameId, no ordinary referenceIds. Image IDs must come from this creative imageReferences or grids. Published images, including extracted video frames and screenshots, are valid referenceIds or firstFrameId/lastFrameId; use publish_experiment_file then read get_creative.imageReferences. Supports 16:9, 9:16, 21:9, 4:3, 1:1, 3:4; 720p only supports 16:9/9:16. 960p/1080p max 15s; 768p 21:9 max 20s; Flex 1080p 21:9 max 10s. Prompt is forwarded unchanged. optimizePrompt is optional provider rewriting at extra cost; enable only when requested. Only call for an authorized video request. Pending means keep querying get_creative; use recover_video after interruption, never resubmit an uncertain request.',
  inputSchema: z.toJSONSchema(minimaxVideoInput, { io: 'input' }),
};
