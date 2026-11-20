import { z } from 'zod';

const id = z.string().regex(/^[\w-]{1,100}$/);
const seconds = z.number().finite().nonnegative();
const video = { stepId: id, videoId: id };
const audio = { ...video, audioId: id, audioStart: seconds.optional(), audioEnd: seconds.optional() };

export const ffmpegSkillInput = z.discriminatedUnion('operation', [
  z.strictObject({ ...audio, operation: z.literal('replace-audio'), fadeOut: seconds.optional() }),
  z.strictObject({ ...audio, operation: z.literal('mix-audio'), musicFadeOut: seconds.optional(), volumeDb: z.number().min(-60).max(0).optional(), duck: z.boolean().optional() }),
  z.strictObject({ ...video, operation: z.literal('trim'), start: seconds, end: seconds }),
  z.strictObject({ ...video, operation: z.literal('export'), preset: z.enum(['youtube', 'youtube4k', 'shorts', 'reels', 'tiktok', 'facebook', 'linkedin', 'x']), fit: z.enum(['pad', 'crop']).optional(), normalize: z.boolean().optional() }),
]);

export type FFmpegSkillInput = z.infer<typeof ffmpegSkillInput>;
