import { useContext, useMemo, useState, type ReactNode } from 'react';
import type { Workflow } from '../domain/types';
import { triggerVariables } from '../domain/variables';
import { getTrigger } from '../engine/graph';
import { blockingIssues, validateWorkflow } from '../engine/validate';
import { useIoWorkflows } from '../store/workflowStore';
import { useIoSession } from '../store/sessionStore';
import type { Selection } from '../canvas/Canvas';
import { useWorkflowEditor } from './useWorkflowEditor';
import { Ctx, type WorkflowContextValue } from './workflowCtx';

export function useWorkflow() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWorkflow must be used inside WorkflowProvider');
  return v;
}

export function WorkflowProvider({ workflow, children }: { workflow: Workflow; children: ReactNode }) {
  const editor = useWorkflowEditor(workflow.id);
  const forms = useIoWorkflows((s) => s.forms);
  const users = useIoWorkflows((s) => s.users);
  const devices = useIoWorkflows((s) => s.devices);
  const reports = useIoWorkflows((s) => s.reports);
  const testRun = useIoSession((s) => s.runs[workflow.id]);
  const pastRun = useIoSession((s) => s.pastRuns[workflow.id]);
  const run = pastRun ?? testRun;
  const [selection, setSelection] = useState<Selection>(null);
  const [focusField, setFocusField] = useState<string | null>(null);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [logNodeId, setLogNodeId] = useState<string | null>(null);

  const trigger = getTrigger(editor.graph);
  const vars = useMemo(() => triggerVariables(trigger, forms), [trigger, forms]);
  const ctx = useMemo(() => ({ forms, users, devices, reports, vars }), [forms, users, devices, reports, vars]);
  const issues = useMemo(() => validateWorkflow(editor.graph, { ...ctx, now: Date.now() }), [editor.graph, ctx]);
  const blocking = useMemo(() => blockingIssues(editor.graph, issues), [editor.graph, issues]);

  const value = useMemo<WorkflowContextValue>(() => ({
    workflow, editor, ctx, issues, blocking, selection, setSelection, focusField, setFocusField, showAllErrors, setShowAllErrors,
    run,
    inspecting: !!pastRun,
    testRun,
    // Reads the store, not this render: a running test calls it from the render it started in.
    setRun: (e, isInspecting = false) => {
      const s = useIoSession.getState();
      const test = s.runs[workflow.id];
      const before = s.pastRuns[workflow.id] ?? test;
      if (!e) {
        s.setRun(workflow.id, undefined);
        s.setPastRun(workflow.id, undefined);
      } else if (isInspecting) {
        // Opening the test run itself from History just shows it.
        s.setPastRun(workflow.id, e.id === test?.id ? undefined : e);
      } else {
        // A new test takes over the panel; a running test's own updates leave an open past run in place.
        if (e.id !== test?.id) s.setPastRun(workflow.id, undefined);
        s.setRun(workflow.id, e);
      }
      const now = useIoSession.getState();
      if ((now.pastRuns[workflow.id] ?? now.runs[workflow.id])?.id !== before?.id) setLogNodeId(null);
    },
    showTestRun: () => {
      setLogNodeId(null);
      useIoSession.getState().setPastRun(workflow.id, undefined);
    },
    logNodeId,
    setLogNodeId,
    goToNode: (nodeId, field) => {
      setSelection({ kind: 'node', id: nodeId });
      setFocusField(field ?? null);
    },
    announcement,
    // Clear first so repeating the same words is announced again.
    announce: (message) => { setAnnouncement(''); window.setTimeout(() => setAnnouncement(message), 50); },
  }), [workflow, editor, ctx, issues, blocking, selection, focusField, showAllErrors, run, pastRun, testRun, announcement, logNodeId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
