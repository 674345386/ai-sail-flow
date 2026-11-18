import { z } from 'zod';
import { replicationLevelIds } from './replication-levels';

const requiredText = (length: number) => z.string().trim().min(1).max(length);
const id = z.string().min(1).max(100);
const seconds = z.number().min(0).max(2700);

export const videoMasterPromptSchema = z.object({
  english: requiredText(16000).describe('Paste-ready English master prompt for the full target scope.'),
  chinese: requiredText(16000).describe('Paste-ready Chinese version of the same master prompt.'),
  negativePrompt: requiredText(4000),
  parameterNotes: requiredText(4000),
});
export type VideoMasterPrompt = z.infer<typeof videoMasterPromptSchema>;

export const videoProductionInput = z.object({
  revision: z.number().int().nonnegative(),
  sourceVideoId: id.optional(),
  level: z.enum(replicationLevelIds).optional(),
  method: z.enum(['scene-clips', 'storyboard', 'edit']).default('scene-clips'),
  preserve: z.string().trim().max(4000).default(''),
  change: z.string().trim().max(4000).default(''),
  originalMasterPrompt: videoMasterPromptSchema.optional().describe('Scoped original prompt when analyzing only part of the reference.'),
  masterPrompt: videoMasterPromptSchema,
  scenes: z.array(z.object({
    title: requiredText(120), start: seconds, end: seconds,
    prompt: requiredText(12000), keyframePrompt: z.string().trim().max(12000).default(''),
    visual: z.string().trim().max(2000).optional(), camera: z.string().trim().max(2000).optional(), entities: z.string().trim().max(2000).optional(),
    originalPrompt: z.string().trim().min(1).max(12000).optional(),
    originalFrameTimes: z.array(seconds).max(3).optional().describe('Observed source times to extract for a scoped scene when its frames are not already saved.'),
    sourceFrameIds: z.array(id).max(3).default([]),
    referenceIds: z.array(id).max(4).default([]),
  })).min(1).max(120),
});
export type VideoProductionFrame = { id: string; at: number; url: string; filename: string };
type SavedPlan = Omit<z.infer<typeof videoProductionInput>, 'revision'>;
export type VideoProductionPlan = Omit<SavedPlan, 'scenes'> & {
  updatedAt: string;
  scenes: (SavedPlan['scenes'][number] & { originalFrames?: VideoProductionFrame[] })[];
};

export const OMNI_FLASH_12 = 'omni_flash-1.2';
export const OMNI_FLASH_12_SECONDS = [8, 10, 12, 15] as const;
export const H3_MIN_SECONDS = 4;
export const H3_MAX_SECONDS = 15;
export const PRODUCTION_SEGMENT_SECONDS = 10;

export const productionVideoInput = z.object({
  prompt: requiredText(12000).optional().describe('Video prompt. A saved sceneIndex supplies its approved prompt.'),
  sceneIndex: z.number().int().min(1).max(120).optional().describe('Use an existing production scene’s planned prompt, scope and prepared keyframe.'),
  stepId: id.optional(),
  requestKey: id.optional(),
  model: z.enum(['h3-video', 'h3-video-flex', OMNI_FLASH_12, 'omni_flash_8s', 'omni_flash_10s']).optional(),
  aspectRatio: z.enum(['16:9', '9:16', '21:9', '4:3', '1:1', '3:4']).optional(),
  resolution: z.enum(['480p', '720p', '1080p']).optional(),
  duration: z.number().positive().max(H3_MAX_SECONDS).optional().describe('Target seconds. H3 rounds up to provider minimum 4, retaining the target for composition. Omit for video editing.'),
  generateAudio: z.boolean().optional(),
  referenceIds: z.array(id).max(9).default([]),
  referenceVideoIds: z.array(id).max(1).default([]),
  firstFrameId: id.optional(),
  lastFrameId: id.optional(),
  sourceVideoId: id.optional().describe('Video to actually edit, never a style or structure reference.'),
  start: seconds.optional().describe('Start in the source video for an edit. Defaults to zero.'),
  end: seconds.optional().describe('End in the source video for an edit. Defaults to its duration.'),
}).strict();
export type ProductionVideoInput = z.infer<typeof productionVideoInput>;

export const productionStoryboardInput = z.object({
  stepId: id.optional(),
  start: seconds, end: seconds, frameIds: z.array(id).min(1).max(9),
  prompt: requiredText(12000),
  aspectRatio: z.enum(['16:9', '9:16']).optional(),
});

export const productionCompositionInput = z.object({
  stepId: id.optional(),
  clips: z.array(z.object({ videoId: id, start: seconds.optional(), end: seconds.optional() })).min(1).max(120),
  replace: z.object({ videoId: id, start: seconds, end: seconds }).optional()
    .describe('Splice the ordered generated clips into this original range, retaining original material before and after it.'),
});
