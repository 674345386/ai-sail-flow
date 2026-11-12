import { z } from 'zod';
import type { ExperimentGraph } from './experiment';

const text = z.string().trim().min(1).max(2000);
export const environmentSchema = z.object({
  capturedAt: z.string().max(80), platform: z.string().max(100), architecture: z.string().max(80), workingDirectory: z.string().max(500).optional(),
  entries: z.array(z.object({
    kind: z.enum(['runtime', 'dependency', 'tool', 'model', 'service']),
    name: z.string().min(1).max(200), version: z.string().max(200),
    pin: z.enum(['exact', 'unversioned']), source: z.string().max(2000).optional(),
  })).max(1000),
  files: z.array(z.object({ path: z.string().min(1).max(500), sha256: z.string().regex(/^[a-f0-9]{64}$/), content: z.string().max(1_000_000) })).max(100),
  setup: z.string().max(12000).default(''), requirements: z.array(z.string().max(1000)).max(40).default([]),
  unresolved: z.array(z.string().max(1000)).max(80).default([]),
});
export type SkillEnvironment = z.infer<typeof environmentSchema>;
export type SkillSource = { kind: 'github' | 'community'; url?: string; repository?: string; path?: string; commit?: string; basedOn?: string };
export type DeliveryFile = { path: string; sha256: string; content: string };
export type SkillSnapshot = { id: string; title: string; createdAt: string; graph: ExperimentGraph; sourceFiles: DeliveryFile[] };
export type SkillRelease = { id: string; createdAt: string; content: string; source: SkillSource; files: DeliveryFile[]; environment?: SkillEnvironment; snapshot?: SkillSnapshot; digest: string };
export type SkillReference = { id: string; assetId: string; releaseId: string; name: string; adoptedAt: string; workspace?: string; environment?: SkillEnvironment; snapshot?: SkillSnapshot; snapshotId?: string; reportId?: string; skillContent?: string; source?: SkillSource };
export const verificationStates = { pending: '待验证', running: '验证中', verified: '已验证', partial: '部分通过', failed: '未通过', blocked: '条件不足', stale: '待复测' } as const;
export type VerificationState = keyof typeof verificationStates;
export const evaluationProtocol = {
  version: 'sail-skill-v1',
  criteria: ['声明符合度：逐项核对作者声明与真实输出', '效果质量：记录达标依据与失败边界', '复现稳定性：按模型统计独立执行结果和样本量', '环境完整性：保存实际依赖、工具版本与恢复材料'],
};
export const evaluationInput = z.object({
  summary: text, topics: z.array(z.string().trim().min(1).max(40)).min(1).max(8),
  limitations: z.array(text).max(30), blockedReason: z.string().max(2000).optional(),
  cases: z.array(z.object({ claimIndex: z.number().int().nonnegative().max(29), runId: z.string().min(1).max(100), title: text, passed: z.boolean(), observation: text })).max(100),
});
export type EvaluationInput = z.infer<typeof evaluationInput>;
export type SkillReport = EvaluationInput & {
  id: string; releaseId: string; releaseDigest: string; protocol: string; createdAt: string;
  evaluator: string; state: Exclude<VerificationState, 'pending' | 'running' | 'stale'>;
  fitScore: number | null; models: { model: string; successes: number; trials: number; interval: [number, number] }[];
  environment?: SkillEnvironment; snapshot?: SkillSnapshot;
};
export type VerificationJob = { id: string; projectId: string; releaseId: string; startedAt: string; model: string; status: 'running' | 'completed' | 'blocked'; error?: string; requestedBy?: string };
export type SkillAsset = {
  id: string; kind: 'skill'; name: string; summary: string; topics: string[]; claims: string[];
  ownerId: string; author: string; visibility: 'private' | 'public'; createdAt: string; updatedAt: string;
  currentReleaseId: string; releases: SkillRelease[]; reports: SkillReport[]; jobs: VerificationJob[];
  upstream?: { checkedAt: string; latestCommit: string; changed: boolean };
};
export type SkillAssetSummary = {
  id: string; kind: 'skill'; name: string; summary: string; topics: string[]; author: string;
  visibility: 'private' | 'public'; releaseId: string; version: string; state: VerificationState;
  fitScore: number | null; trials: number; demoCount: number; saved: boolean; owned: boolean; updatedAt: string;
};
export type SkillAssetDetail = SkillAssetSummary & { claims: string[]; release: SkillRelease; reports: SkillReport[]; job?: VerificationJob; canStop: boolean; upstream?: SkillAsset['upstream']; protocol: typeof evaluationProtocol };
export type SkillSelection = { assetId: string; releaseId: string };
export const skillSelectionSchema = z.object({ assetId: z.string().regex(/^[\w-]{1,100}$/), releaseId: z.string().regex(/^[\w-]{1,100}$/) });

export function snapshotHasOutput(snapshot?: SkillSnapshot) {
  return !!snapshot?.graph.runs?.some(run => run.status === 'completed' && run.artifactIds.some(id => snapshot.graph.nodes.some(node => node.id === id && node.status === 'completed' && (node.sourceId || node.content.trim()))));
}

/** Wilson's 95% interval keeps a handful of successes from becoming a false guarantee. */
export function reproducibilityInterval(successes: number, trials: number): [number, number] {
  if (!trials) return [0, 1];
  const z = 1.96, p = successes / trials, denominator = 1 + z * z / trials;
  const centre = (p + z * z / (2 * trials)) / denominator;
  const margin = z * Math.sqrt(p * (1 - p) / trials + z * z / (4 * trials * trials)) / denominator;
  return [Math.max(0, centre - margin), Math.min(1, centre + margin)];
}
