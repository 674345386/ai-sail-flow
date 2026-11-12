import type { AgentMessage } from './agent-message';
import type { CanvasComponent } from './agent-canvas-ui';
import type { AgentAdaptation } from './agent-adaptation';
import type { AgentPresentation } from './agent-presentation';
import type { ExperimentGraph } from './experiment';

export type IntelligentPanel = { id: string; title: string; source: string; createdAt: string };
export type AgentQueuedMessage = { id: string; text: string; createdAt: string };
export type AgentState = {
  provider?: string;
  threadId?: string;
  previousThreadId?: string;
  instructionsVersion?: string;
  turnId?: string;
  model?: string;
  effort?: string;
  adaptation?: AgentAdaptation;
  presentation?: AgentPresentation;
  videoId?: string | null;
  status: 'idle' | 'running' | 'failed';
  activity?: string;
  error?: string;
  messages: AgentMessage[];
  queue?: AgentQueuedMessage[];
  queuePaused?: boolean;
  canvasComponents?: CanvasComponent[];
  intelligentPanel?: IntelligentPanel;
  experiment?: ExperimentGraph;
};

// Recognise the opening statement before the program is complete. The renderer
// accepts partial programs; validating the whole answer here would block streaming.
export function intelligentUIResponse(text: string): string | null {
  const source = text.trimStart().replace(/^```(?:openui|openui-lang)?\s*\n/i, '').replace(/\n```\s*$/, '');
  return /^root\s*=/.test(source) ? source : null;
}
