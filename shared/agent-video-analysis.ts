import { z } from 'zod';
import { analysisSchema, focusCandidateSchema, shotSchema, type Shot } from './domain';
import { videoMasterPromptSchema, type VideoMasterPrompt } from './video-production';

const referenceFrameSampling = z.enum(['overview', 'standard', 'frame-by-frame']);
export type ReferenceFrameSampling = z.infer<typeof referenceFrameSampling>;
export const referenceFrameWindowSeconds = 2;
export const referenceFramesPath = '/analyze/frames';

export const referenceFramesInput = z.object({
  start: z.number().min(0).optional().describe('Start in original video seconds. Defaults to 0.'),
  end: z.number().positive().optional().describe('End in original video seconds. Defaults to the video duration.'),
  sampling: referenceFrameSampling.default('standard').describe('Overview returns one sparse sheet. Standard samples more densely for shot analysis. Frame-by-frame uses consecutive source frames in a window up to 2 seconds, capped at 80 frames, with scene-change score hints.'),
  measureAudio: z.boolean().default(false).describe('Read original-track RMS energy in 20 ms bins. Only available with frame-by-frame sampling. This does not classify beats, speech or sound effects.'),
});

const focusPoints = z.array(focusCandidateSchema).max(12).optional();
const agentShot = shotSchema.pick({ start: true, role: true, visual: true, subject: true, action: true, camera: true,
  effects: true, transition: true, onScreenText: true, productPresence: true, uncertainty: true, reconstructionPrompt: true, evidenceFrames: true, motionBeats: true,
}).extend({
  start: shotSchema.shape.start.describe('Shot start in original video seconds. The first shot starts at 0.'),
  visual: shotSchema.shape.visual.trim().min(1).describe('Concise description of the observed composition and subject.'),
  role: shotSchema.shape.role.default('other'),
  action: shotSchema.shape.action.default(''),
  camera: shotSchema.shape.camera.default(''),
  onScreenText: shotSchema.shape.onScreenText.default(''),
  productPresence: shotSchema.shape.productPresence.default(''),
  uncertainty: shotSchema.shape.uncertainty.default(''),
  evidenceFrames: shotSchema.shape.evidenceFrames.describe('Observed useful frame timestamps in original video seconds, within this shot.'),
  motionBeats: shotSchema.shape.motionBeats.describe('Observed changes and movement between neighboring source frames, in absolute seconds inside this shot. Omit if evidence is insufficient.'),
  focusPoints,
});

const referenceSceneInput = z.object({
  title: z.string().trim().min(1).max(120).describe('Short scene name.'),
  visual: z.string().trim().min(1).max(2000).describe('Observed visual features of this scene.'),
  shotCount: z.number().int().min(1).max(120).describe('Number of consecutive shots in this scene, starting after the previous scene.'),
  frameAt: z.number().min(0).max(2700).describe('Timestamp of a representative source frame inside the scene. Pick a clear sample away from transitions.'),
  additionalFrameTimes: z.array(z.number().min(0).max(2700)).max(2).optional().describe('Up to two additional observed source timestamps for scene development or multiple angles.'),
  camera: z.string().trim().max(2000).optional().describe('Shot scale, framing, lens perspective, camera and transition language.'),
  entities: z.string().trim().max(2000).optional().describe('People, products, props, environment and their continuity.'),
  prompt: z.string().trim().min(1).max(12000).optional().describe('Paste-ready original scene recreation prompt.'),
});

export const referenceSceneTableTitle = '视频复刻 · 场景表';

export type ReferenceScene = z.infer<typeof referenceSceneInput> & { start: number; end: number };
export type ReferenceSceneFrame = { at: number; url: string };
export type ReferenceSceneTable = {
  videoId: string;
  createdAt: string;
  duration: number;
  masterPrompt?: VideoMasterPrompt;
  rows: (ReferenceScene & { frameUrl: string; keyframes?: ReferenceSceneFrame[] })[];
};

export function referenceSceneImages(table?: ReferenceSceneTable) {
  return (table?.rows || []).flatMap((scene, index) => (scene.keyframes || [{ at: scene.frameAt, url: scene.frameUrl }]).flatMap(frame => {
    const match = /^\/media\/(reference-scene-[a-f\d]{24})\.jpg$/.exec(frame.url);
    return match ? [{ id: match[1], name: `场景 ${index + 1} · ${scene.title} · ${frame.at.toFixed(3)} 秒`, filename: `${match[1]}.jpg`, url: frame.url, mime: 'image/jpeg' as const }] : [];
  }));
}

export function referenceSceneRanges(scenes: z.infer<typeof referenceSceneInput>[], shots: Pick<Shot, 'start' | 'end'>[]): ReferenceScene[] {
  if (scenes.reduce((count, scene) => count + scene.shotCount, 0) !== shots.length) {
    throw new Error('场景的镜头数合计必须等于分析保存的镜头总数。');
  }
  let offset = 0;
  return scenes.map((scene, index) => {
    const start = shots[offset].start;
    offset += scene.shotCount;
    const end = shots[offset - 1].end;
    const times = [scene.frameAt, ...(scene.additionalFrameTimes || [])];
    if (new Set(times).size !== times.length || times.some(time => time < start || time >= end)) {
      throw new Error(`第 ${index + 1} 个场景的截图时间必须在 ${start}–${end} 秒内，且早于场景结束。`);
    }
    return { ...scene, start, end };
  });
}

export const saveReferenceAnalysisInput = z.object({
  videoId: z.string().min(1).describe('Current reference video ID from analyze_reference.'),
  revision: z.number().int().nonnegative().describe('Creative revision from analyze_reference.'),
  analysis: analysisSchema.pick({ summary: true, sourceLanguage: true, sellingPoints: true, productAppearance: true, uncertainties: true }).extend({
    summary: analysisSchema.shape.summary.trim().min(1),
    sourceLanguage: analysisSchema.shape.sourceLanguage.default(''),
    sellingPoints: analysisSchema.shape.sellingPoints.default([]),
    productAppearance: analysisSchema.shape.productAppearance.default(''),
    uncertainties: analysisSchema.shape.uncertainties.default([]),
    masterPrompt: videoMasterPromptSchema.optional(),
    shots: z.array(agentShot).min(1).max(120).describe('Every observed shot in chronological order. The next start sets the previous end.'),
    scenes: z.array(referenceSceneInput).min(1).max(120).describe('All scenes in chronological order. Consecutive shots of the same setting may share one scene. Every shot belongs to exactly one scene and transitions are not separate scenes.'),
    focusPoints,
  }),
});

export const saveReferenceShotReviewInput = saveReferenceAnalysisInput.pick({ videoId: true, revision: true }).extend({
  shots: z.array(agentShot.omit({ start: true, evidenceFrames: true }).extend({
    shotId: shotSchema.shape.id.describe('Existing shot ID from get_creative. Keep its exact original boundaries.'),
  })).min(1).max(120),
  focusPoints,
});
