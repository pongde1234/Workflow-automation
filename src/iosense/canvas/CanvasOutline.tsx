import { memo } from 'react';
import type { Execution, Graph } from '../domain/types';
import { NODE_TYPES } from '../domain/nodeTypes';
import { edgeFrom, getNode, handleLabel, outputHandles } from '../engine/graph';
import { NODE_RUN_STATUS } from '../ui/status';
import { nodeSummary, type SummaryContext } from './summary';

interface CanvasOutlineProps { id: string; graph: Graph; order: string[]; ctx: SummaryContext; run?: Execution }

/**
 * The flow in reading order for screen readers: each node, what it does and
 * where each of its outputs goes. Visually hidden; linked from the canvas.
 */
export const CanvasOutline = memo(function CanvasOutline({ id, graph, order, ctx, run }: CanvasOutlineProps) {
  return (
    <div id={id} className="r-sr-only">
      <p>
        Workflow outline. Tab moves between nodes in flow order; arrow keys follow connections; Enter opens a node; Shift+F10 opens its actions.
      </p>
      <ol>
        {order.map((nodeId, i) => {
          const n = getNode(graph, nodeId);
          if (!n) return null;
          const links = outputHandles(n).map((h) => {
            const target = getNode(graph, edgeFrom(graph, n.id, h)?.target);
            const from = n.type === 'switch' ? `‘${handleLabel(n, h, ctx.vars)}’` : 'Then';
            return target ? `${from} goes to ${NODE_TYPES[target.type].label} ‘${target.name}’` : `${from} goes nowhere`;
          });
          const status = run?.nodes.find((r) => r.nodeId === n.id);
          return (
            <li key={n.id}>
              {`${i + 1}. ${NODE_TYPES[n.type].label} ‘${n.name}’: ${nodeSummary(n, ctx)}. ${links.join('; ')}.`}
              {status ? ` ${NODE_RUN_STATUS[status.status].label}.` : ''}
            </li>
          );
        })}
      </ol>
    </div>
  );
});
