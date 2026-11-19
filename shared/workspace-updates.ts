import type { AgentActivities, AgentActivity } from './agent-activity';
import type { Project } from './domain';
import type { AgentState } from './intelligent-ui';

export type WorkspaceUpdate =
  | { type: 'project'; project: Project }
  | { type: 'agent'; state: AgentState }
  | { type: 'agent-unavailable' }
  | { type: 'activities'; entries: AgentActivities }
  | { type: 'activity'; id: string; activity: AgentActivity };
