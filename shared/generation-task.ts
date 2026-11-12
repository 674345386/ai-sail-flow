export type GenerationTaskStatus = 'queued' | 'submitting' | 'processing' | 'saving' | 'completed' | 'failed' | 'needs-attention';
export type GenerationTaskStage = 'prepare' | 'generate' | 'save';
export type GenerationTask = {
  id: string;
  kind: 'image' | 'video';
  source: string;
  creativeId?: string;
  studioProjectId?: string;
  creativeTitle: string;
  projectTitle?: string;
  archived?: boolean;
  model: string;
  prompt: string;
  status: GenerationTaskStatus;
  stage: GenerationTaskStage;
  message: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  requestId?: string;
  recoverable?: boolean;
  aspectRatio?: string;
  size?: string;
  quality?: string;
  resolution?: string;
  duration?: number;
  width?: number;
  height?: number;
  referenceCount?: number;
  error?: string;
  warning?: string;
  credits?: { held: string; charged: string };
  outputs: { id: string; url: string; filename?: string; thumbnail?: string }[];
};
export type GenerationTaskList = {
  tasks: GenerationTask[];
  counts: { total: number; active: number; attention: number; completed: number };
  updatedAt: string;
};
export const generationStatusLabels: Record<GenerationTaskStatus, string> = {
  queued: '排队中', submitting: '准备提交', processing: '生成中', saving: '保存结果中',
  completed: '已完成', failed: '生成失败', 'needs-attention': '待核对',
};
export function generationTaskActive(status: GenerationTaskStatus) {
  return status === 'queued' || status === 'submitting' || status === 'processing' || status === 'saving';
}
