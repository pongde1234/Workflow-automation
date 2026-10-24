import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Drawer, DrawerBody, DrawerFooter, DrawerHeader, TextInput } from '@faclon-labs/fds';
import { uid } from '@/lib/util';
import type {
  DelayNode, DeviceAlertNode, EmailNode, Graph, IoFormsNode, ReportNode, SchedulerNode, SmsNode, SwitchNode, WfNode, WorkOrderNode,
} from '../domain/types';
import { NODE_TYPES } from '../domain/nodeTypes';
import { getNode } from '../engine/graph';
import { renameNode, updateConfig } from '../engine/graphOps';
import { NodeTile } from '../ui/NodeTile';
import { NODE_RUN_STATUS } from '../ui/status';
import { useWorkflow } from '../pages/WorkflowContext';
import { errorProps, type NodeFormProps } from './fields';
import { IoFormsForm } from './IoFormsForm';
import { SchedulerForm } from './SchedulerForm';
import { SwitchForm } from './SwitchForm';
import { EmailForm } from './EmailForm';
import { DeviceAlertForm } from './DeviceAlertForm';
import { DelayForm } from './DelayForm';
import { SmsForm } from './SmsForm';
import { WorkOrderForm } from './WorkOrderForm';
import { ReportForm } from './ReportForm';

/**
 * The selected node's configuration in the stock FDS Drawer (its defaults:
 * popup variant, scrim, focus kept inside; Esc or a click outside closes it).
 * Edits apply immediately and are autosaved and undoable.
 */
export function NodeDrawer({ onDelete }: { onDelete: (id: string) => void }) {
  const { editor, selection, setSelection, ctx, issues, showAllErrors, focusField, setFocusField, run } = useWorkflow();
  const selected = selection?.kind === 'node' ? getNode(editor.graph, selection.id) : undefined;
  // Keep showing the last node while the drawer animates out.
  const lastNode = useRef<WfNode | undefined>(selected);
  if (selected) lastNode.current = selected;
  const node = selected ?? lastNode.current;

  const nameRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());

  useEffect(() => setTouched(new Set()), [node?.id]);

  // "Go to node" from the Issues menu or a failed run: focus the field in question.
  useEffect(() => {
    if (!selected || !focusField) return;
    const t = window.setTimeout(() => {
      const el = bodyRef.current?.querySelector<HTMLElement>(`[data-field="${focusField}"] input, [data-field="${focusField}"] textarea, [data-field="${focusField}"] button`);
      el?.focus();
      setTouched((s) => new Set(s).add(focusField));
      setFocusField(null);
    }, 50);
    return () => window.clearTimeout(t);
  }, [selected?.id, focusField]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!node) return null;
  const def = NODE_TYPES[node.type];
  const nodeIssues = issues.filter((i) => i.nodeId === node.id);
  const errorFor = (field: string) => (showAllErrors || touched.has(field)
    ? nodeIssues.find((i) => i.severity === 'error' && i.field === field)?.message
    : undefined);
  const touch = (field: string) => setTouched((s) => (s.has(field) ? s : new Set(s).add(field)));
  const fieldless = nodeIssues.filter((i) => i.severity === 'error' && !i.field);
  const warnings = nodeIssues.filter((i) => i.severity === 'warning');
  const result = run?.nodes.find((r) => r.nodeId === node.id);
  const hasErrors = nodeIssues.some((i) => i.severity === 'error');

  const props = {
    ctx,
    errorFor,
    touch,
    onConfig: (patch: object, mergeKey?: string) => editor.update((g) => updateConfig(g, node.id, patch), mergeKey),
    onGraph: (fn: (g: Graph) => Graph, mergeKey?: string) => editor.update(fn, mergeKey),
    newId: (prefix: string) => uid(prefix),
  };

  return (
    <Drawer isOpen={!!selected} onDismiss={() => setSelection(null)} initialFocusRef={nameRef}>
      <DrawerHeader
        title={node.name || def.defaultName}
        subtitle={def.label}
        leading={<NodeTile type={node.type} size="xs" />}
        titleSuffix={result ? <Badge label={NODE_RUN_STATUS[result.status].label} color={NODE_RUN_STATUS[result.status].color} />
          : hasErrors ? <Badge label="Needs setup" color="Notice" /> : undefined}
      />
      <DrawerBody>
        <div className="io-form" ref={bodyRef}>
          {result?.status === 'failed' && result.message && (
            <Alert color="Negative" isDismissible={false} isFullWidth title="Failed in the last run" description={result.message} />
          )}
          {fieldless.map((i) => <Alert key={i.id} color="Negative" isDismissible={false} isFullWidth description={i.message} />)}
          {warnings.length > 0 && (
            <Alert color="Notice" isDismissible={false} isFullWidth description={warnings.map((w) => w.message).join(' ')} />
          )}
          <div data-field="name">
            <TextInput
              ref={nameRef}
              label="Name"
              isRequired
              necessityIndicator="required"
              value={node.name}
              onChange={({ value }) => editor.update((g) => renameNode(g, node.id, value ?? ''), `${node.id}:name`)}
              onBlur={() => touch('name')}
              {...errorProps(errorFor('name'))}
            />
          </div>
          {node.type === 'ioForms' && <IoFormsForm node={node} {...(props as Omit<NodeFormProps<IoFormsNode>, 'node'>)} />}
          {node.type === 'scheduler' && <SchedulerForm node={node} {...(props as Omit<NodeFormProps<SchedulerNode>, 'node'>)} />}
          {node.type === 'switch' && <SwitchForm node={node} {...(props as Omit<NodeFormProps<SwitchNode>, 'node'>)} />}
          {node.type === 'deviceAlert' && <DeviceAlertForm node={node} {...(props as Omit<NodeFormProps<DeviceAlertNode>, 'node'>)} />}
          {node.type === 'delay' && <DelayForm node={node} {...(props as Omit<NodeFormProps<DelayNode>, 'node'>)} />}
          {node.type === 'email' && <EmailForm node={node} {...(props as Omit<NodeFormProps<EmailNode>, 'node'>)} />}
          {node.type === 'sms' && <SmsForm node={node} {...(props as Omit<NodeFormProps<SmsNode>, 'node'>)} />}
          {node.type === 'workOrder' && <WorkOrderForm node={node} {...(props as Omit<NodeFormProps<WorkOrderNode>, 'node'>)} />}
          {node.type === 'report' && <ReportForm node={node} {...(props as Omit<NodeFormProps<ReportNode>, 'node'>)} />}
        </div>
      </DrawerBody>
      {/* Out of the form's flow, pinned to the bottom: the drawer's one action (FDS DrawerFooter). Undo follows in a toast. */}
      <DrawerFooter>
        <Button variant="secondary" tone="negative" label="Delete node" onClick={() => onDelete(node.id)} />
      </DrawerFooter>
    </Drawer>
  );
}
