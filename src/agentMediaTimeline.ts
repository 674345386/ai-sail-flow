import type { AgentMessage } from '../shared/agent-message';
import type { AgentImage, ComposedVideo, GeneratedVideo } from '../shared/domain';
import type { ExperimentGraph } from '../shared/experiment';
import { minimaxVideoRecoverable } from '../shared/minimax-video';

export type AgentMedia =
  | { kind: 'image'; value: AgentImage; at: string }
  | { kind: 'video'; value: GeneratedVideo; at: string };

export type DeliverableRole = 'primary' | 'milestone' | 'supporting';
export type DeliverableLayout = 'single' | 'stage' | 'parallel' | 'bundle';

export type AgentDeliverable = {
  id: string;
  artifactId: string;
  kind: 'image' | 'video' | 'text';
  sourceKind: 'composed' | 'video' | 'image' | 'file';
  role: DeliverableRole;
  badge: string;
  title: string;
  meta?: string;
  url?: string;
  thumbnail?: string;
  status: 'running' | 'completed' | 'failed';
  recoverable?: boolean;
  at: string;
  planId?: string;
};

export type MessageDeliverableGroup = {
  layout: DeliverableLayout;
  items: AgentDeliverable[];
  primary: AgentDeliverable[];
  milestones: AgentDeliverable[];
  supporting: AgentDeliverable[];
};

// These results predate the first user turn. Render them before the conversation,
// never as a footer that would keep moving past every newly appended reply.
export const UNASSIGNED_MEDIA = '__unassigned_media__';

function anchorMessageId(messages: AgentMessage[], at: string) {
  let first = -1;
  let last = messages.length;
  for (let index = 0; index < messages.length; index++) {
    if (messages[index].role !== 'user') continue;
    if (messages[index].createdAt <= at) first = index;
    else { last = index; break; }
  }
  const replies = first < 0 ? [] : messages.slice(first, last).filter(message => message.role === 'assistant');
  return { first, anchor: replies.at(-1)?.id ?? messages[first]?.id ?? UNASSIGNED_MEDIA };
}

