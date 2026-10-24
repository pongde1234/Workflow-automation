import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toastStore } from '@faclon-labs/fds';
import { uid } from '@/lib/util';
import { createNode } from '../domain/nodeTypes';
import { flowOrder, getNode } from '../engine/graph';
import { removeNode } from '../engine/graphOps';
import { Canvas } from '../canvas/Canvas';
import { ConnectModal } from '../canvas/ConnectModal';
import { NodeDrawer } from '../nodes/NodeDrawer';
import { useWorkflow } from './WorkflowContext';
import { RunLogs } from './RunLogs';
import { WorkflowControls, useWorkflowActions } from './WorkflowControls';
import { HistoryDrawer } from './HistoryDrawer';
import { editorPath, runPath } from '../lib/links';
import { useIoExecutions } from '../store/executionStore';
import type { Execution } from '../domain/types';

const DELETE_TOAST_ID = 'iosense-node-deleted';
const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/** Focus a node's Card button by node id (the Card overlay is the card's last child). */
export function focusNodeCard(id: string) {
  const card = document.querySelector(`[data-node-id="${id}"] .ds-card`);
  (card?.lastElementChild as HTMLElement | null)?.focus({ preventScroll: true });
}

interface EditorViewProps {
  rightInset: number;
  onRetest: (e: Execution) => void;
  onTest: () => void;
  isTesting: boolean;
  historyOpen: boolean;
}

export function EditorView({ rightInset, onRetest, onTest, isTesting, historyOpen }: EditorViewProps) {
  const { workflow, editor, ctx, issues, selection, setSelection, run, setRun, goToNode, announce, setLogNodeId } = useWorkflow();
  const [connectFor, setConnectFor] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const actions = useWorkflowActions(onTest);

  // "Open in editor" from an execution: draw that run and open the node that failed.
  const executionId = params.get('execution');
  useEffect(() => {
    if (!executionId) return;
    const e = useIoExecutions.getState().executions.find((x) => x.id === executionId);
    setParams({}, { replace: true });
    if (!e) return;
    setRun(e, true);
    const focus = e.failedNodeId ?? params.get('node');
    if (focus && getNode(editor.latest.current, focus)) {
      goToNode(focus, e.nodes.find((n) => n.nodeId === focus)?.field);
    }
  }, [executionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Undo / redo / save shortcuts, outside text fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); editor.flush(); return; }
      if (isTyping(e.target)) return;
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); editor.undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); editor.redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor]);

  const deleteNode = (id: string) => {
    const g = editor.latest.current;
    const node = getNode(g, id);
    if (!node) return;
    const order = flowOrder(g);
    const prev = order[order.indexOf(id) - 1] ?? order.find((x) => x !== id);
    editor.update((gr) => removeNode(gr, id));
    if (selection?.kind === 'node' && selection.id === id) setSelection(null);
    toastStore.show({
      id: DELETE_TOAST_ID,
      color: 'Neutral',
      content: `Deleted ‘${node.name}’`,
      autoDismiss: false,
      action: { text: 'Undo', onClick: ({ toastId }) => { editor.undo(); toastStore.dismiss(toastId); } },
    });
    if (prev) window.setTimeout(() => focusNodeCard(prev), 0);
  };

  return (
    <>
      <WorkflowControls actions={actions} isTesting={isTesting} />
      <div className="io-workflow__stage">
        <Canvas
          workflowId={workflow.id}
          graph={editor.graph}
          ctx={ctx}
          issues={issues}
          run={run}
          selection={selection}
          rightInset={rightInset}
          onSelect={(s) => {
            setSelection(s);
            // Picking a node on the canvas also shows it in the run logs.
            if (s?.kind === 'node' && run?.nodes.some((n) => n.nodeId === s.id)) setLogNodeId(s.id);
          }}
          onEdit={editor.update}
          onCreateNode={(type, at) => createNode(type, at, editor.latest.current.nodes.map((n) => n.name), uid)}
          onDeleteNode={deleteNode}
          onConnectRequest={setConnectFor}
          onAnnounce={announce}
        />
      </div>
      <RunLogs onRetest={onRetest} />
      <NodeDrawer onDelete={deleteNode} />
      <ConnectModal
        nodeId={connectFor}
        graph={editor.graph}
        ctx={ctx}
        onApply={(next) => { editor.update(next); announce('Connection saved.'); }}
        onDismiss={() => setConnectFor(null)}
      />
      <HistoryDrawer
        isOpen={historyOpen}
        onDismiss={() => navigate(editorPath(workflow.id))}
        onPick={(e) => navigate(runPath(workflow.id, e.id))}
        onTest={actions.test}
      />
    </>
  );
}
