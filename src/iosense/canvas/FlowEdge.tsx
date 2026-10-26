import { memo } from 'react';
import { EdgeLabelRenderer, Position, type ConnectionLineComponentProps, type Edge, type EdgeProps } from '@xyflow/react';
import { Button, Tooltip } from '@faclon-labs/fds';
import { X } from 'lucide-react';
import type { Execution } from '../domain/types';
import { edgeId } from '../engine/graph';
import { useCanvasButtonSize } from '../lib/useViewportWidth';
import { AddNodeButton } from './AddNodeButton';
import { useCanvasActions } from './canvasActions';
import { edgeAnchor, edgePath } from './geometry';

export interface FlowEdgeData extends Record<string, unknown> {
  /** Names of the two nodes, for the controls' accessible names. */
  from: string;
  to: string;
  /** Selected (shows "×"), or highlighted because the pointer is on it or its "+". */
  isSelected: boolean;
  isHighlighted: boolean;
  /** How a test run treated this connection. */
  run?: 'taken' | 'untaken' | 'flowing';
  /** Hidden while a new connection is being dragged. */
  showControls: boolean;
}

export type FlowEdgeType = Edge<FlowEdgeData, 'wf'>;

/** The arrowhead a link the run took ends in (EdgeArrowDefs draws it). */
export const TAKEN_ARROW_ID = 'io-edge-arrow-taken';

/**
 * The arrowhead for links a run took: green, pointing into the next node, its tip on the input dot's edge. Drawn
 * once per canvas; marker contents take CSS, so its colour is a token.
 */
export function EdgeArrowDefs() {
  return (
    <svg className="io-edge-defs" aria-hidden="true" focusable="false">
      <defs>
        <marker id={TAKEN_ARROW_ID} viewBox="0 0 10 10" refX="16" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
          <path className="io-edge__arrow" d="M 0 0 L 10 5 L 0 10 z" />
        </marker>
      </defs>
    </svg>
  );
}

/** Edges a run went along: consecutive path nodes joined by the handle that ran. */
export function takenEdgeIds(run: Execution | undefined): Set<string> | null {
  if (!run) return null;
  const ids = new Set<string>();
  run.path.forEach((id, i) => {
    const next = run.path[i + 1];
    if (!next) return;
    const handle = run.nodes.find((n) => n.nodeId === id)?.takenHandle ?? 'out';
    ids.add(edgeId(id, handle));
  });
  return ids;
}

/**
 * A connection: the canvas's right-angled line with rounded corners, plus a
 * "+" on its last run into the target (insert a node in between) and, once
 * selected, a "×" above it (remove the connection).
 */
export const FlowEdge = memo(function FlowEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<FlowEdgeType>) {
  const actions = useCanvasActions();
  const buttonSize = useCanvasButtonSize();
  const a = { x: sourceX, y: sourceY };
  const b = { x: targetX, y: targetY };
  const d = edgePath(a, b);
  const mid = edgeAnchor(a, b);
  if (!data) return null;

  return (
    <>
      <path
        d={d}
        className="io-edge"
        data-selected={data.isSelected || data.isHighlighted || undefined}
        data-run={data.run}
        markerEnd={data.run === 'taken' ? `url(#${TAKEN_ARROW_ID})` : undefined}
      />
      <path
        d={d}
        className="io-edge__hit"
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') actions.onHoverEdge(id); }}
        onPointerLeave={() => actions.onHoverEdge(null)}
      />
      {data.showControls && (
        <EdgeLabelRenderer>
          <div
            className="io-edge-add nodrag nopan"
            style={{ transform: `translate(${mid.x}px, ${mid.y}px)` }}
            onPointerEnter={() => actions.onHoverEdge(id)}
            onPointerLeave={() => actions.onHoverEdge(null)}
          >
            <span className="io-edge-add__center">
              <AddNodeButton label={`Insert a node between ‘${data.from}’ and ‘${data.to}’`} onClick={() => actions.onInsert(id)} />
              {data.isSelected && (
                <span className="io-edge-add__remove">
                  <Tooltip content="Remove connection">
                    <Button
                      iconOnly
                      size={buttonSize}
                      variant="secondary"
                      tone="neutral"
                      aria-label={`Remove the connection from ‘${data.from}’ to ‘${data.to}’`}
                      leadingIcon={<X size={16} />}
                      onClick={() => actions.onRemoveEdge(id)}
                    />
                  </Tooltip>
                </span>
              )}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

/** The line drawn while a connection is being dragged out of a port; from an input it runs pointer → input. */
export function FlowConnectionLine({ fromX, fromY, toX, toY, fromPosition }: ConnectionLineComponentProps) {
  const from = { x: fromX, y: fromY };
  const to = { x: toX, y: toY };
  const d = fromPosition === Position.Left ? edgePath(to, from) : edgePath(from, to);
  return <path className="io-edge io-edge--preview" d={d} />;
}
