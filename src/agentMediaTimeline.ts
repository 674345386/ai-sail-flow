import type { AgentMessage } from '../shared/agent-message';
import type { AgentImage, GeneratedVideo } from '../shared/domain';

export type AgentMedia =
  | { kind: 'image'; value: AgentImage; at: string }
  | { kind: 'video'; value: GeneratedVideo; at: string };

// These results predate the first user turn. Render them before the conversation,
// never as a footer that would keep moving past every newly appended reply.
export const UNASSIGNED_MEDIA = '__unassigned_media__';

export function groupAgentMedia(messages: AgentMessage[], images: AgentImage[], videos: GeneratedVideo[]): Map<string, AgentMedia[]> {
  const media: AgentMedia[] = [
    ...images.map(value => ({ kind: 'image' as const, value, at: value.createdAt })),
    ...videos.map(value => ({ kind: 'video' as const, value, at: value.startedAt })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const groups = new Map<string, AgentMedia[]>();

  for (const result of media) {
    let first = -1;
    let last = messages.length;
    for (let index = 0; index < messages.length; index++) {
      if (messages[index].role !== 'user') continue;
      if (messages[index].createdAt <= result.at) first = index;
      else { last = index; break; }
    }
    const anchor = first < 0 ? UNASSIGNED_MEDIA
      : messages.slice(first, last).filter(message => message.role === 'assistant').at(-1)?.id || messages[first].id;
    groups.set(anchor, [...(groups.get(anchor) || []), result]);
  }
  return groups;
}
