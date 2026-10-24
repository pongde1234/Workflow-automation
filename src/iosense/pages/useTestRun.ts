import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toastStore } from '@faclon-labs/fds';
import { uid } from '@/lib/util';
import type { DeviceAlertNode, Execution, IoFormsNode } from '../domain/types';
import { getTrigger } from '../engine/graph';
import { defaultTestData, deviceAlertData, realClock, runSimulation } from '../engine/simulate';
import { useIoExecutions } from '../store/executionStore';
import { prefersReducedMotion } from '../lib/useViewportWidth';
import { editorPath, runPath } from '../lib/links';
import { useWorkflow } from './WorkflowContext';

/** Visible pause per node during a test, so people can follow the path. */
const STEP_MS = 550;

export interface TestDataRequest { trigger: IoFormsNode | DeviceAlertNode; data: Record<string, unknown> }

/**
 * Test workflow: asks for sample form values (IO Forms) or a reading (Device
 * alert), or runs straight away (Scheduler), then simulates the run on the canvas and saves it to history.
 */
export function useTestRun() {
  const { workflow, editor, ctx, setRun, setSelection } = useWorkflow();
  const navigate = useNavigate();
  const [dataRequest, setDataRequest] = useState<TestDataRequest | null>(null);
  const [isRunning, setRunning] = useState(false);
  const busy = useRef(false);

  const execute = async (triggerData: Record<string, unknown>) => {
    if (busy.current) return;
    busy.current = true;
    setRunning(true);
    const graph = editor.latest.current;
    let saved = false;
    try {
      const final: Execution = await runSimulation({
        execId: uid('ex'),
        workflow: { id: workflow.id, name: workflow.name },
        graph,
        source: 'test',
        triggerData,
        ctx,
        clock: realClock,
        stepMs: prefersReducedMotion() ? 0 : STEP_MS,
        onUpdate: (e) => {
          setRun(e);
          // Stored at the start and at the end only; progress in between stays in memory.
          if (!saved) { saved = true; useIoExecutions.getState().upsert(e); }
        },
      });
      useIoExecutions.getState().upsert(final);
      setRun(final);
      // A result nobody can see deserves a toast (S3: background result).
      if (!window.location.pathname.startsWith(editorPath(workflow.id))) {
        toastStore.show({
          color: final.status === 'success' ? 'Positive' : 'Negative',
          content: final.status === 'success' ? `Test of ‘${workflow.name}’ succeeded` : `Test of ‘${workflow.name}’ failed: ${final.summary}`,
          action: { text: 'View details', onClick: () => navigate(runPath(workflow.id, final.id)) },
        });
      }
    } finally {
      busy.current = false;
      setRunning(false);
    }
  };

  const start = () => {
    const trigger = getTrigger(editor.latest.current);
    setSelection(null);
    if (trigger?.type === 'ioForms' || trigger?.type === 'deviceAlert') {
      setDataRequest({ trigger, data: defaultTestData(trigger, ctx, Date.now()) });
    } else {
      void execute({ firedAt: Date.now() });
    }
  };

  /** Re-run with the same trigger data as a past execution, on the current draft. */
  const retest = (e: Execution) => {
    navigate(editorPath(workflow.id));
    const trigger = getTrigger(editor.latest.current);
    if (trigger?.type === 'deviceAlert') {
      // Readings go through the form again: the limit may have changed since.
      const past = Number(e.triggerData.reading);
      setDataRequest({ trigger, data: deviceAlertData(trigger, ctx.devices, Date.now(), Number.isFinite(past) ? past : undefined) });
      return;
    }
    const fromSchedule = 'firedAt' in e.triggerData && !('reading' in e.triggerData);
    const sameKind = trigger?.type === 'scheduler' ? fromSchedule : trigger?.type === 'ioForms' && !('firedAt' in e.triggerData);
    if (!sameKind) { start(); return; }
    void execute(trigger?.type === 'scheduler' ? { firedAt: Date.now() } : e.triggerData);
  };

  return {
    start,
    retest,
    isRunning,
    dataRequest,
    runWith: (data: Record<string, unknown>) => { setDataRequest(null); void execute(data); },
    cancel: () => setDataRequest(null),
  };
}
