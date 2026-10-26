import { memo, useLayoutEffect, useRef, useState } from 'react';
import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from '@xyflow/react';
import {
  ActionList, ActionListItem, ActionListItemIcon, Badge, Card, CardBody, CardHeader, CardHeaderIconButton, Divider,
  CardHeaderLeading, CardHeaderTrailing, DropdownMenu, DropdownMenuOverlay, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger, Indicator, Spinner,
} from '@faclon-labs/fds';
import { Check, CircleOff, Ellipsis, Link2, Move, Plus, Power, Trash2, TriangleAlert, X } from 'lucide-react';
import type { NodeResult, WfNode } from '../domain/types';
import type { NodeChange } from '../engine/diff';
import { NODE_TYPES } from '../domain/nodeTypes';
import { NODE_RUN_STATUS } from '../ui/status';
import { NodeTile, categoryOf } from '../ui/NodeTile';
import { cardSummary, switchRows, type SummaryContext } from './summary';
import { AddNodeButton } from './AddNodeButton';
import { useCanvasActions } from './canvasActions';

/** Node width: 4 × --spacing-64 + --spacing-32 = 288 world units (NODE_WIDTH). */
export const NODE_CARD_WIDTH = 'calc(var(--spacing-64) * 4 + var(--spacing-32))';

export interface FlowNodeData extends Record<string, unknown> {
  node: WfNode;
  ctx: SummaryContext;
  isSelected: boolean;
  run?: NodeResult;
  issue?: 'error' | 'unreachable';
  /** Output handles with nothing connected (they show "+"), with readable labels. */
  freeOutputs: { handle: string; label: string }[];
  /** Every output; "Add node after" on a connected one inserts the node in between. */
  allOutputs: { handle: string; label: string }[];
  /** While a connection is dragged over this node: whether it may be dropped here, and on which side. */
  connectHint?: { state: 'valid' | 'invalid'; side: 'in' | 'out'; handle?: string };
  isMenuOpen: boolean;
  /** New or edited since the workflow was last published (shown while Publish changes is pending). */
  change?: NodeChange;
}

export type FlowNodeType = Node<FlowNodeData, 'wf'>;

/** y of `el`'s centre inside `root`, in layout px (unaffected by the canvas zoom). */
function centreWithin(el: HTMLElement, root: HTMLElement) {
  let y = el.offsetHeight / 2;
  let cur: HTMLElement | null = el;
  while (cur && cur !== root) {
    y += cur.offsetTop;
    cur = cur.offsetParent as HTMLElement | null;
  }
  return y;
}

/** What a node does, in one plain line (no avatars or inserted-value tags: those read as clutter on a card). */
export function NodeSummary({ node, ctx }: { node: WfNode; ctx: SummaryContext }) {
  return <p className="io-node__summary BodySmallRegular">{cardSummary(node, ctx)}</p>;
}

/** Added or changed since the last publish: what Publish changes will put live. */
export function ChangeBadge({ change }: { change: NodeChange }) {
  return <Badge label={change === 'new' ? 'New' : 'Edited'} color="Information" />;
}

/**
 * The node's status, Small so its 12px label matches the category Badge beside it (the Spinner's label is 12px too).
 * How a run ended is a Badge with ✓ or ✕, beside the card's green or red outline; queued and skipped stay a quiet dot.
 */
export function StatusMark({ run, issue }: { run?: NodeResult; issue?: FlowNodeData['issue'] }) {
  if (run?.status === 'running') return <Spinner size="Medium" label="Running" labelPosition="Right" />;
  if (run) {
    const s = NODE_RUN_STATUS[run.status];
    if (run.status === 'success') return <Badge label={s.label} color={s.color} leadingIcon={<Check size={12} />} />;
    if (run.status === 'failed') return <Badge label={s.label} color={s.color} leadingIcon={<X size={12} />} />;
    return <Indicator size="Small" color={s.color} aria-live="off">{s.label}</Indicator>;
  }
  // Not set up yet: a warning, so a Notice Badge with the warning icon (Badge R: a state that needs attention), not a bare dot.
  if (issue === 'error') return <Badge label="Needs setup" color="Notice" leadingIcon={<TriangleAlert size={12} />} />;
  if (issue === 'unreachable') return <Indicator size="Small" color="Neutral" aria-live="off">Not connected</Indicator>;
  return null;
}

