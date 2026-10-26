import { useEffect } from 'react';
import { uid } from '@/lib/util';
import type { Directory, ExecutionSource, WfNode, Workflow } from '../domain/types';
import { getTrigger } from '../engine/graph';
import { deviceAlertData, realClock, runSimulation } from '../engine/simulate';
import { prefersReducedMotion } from '../lib/useViewportWidth';
import { useIoExecutions } from '../store/executionStore';
import { useIoSession } from '../store/sessionStore';
import { useIoWorkflows } from '../store/workflowStore';

/** Live mode's pace: one event every 4–8 s, so a demo keeps moving without flooding the lists. */
const MIN_GAP_MS = 4000;
const SPREAD_MS = 4000;
/** How long each step shows on an open canvas (as a test). */
const STEP_MS = 450;
/** Roughly one event in eight leaves an email field blank, so some runs fail the way real ones do. */
const BLANK_EMAIL = 0.125;

/**
 * What a sample event carries, built from the trigger itself so it works for
 * any workflow: a form's fields varied around their samples (choices picked,
 * numbers nudged, an email sometimes left blank), a device reading just past
 * its limit, or a schedule's time.
 */
export function liveTriggerData(trigger: WfNode, dir: Directory, now: number, rand: () => number): Record<string, unknown> {
  if (trigger.type === 'deviceAlert') {
    const limit = Number(trigger.config.limit) || 1;
    const past = 1 + 0.02 + rand() * 0.1;
    const reading = Math.round((trigger.config.op === 'above' ? limit * past : limit / past) * 10) / 10;
    return deviceAlertData(trigger, dir.devices, now, reading);
  }
  if (trigger.type === 'ioForms') {
    const form = dir.forms.find((f) => f.id === trigger.config.formId);
    const data: Record<string, unknown> = {};
    for (const f of form?.fields ?? []) {
      if (f.options?.length) data[f.key] = f.options[Math.floor(rand() * f.options.length)];
      else if (f.type === 'number' && typeof f.sample === 'number') data[f.key] = Math.round(f.sample * (0.7 + rand() * 0.6));
      else if (f.type === 'email') data[f.key] = rand() < BLANK_EMAIL ? '' : f.sample;
      else data[f.key] = f.sample;
    }
    return data;
  }
  return { firedAt: now };
}

const SOURCE: Partial<Record<WfNode['type'], ExecutionSource>> = { ioForms: 'form', deviceAlert: 'device', scheduler: 'schedule' };

/** Forms and devices fire more often than schedules, as on a plant floor. */
function pickWorkflow(ws: Workflow[], rand: () => number): Workflow | undefined {
  const weights = ws.map((w) => (getTrigger(w.published!.graph)?.type === 'scheduler' ? 1 : 3));
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  return ws.find((_, i) => (r -= weights[i]) < 0);
}

/**
 * While live mode is on, active workflows fire sample events every few
 * seconds, through the same simulation as a test. Runs land in Run history,
 * failures reach the bell, the Overview moves; a workflow whose canvas is
 * open animates the run there (unless a test or a past run is showing).
 */
export function useLiveMode() {
  const on = useIoSession((s) => s.live);
  useEffect(() => {
    if (!on) return undefined;
    let stopped = false;
    let timer = 0;
    const fire = async () => {
      const store = useIoWorkflows.getState();
      const active = store.workflows.filter((w) => w.status === 'active' && w.published && getTrigger(w.published.graph));
      const w = pickWorkflow(active, Math.random);
      if (w) {
        const graph = w.published!.graph;
        const trigger = getTrigger(graph)!;
        const now = Date.now();
        const execId = uid('ex');
        const isOpen = () => window.location.pathname === `/iosense/workflows/${w.id}`;
        let stored = false;
        await runSimulation({
          execId, workflow: { id: w.id, name: w.name }, graph, source: SOURCE[trigger.type] ?? 'form', ctx: store,
          triggerData: liveTriggerData(trigger, store, now, Math.random), clock: realClock, stepMs: prefersReducedMotion() ? 0 : STEP_MS,
          onUpdate: (e) => {
            // Stored when it starts and when it ends; the steps between only animate.
            if (!stored || e.status !== 'running') { useIoExecutions.getState().upsert(e); stored = true; }
            const s = useIoSession.getState();
            const showing = s.runs[w.id];
            const busy = s.pastRuns[w.id] || (showing && showing.id !== execId && showing.status === 'running');
            if (isOpen() && !busy) s.setRun(w.id, e);
          },
        });
      }
      if (!stopped) timer = window.setTimeout(fire, MIN_GAP_MS + Math.random() * SPREAD_MS);
    };
    timer = window.setTimeout(fire, 1200);
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [on]);
}
