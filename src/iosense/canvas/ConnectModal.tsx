import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  ActionList, ActionListItem, Button, DropdownMenu, DropdownMenuOverlay, Modal, ModalBody, ModalFooter, ModalHeader, Radio,
  RadioGroup, SelectInput,
} from '@faclon-labs/fds';
import type { Graph } from '../domain/types';
import { NODE_TYPES } from '../domain/nodeTypes';
import { canConnect, edgeFrom, flowOrder, getNode, handleLabel, outputHandles } from '../engine/graph';
import { connect, disconnect } from '../engine/graphOps';
import type { SummaryContext } from './summary';

const NONE = '__none__';

interface ConnectModalProps {
  nodeId: string | null;
  graph: Graph;
  ctx: SummaryContext;
  onApply: (next: Graph) => void;
  onDismiss: () => void;
}

/**
 * Connect, re-connect or disconnect one output without dragging (WCAG 2.5.7):
 * pick the output (Switch only) and where it goes.
 */
export function ConnectModal({ nodeId, graph, ctx, onApply, onDismiss }: ConnectModalProps) {
  const formId = useId();
  const node = getNode(graph, nodeId);
  const handles = node ? outputHandles(node) : [];
  const [handle, setHandle] = useState('');
  const [target, setTarget] = useState(NONE);

  useEffect(() => {
    if (!node) return;
    const first = handles.find((h) => !edgeFrom(graph, node.id, h)) ?? handles[0];
    setHandle(first);
  }, [nodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (node && handle) setTarget(edgeFrom(graph, node.id, handle)?.target ?? NONE);
  }, [handle]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!node) return null;
  const current = edgeFrom(graph, node.id, handle);
  const targets = flowOrder(graph)
    .map((id) => getNode(graph, id)!)
    .filter((n) => n.id === current?.target || canConnect(graph, node.id, handle, n.id).ok);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    let next = graph;
    if (target === NONE) next = current ? disconnect(graph, current.id) : graph;
    else if (target !== current?.target) next = connect(graph, node.id, handle, target);
    if (next !== graph) onApply(next);
    onDismiss();
  };

  const label = (id: string) => {
    const n = getNode(graph, id);
    return n ? `${NODE_TYPES[n.type].label} · ${n.name}` : '';
  };

  return (
    <Modal isOpen={!!nodeId} onDismiss={onDismiss}>
      <ModalHeader title={`Connect ‘${node.name}’`} />
      <ModalBody>
        <form id={formId} className="io-form" onSubmit={submit} noValidate>
          {node.type === 'switch' && (
            <RadioGroup label="Output" value={handle} onChange={({ value }) => setHandle(value)}>
              {handles.map((h) => <Radio key={h} value={h}>{handleLabel(node, h, ctx.vars)}</Radio>)}
            </RadioGroup>
          )}
          <DropdownMenu selectionType="single" value={[target]} onChange={({ values }) => setTarget(values[0] ?? NONE)}>
            <SelectInput label="Goes to" helpText="Nodes that would create a loop aren’t listed." />
            <DropdownMenuOverlay>
              <ActionList>
                <ActionListItem value={NONE} title="Not connected" />
                {targets.map((t) => <ActionListItem key={t.id} value={t.id} title={label(t.id)} />)}
              </ActionList>
            </DropdownMenuOverlay>
          </DropdownMenu>
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" tone="neutral" label="Cancel" onClick={onDismiss} />
        <Button type="submit" form={formId} label="Save connection" />
      </ModalFooter>
    </Modal>
  );
}