/**
 * A workflow node on the React Flow canvas: an FDS Card with its ports as
 * React Flow handles. The handles come before the Card so it paints over their
 * inner half (they read as tabs behind its edge); a Switch has one output per
 * row, lined up with the row it belongs to.
 */
export const FlowNode = memo(function FlowNode({ id, data }: NodeProps<FlowNodeType>) {
  const { node, ctx } = data;
  const actions = useCanvasActions();
  const updateNodeInternals = useUpdateNodeInternals();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [rowY, setRowY] = useState<Record<string, number>>({});
  const def = NODE_TYPES[node.type];
  const cat = categoryOf(node.type);
  const isTrigger = def.category === 'trigger';
  const disabled = !isTrigger && !!node.settings?.disabled;
  const rows = node.type === 'switch' ? switchRows(node, ctx.vars) : null;
  const outputs = rows ? rows.map((r) => r.handle) : ['out'];
  const statusText = data.run ? NODE_RUN_STATUS[data.run.status].label : data.issue === 'error' ? 'needs setup' : data.issue === 'unreachable' ? 'not connected' : '';

  // A Switch's outputs sit beside their rows: measure the rows and tell React Flow when they move.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el || !rows) return undefined;
    const measure = () => {
      const next: Record<string, number> = {};
      el.querySelectorAll<HTMLElement>('[data-port-anchor]').forEach((row) => { next[row.dataset.portAnchor!] = centreWithin(row, el); });
      setRowY((prev) => {
        const same = Object.keys(next).length === Object.keys(prev).length && Object.keys(next).every((k) => prev[k] === next[k]);
        if (same) return prev;
        requestAnimationFrame(() => updateNodeInternals(id));
        return next;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  });

  // An input dot sits halfway down the card. When the card's height changes on its own (fonts arriving, a summary
  // wrapping, a failed run adding its reason), React Flow keeps the old dot position and lines end a few px off the
  // dot, so every height change has it measure the dots again.
  const lastHeight = useRef(0);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      const h = el.offsetHeight;
      if (h === lastHeight.current) return;
      lastHeight.current = h;
      requestAnimationFrame(() => updateNodeInternals(id));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, updateNodeInternals]);

  const portStyle = (handle: string) => (rowY[handle] !== undefined ? { top: rowY[handle] } : undefined);

  const menu = (
    <span className="nodrag nopan">
      <DropdownMenu isOpen={data.isMenuOpen} onOpenChange={({ isOpen }) => actions.onMenuOpenChange(node.id, isOpen)}>
        <DropdownMenuTrigger>
          <CardHeaderIconButton size="xs" icon={<Ellipsis size={16} />} aria-label={`Actions for ${node.name}`} tabIndex={-1} />
        </DropdownMenuTrigger>
        <DropdownMenuOverlay>
          <ActionList>
            {data.allOutputs.length === 1 && (
              <ActionListItem title="Add node after…" value="add" leading={<ActionListItemIcon icon={Plus} />} onClick={() => actions.onMenuAction(node.id, { kind: 'add', handle: data.allOutputs[0].handle })} />
            )}
            {data.allOutputs.length > 1 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger title="Add node after" value="add" leading={<ActionListItemIcon icon={Plus} />} />
                <DropdownMenuSubContent>
                  <ActionList>
                    {data.allOutputs.map((o) => (
                      <ActionListItem key={o.handle} value={o.handle} title={`‘${o.label}’…`} onClick={() => actions.onMenuAction(node.id, { kind: 'add', handle: o.handle })} />
                    ))}
                  </ActionList>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <ActionListItem title="Connect to…" value="connect" leading={<ActionListItemIcon icon={Link2} />} onClick={() => actions.onMenuAction(node.id, { kind: 'connect' })} />
            <ActionListItem title="Move" value="move" leading={<ActionListItemIcon icon={Move} />} onClick={() => actions.onMenuAction(node.id, { kind: 'move' })} />
            {!isTrigger && (
              <ActionListItem
                title={disabled ? 'Enable' : 'Disable'}
                value="toggleDisabled"
                leading={<ActionListItemIcon icon={disabled ? Power : CircleOff} />}
                onClick={() => actions.onMenuAction(node.id, { kind: 'toggleDisabled' })}
              />
            )}
            <ActionListItem title="Delete node" value="delete" intent="negative" leading={<ActionListItemIcon icon={Trash2} />} onClick={() => actions.onMenuAction(node.id, { kind: 'delete' })} />
          </ActionList>
        </DropdownMenuOverlay>
      </DropdownMenu>
    </span>
  );

  return (
    <div ref={wrapRef} className="io-node" data-node-id={node.id} data-tone={cat.tone} data-run={data.run?.status} data-disabled={disabled || undefined}>
      {!isTrigger && (
        <Handle type="target" position={Position.Left} id="in" className="io-port io-port--in" data-hint={data.connectHint?.side === 'in' ? data.connectHint.state : undefined} aria-hidden="true" />
      )}
      {outputs.map((h) => (
        <Handle
          key={h}
          type="source"
          position={Position.Right}
          id={h}
          className="io-port io-port--out"
          style={portStyle(h)}
          data-hint={data.connectHint?.side === 'out' && (!data.connectHint.handle || data.connectHint.handle === h) ? data.connectHint.state : undefined}
          aria-hidden="true"
        />
      ))}
      <Card
        ref={(el) => actions.registerCard(node.id, el)}
        size="Medium"
        padding={16}
        width={NODE_CARD_WIDTH}
        // Disabled: dimmed with the Card's own opacity, and said in words beside the role.
        opacity={disabled ? 0.55 : undefined}
        isSelected={data.isSelected}
        onClick={() => actions.onSelectNode(node.id)}
        onKeyDown={(e) => actions.onNodeKeyDown(e, node.id)}
        accessibilityLabel={`${def.label}: ${node.name || def.defaultName}${disabled ? ', disabled' : ''}${statusText ? `, ${statusText}` : ''}`}
      >
        <CardHeader showDivider={false}>
          <CardHeaderLeading title={node.name || def.defaultName} subtitle={def.label} prefix={<NodeTile type={node.type} size="xs" />} />
          <CardHeaderTrailing visual={menu} />
        </CardHeader>
        <CardBody>
          <div className="io-node__body">
            {rows
              ? rows.map((r) => (
                <p key={r.handle} className="io-node__row BodySmallRegular" data-port-anchor={r.handle}>{r.label}</p>
              ))
              : <NodeSummary node={node} ctx={ctx} />}
            <Divider />
            <div className="io-node__meta">
              <span className="io-node__tags">
                <Badge label={cat.label} color="Neutral" />
                {disabled && <Badge label="Disabled" color="Neutral" leadingIcon={<CircleOff size={12} />} />}
                {data.change && <ChangeBadge change={data.change} />}
              </span>
              {/* A disabled node's "Skipped" would repeat its Disabled badge. */}
              <StatusMark run={disabled && data.run?.status === 'skipped' ? undefined : data.run} issue={disabled ? undefined : data.issue} />
            </div>
          </div>
        </CardBody>
      </Card>
      {data.freeOutputs.map((o) => <span key={`stub-${o.handle}`} className="io-port-stub" style={portStyle(o.handle)} aria-hidden="true" />)}
      {data.freeOutputs.map((o) => (
        <AddNodeButton
          key={o.handle}
          label={rows ? `Add node after ‘${o.label}’` : `Add node after ${node.name}`}
          className="io-port-add nodrag nopan"
          style={portStyle(o.handle)}
          onClick={() => actions.onMenuAction(node.id, { kind: 'add', handle: o.handle })}
        />
      ))}
    </div>
  );
});
