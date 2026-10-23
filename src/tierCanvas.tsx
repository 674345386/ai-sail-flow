/* Canvas trial: each tier shot as a group of nodes — original 首/中/尾 next to the new frames, left to right in time order. */
import { memo } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import type { Project } from '../shared/domain';
import { tierPlan, type FramePosition, type TierFramePlan, type TierPlan } from '../shared/tier-prompt';
import { FrameVisual, aspectOf, type OpenFrame } from './TierWorkbench';

export type TierCanvasOptions = {
  disabled: boolean; ratioLabel: string; frameBusy: string[]; frameFailed: Record<string, string>;
  onFrame: (shotId: string, position: FramePosition) => void;
  open: OpenFrame | null; onOpen: (frame: OpenFrame) => void;
};
type GroupData = Record<string, unknown> & { label: string; start: string };
type FrameData = Record<string, unknown> & { side: 'source' | 'new'; plan: TierPlan; frame: TierFramePlan; aspect: string; selected: boolean; options: TierCanvasOptions };
export type TierGroupNode = Node<GroupData, 'tierGroup'>;
export type TierFrameNode = Node<FrameData, 'tierFrame'>;
export type TierCanvasNode = TierGroupNode | TierFrameNode;

const FRAME_W = 84, COL_GAP = 12, ROW_GAP = 10, PAD = 10, HEAD = 10, GROUP_GAP = 28;
/** Right of the stage nodes (they end near x = 665); the start-second label sits above each group, level with the stage tops. */
const ORIGIN = { x: 760, y: 71 };

/** Only when the project has a tier plan: shots analysed and at least one shot entry under replication. */
export function hasTierPlan(project: Project) {
  return !!project.analysis?.shots.length && Object.keys(project.replication?.shots || {}).length > 0;
}

export function buildTierCanvasNodes(project: Project, options: TierCanvasOptions): TierCanvasNode[] {
  if (!hasTierPlan(project)) return [];
  const [w, h] = options.ratioLabel.split(':').map(Number);
  const frameH = Math.round(FRAME_W * (w > 0 && h > 0 ? h / w : 16 / 9)), aspect = aspectOf(options.ratioLabel);
  const width = PAD * 2 + FRAME_W * 2 + COL_GAP, height = HEAD + PAD + frameH * 3 + ROW_GAP * 2;
  return project.analysis!.shots.flatMap((shot, index): TierCanvasNode[] => {
    const plan = tierPlan(project, shot), id = `tier-${shot.id}`;
    const group: TierGroupNode = { id, type: 'tierGroup', position: { x: ORIGIN.x + index * (width + GROUP_GAP), y: ORIGIN.y }, dragHandle: '.tier-canvas-group-head',
      style: { width, height }, selectable: false, data: { label: String(index + 1).padStart(2, '0'), start: `${shot.start.toFixed(1)}s` } };
    const frames = plan.frames.flatMap((frame, row) => (['source', 'new'] as const).map((side, col): TierFrameNode => ({
      id: `${id}-${side}-${frame.position}`, type: 'tierFrame', parentId: id, extent: 'parent', draggable: false, selectable: false,
      position: { x: PAD + col * (FRAME_W + COL_GAP), y: HEAD + row * (frameH + ROW_GAP) }, style: { width: FRAME_W, height: frameH },
      data: { side, plan, frame, aspect, options, selected: options.open?.shotId === shot.id && options.open.position === frame.position },
    })));
    return [group, ...frames];
  });
}

const TierGroupView = memo(function TierGroupView({ data }: NodeProps<TierGroupNode>) {
  return <div className="tier-canvas-group"><div className="tier-canvas-group-head"><strong>{data.start}</strong><span>{data.label}</span></div></div>;
});
const TierFrameView = memo(function TierFrameView({ data }: NodeProps<TierFrameNode>) {
  const { side, plan, frame, aspect, selected, options } = data, open = () => options.onOpen({ shotId: plan.shotId, position: frame.position });
  if (side === 'source') return <div role="button" tabIndex={0} aria-label={`原片${frame.label}`} className={`tier-tile tier-canvas-frame nodrag${selected ? ' is-selected' : ''}`} style={{ aspectRatio: aspect }}
    onClick={open} onKeyDown={event => { if (event.key === 'Enter') open(); }}>{frame.source ? <img src={frame.source.url} alt={`原片${frame.label}`} draggable={false} /> : <span className="tier-tile-blank" />}</div>;
  const running = options.frameBusy.includes(`${plan.shotId}:${frame.position}`);
  return <div role="button" tabIndex={0} aria-label={`新${frame.label}`} style={{ aspectRatio: aspect }}
    className={`tier-tile tier-canvas-frame nodrag${frame.result ? '' : ' is-empty'}${running ? ' is-loading' : ''}${frame.outdated ? ' is-outdated' : ''}${selected ? ' is-selected' : ''}`}
    onClick={open} onKeyDown={event => { if (event.key === 'Enter') open(); }}>
    <FrameVisual plan={plan} frame={frame} frameBusy={options.frameBusy} frameFailed={options.frameFailed} disabled={options.disabled} showSource={false} onFrame={options.onFrame} />
  </div>;
});
export const tierNodeTypes = { tierGroup: TierGroupView, tierFrame: TierFrameView };
