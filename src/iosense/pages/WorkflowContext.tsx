import { useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { replayFrame } from '../ui/runs';
import type { Workflow } from '../domain/types';
import { triggerVariables } from '../domain/variables';
import { getTrigger } from '../engine/graph';
import { blockingIssues, validateWorkflow } from '../engine/validate';
import { useIoWorkflows } from '../store/workflowStore';
import { useIoSession } from '../store/sessionStore';
import type { Selection } from '../canvas/Canvas';
import { useWorkflowEditor } from './useWorkflowEditor';
import { Ctx, type WorkflowContextValue } from './workflowCtx';

/** How long each step shows while a run replays. */
const REPLAY_STEP_MS = 900;

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
  const shown = pastRun ?? testRun;
  // Replay draws the shown run one step at a time; it ends when another run is shown.
  const [replayState, setReplay] = useState<{ runId: string; step: number; playing: boolean } | null>(null);
  const total = shown?.path.length ?? 0;
  const replay = replayState && shown && replayState.runId === shown.id && shown.status !== 'running'
    ? { step: Math.min(replayState.step, total), total, playing: replayState.playing }
    : null;
  const run = replay && shown ? replayFrame(shown, replay.step) : shown;
  const [selection, setSelection] = useState<Selection>(null);
  const [focusField, setFocusField] = useState<string | null>(null);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [logNodeId, setLogNodeId] = useState<string | null>(null);

  // Autoplay: a step every REPLAY_STEP_MS, stopping at the end. The logs follow the step being replayed.
  useEffect(() => {
    if (!replay?.playing) return undefined;
    const t = window.setTimeout(() => setReplay((r) => (r ? { ...r, step: r.step + 1, playing: r.step + 1 < total } : r)), REPLAY_STEP_MS);
    return () => window.clearTimeout(t);
  }, [replay?.playing, replay?.step, total]);
  useEffect(() => {
    if (replay && shown) setLogNodeId(shown.path[replay.step] ?? shown.failedNodeId ?? null);
  }, [replay?.step, !!replay]); // eslint-disable-line react-hooks/exhaustive-deps

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
    replay,
    startReplay: (runId) => {
      const id = runId ?? shown?.id;
      if (id) setReplay({ runId: id, step: 0, playing: true });
    },
    stepReplay: (delta) => setReplay((r) => (r ? { ...r, step: Math.max(0, Math.min(total, r.step + delta)), playing: false } : r)),
    toggleReplay: () => setReplay((r) => (r ? (r.playing ? { ...r, playing: false } : { ...r, step: r.step >= total ? 0 : r.step, playing: true }) : r)),
    stopReplay: () => { setReplay(null); setLogNodeId(null); },
    goToNode: (nodeId, field) => {
      setSelection({ kind: 'node', id: nodeId });
      setFocusField(field ?? null);
    },
    announcement,
    // Clear first so repeating the same words is announced again.
    announce: (message) => { setAnnouncement(''); window.setTimeout(() => setAnnouncement(message), 50); },
  }), [workflow, editor, ctx, issues, blocking, selection, focusField, showAllErrors, run, pastRun, testRun, announcement, logNodeId, replayState, shown, total]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
