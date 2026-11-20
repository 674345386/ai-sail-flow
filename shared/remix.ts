import type { Shot } from './domain';

// Legacy records can still refer to completed character-remix media.
export type RemixPromptPhase = 'evidence' | 'correction' | 'prompt';
type RemixSettings = { character: string; preserve: string; changes: string; resolution: '720p' | '1080p'; aspectRatio: '9:16' | '16:9'; bgmMode: 'reference' | 'remix' };
type RemixCorrection = {
  id: string; basis: string; model: string; startedAt: string; completedAt: string;
  sourceShots: Shot[];
  evidence: { shotId: string; sourceStart: number; sourceEnd: number; frames: { at: number; url: string; position: 'first' | 'middle' | 'last' }[] }[];
  shots: {
    sourceShotId: string; description: string; correctedSource?: Record<string, string>; uncertainties: string[];
    changes: {
      field: '主体' | '服装' | '场景' | '道具' | '动作' | '机位' | '画面文字' | '转场';
      sourceField?: 'subject' | 'visual' | 'productPresence' | 'action' | 'camera' | 'onScreenText' | 'effects' | 'transition' | 'reconstructionPrompt';
      kind: '补充' | '校正' | '确认'; original: string; corrected: string; evidencePositions: ('first' | 'middle' | 'last')[];
    }[];
  }[];
};
type RemixPlan = {
  direction: string; audio: string; shots: { sourceShotId: string; start: number; end: number; description: string }[];
  basis: string; prompt: string; generatedAt: string; model: string; correctionId?: string;
  evidence: { shotId: string; sourceStart: number; sourceEnd: number; frames: { at: number; url: string }[] }[];
};
type RemixCharacter = {
  source?: 'generated' | 'uploaded'; name?: string;
  basis: string; prompt: string; model: string; generatedAt: string;
  filename: string; url: string; mime: 'image/png' | 'image/jpeg' | 'image/webp';
};
type RemixVideo = {
  id: string; basis: string; model: 'omni_flash_10s'; status: 'running' | 'completed' | 'failed';
  prompt: string; resolution: RemixSettings['resolution']; aspectRatio: RemixSettings['aspectRatio'];
  bgmMode?: RemixSettings['bgmMode'];
  characterFilename: string; requestId?: string; startedAt: string; finishedAt?: string; error?: string;
  filename?: string; url?: string; thumbnail?: string; duration?: number; width?: number; height?: number; hasAudio?: boolean;
};
export type RemixWorkflow = { settings: RemixSettings; character?: RemixCharacter; correction?: RemixCorrection; plan?: RemixPlan; videos: RemixVideo[] };