export function groupAgentMedia(messages: AgentMessage[], images: AgentImage[], videos: GeneratedVideo[]) {
  const media: AgentMedia[] = [
    ...images.map(value => ({ kind: 'image' as const, value, at: value.createdAt })),
    ...videos.map(value => ({ kind: 'video' as const, value, at: value.startedAt })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const mediaByMessage = new Map<string, AgentMedia[]>();
  const imageUrlsByMessage = new Map<string, Set<string>>();
  let turnKey: string | undefined;
  let turnImages = new Set<string>();
  for (const message of messages) {
    if (message.role === 'user') {
      // Steered prompts share the active turn and receive the same finish time.
      const key = message.work?.finishedAt ?? (message.work?.status === 'running' ? 'running' : message.id);
      if (turnKey !== key) turnImages = new Set<string>();
      turnKey = key;
    }
    imageUrlsByMessage.set(message.id, turnImages);
  }

  for (const result of media) {
    const { first, anchor } = anchorMessageId(messages, result.at);
    mediaByMessage.set(anchor, [...(mediaByMessage.get(anchor) || []), result]);

    if (first >= 0 && result.kind === 'image' && result.value.url) imageUrlsByMessage.get(messages[first].id)?.add(result.value.url);
  }
  return { mediaByMessage, imageUrlsByMessage };
}

function formatSeconds(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return '';
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
}

function cleanNodeTitle(title?: string) {
  if (!title) return '';
  return title.replace(/\s*·\s*产物(?:\s*\d+)?$/, '').trim();
}

export function groupAgentDeliverables(
  messages: AgentMessage[],
  images: AgentImage[],
  videos: GeneratedVideo[],
  composed: ComposedVideo[] = [],
  experiment?: ExperimentGraph,
) {
  const { imageUrlsByMessage } = groupAgentMedia(messages, images, videos);
  const adoptedIds = new Set((experiment?.plans || []).filter(plan => plan.adopted && plan.selectedArtifactId).map(plan => plan.selectedArtifactId!));
  const nodeBySource = new Map<string, { title: string; planId?: string; adopted: boolean }>();
  if (experiment) {
    for (const node of experiment.nodes) {
      if (!node.sourceId || node.kind !== 'artifact') continue;
      const step = experiment.nodes.find(item => item.kind === 'step' && node.inputs.includes(item.id));
      nodeBySource.set(node.sourceId, {
        title: cleanNodeTitle(step?.title || node.title),
        planId: node.planId,
        adopted: adoptedIds.has(node.id),
      });
    }
  }

  type RawItem = AgentDeliverable & { purpose?: 'context' | 'output'; adopted?: boolean };
  const raw: RawItem[] = [
    ...images.map(image => {
      const info = nodeBySource.get(image.id);
      const dims = image.width && image.height ? `${image.width}×${image.height}` : image.aspectRatio || '';
      return {
        id: `image:${image.id}`,
        artifactId: `image:${image.id}`,
        kind: 'image' as const,
        sourceKind: 'image' as const,
        role: 'primary' as const,
        badge: '图片产物',
        title: info?.title || image.prompt.slice(0, 36) || '生成图片',
        meta: [dims, image.model].filter(Boolean).join(' · ') || undefined,
        url: image.url,
        thumbnail: image.url,
        status: image.status,
        at: image.createdAt,
        planId: info?.planId,
        adopted: info?.adopted,
      };
    }),
    ...videos.map(video => {
      const info = nodeBySource.get(video.id);
      const dur = formatSeconds(video.targetDuration || video.duration);
      return {
        id: `video:${video.id}`,
        artifactId: `video:${video.id}`,
        kind: 'video' as const,
        sourceKind: 'video' as const,
        role: 'primary' as const,
        badge: '视频片段',
        title: info?.title || video.prompt.slice(0, 36) || '生成视频',
        meta: [dur, video.resolution, video.model].filter(Boolean).join(' · ') || undefined,
        url: video.url,
        thumbnail: video.thumbnail,
        status: video.status,
        recoverable: minimaxVideoRecoverable(video),
        at: video.startedAt,
        planId: info?.planId,
        adopted: info?.adopted,
      };
    }),
    ...composed.map(video => {
      const info = nodeBySource.get(video.id);
      const dur = formatSeconds(video.duration);
      const clipCount = video.sourceVideoIds?.length ? `${video.sourceVideoIds.length} 段合成` : '';
      return {
        id: `composed:${video.id}`,
        artifactId: `composed:${video.id}`,
        kind: 'video' as const,
        sourceKind: 'composed' as const,
        role: 'primary' as const,
        badge: '最终成品',
        title: info?.title || '最终拼接成片',
        meta: [dur, clipCount].filter(Boolean).join(' · ') || undefined,
        url: video.url,
        status: 'completed' as const,
        at: video.finishedAt || video.startedAt,
        planId: info?.planId,
        adopted: info?.adopted,
      };
    }),
    ...(experiment?.files || []).map(file => {
      const info = nodeBySource.get(file.id);
      const isOutput = file.purpose === 'output';
      return {
        id: `file:${file.id}`,
        artifactId: `file:${file.id}`,
        kind: file.mediaType,
        sourceKind: 'file' as const,
        role: isOutput ? 'primary' as const : 'supporting' as const,
        badge: isOutput ? '最终成品' : '过程素材',
        title: file.title || info?.title || file.filename || '任务文件',
        meta: file.sourceTime !== undefined ? `${file.sourceTime}s 抽帧` : undefined,
        url: file.url,
        thumbnail: file.mediaType === 'image' ? file.url : undefined,
        status: file.status,
        at: file.createdAt ?? '',
        planId: info?.planId,
        purpose: file.purpose,
        adopted: info?.adopted,
      };
    }),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const buckets = new Map<string, RawItem[]>();
  for (const item of raw) {
    const { anchor } = anchorMessageId(messages, item.at);
    buckets.set(anchor, [...(buckets.get(anchor) || []), item]);
  }

  const deliverablesByMessage = new Map<string, MessageDeliverableGroup>();
  for (const [anchor, list] of buckets) {
    const supporting: AgentDeliverable[] = [];
    const candidates: RawItem[] = [];
    for (const item of list) {
      if (item.sourceKind === 'file' && item.purpose !== 'output') supporting.push({ ...item, role: 'supporting', badge: '过程素材' });
      else candidates.push(item);
    }

    const finals = candidates.filter(item => item.sourceKind === 'composed' || (item.sourceKind === 'file' && item.purpose === 'output'));
    const adopted = candidates.filter(item => item.adopted);
    const distinctPlans = new Set(candidates.map(item => item.planId).filter(Boolean));
    let primary: AgentDeliverable[] = [];
    let milestones: AgentDeliverable[] = [];

    if (finals.length) {
      const hero = finals.at(-1)!;
      primary = [{ ...hero, role: 'primary', badge: '最终成品' }];
      milestones = candidates.filter(item => item.id !== hero.id).map((item, idx) => ({
        ...item,
        role: 'milestone' as const,
        badge: item.sourceKind === 'composed' ? `历史成片 ${idx + 1}` : `阶段 ${idx + 1}`,
      }));
    } else if (adopted.length) {
      const adoptedSet = new Set(adopted.map(item => item.id));
      primary = adopted.map(item => ({ ...item, role: 'primary' as const, badge: '已采用' }));
      milestones = candidates.filter(item => !adoptedSet.has(item.id)).map((item, idx) => ({
        ...item,
        role: 'milestone' as const,
        badge: `备选 ${idx + 1}`,
      }));
    } else if (candidates.length > 1 && distinctPlans.size > 1) {
      primary = candidates.map((item, idx) => ({ ...item, role: 'primary' as const, badge: `方案 ${idx + 1}` }));
    } else if (candidates.length === 1) {
      primary = [{ ...candidates[0], role: 'primary', badge: candidates[0].kind === 'video' ? '成片产物' : candidates[0].kind === 'image' ? '图像产物' : '交付文件' }];
    } else if (candidates.length > 1) {
      const hero = [...candidates].reverse().find(item => item.status === 'completed') || candidates.at(-1)!;
      primary = [{ ...hero, role: 'primary', badge: '主产物' }];
      milestones = candidates.filter(item => item.id !== hero.id).map((item, idx) => ({
        ...item,
        role: 'milestone' as const,
        badge: `阶段 ${idx + 1}`,
      }));
    }

    const items = [...primary, ...milestones, ...supporting];
    const hasHeterogeneous = new Set(items.map(item => item.kind)).size > 1 || supporting.length > 0;
    const layout: DeliverableLayout =
      primary.length > 1 ? 'parallel'
        : primary.length === 1 && milestones.length === 0 && supporting.length === 0 ? 'single'
          : hasHeterogeneous ? 'bundle'
            : 'stage';

    deliverablesByMessage.set(anchor, { layout, items, primary, milestones, supporting });
  }

  return { deliverablesByMessage, imageUrlsByMessage };
}
