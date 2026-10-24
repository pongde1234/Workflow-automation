import { resolveTemplate, stringify, type Scope } from '@/engine/expressions';
import type {
  DelayNode, DeviceAlertNode, Directory, EmailNode, Execution, ExecutionSource, Graph, NodeResult, NodeType, ReportNode, SmsNode,
  SwitchNode, TriggerVariable, WfNode, WorkOrderNode,
} from '../domain/types';
import { DEFAULT_HANDLE, OUT_HANDLE } from '../domain/types';
import { isActionType } from '../domain/nodeTypes';
import { WEEKDAYS, triggerVariables } from '../domain/variables';
import { edgeFrom, flowOrder, getNode, getTrigger, reachable, reachableFrom } from './graph';
import { resolveRecipients } from './email';
import { resolvePhones } from './phone';
import { conditionLabel, evaluate, toNumber } from './operators';
import { formatDate, formatRunTime, formatTime, toYmd } from './schedule';
import { FORMAT_LABEL, PRIORITY_LABEL, delayLabel, periodText, slug, watched, withUnit } from './nodeText';

export interface SimClock { now(): number; sleep(ms: number): Promise<void> }

export const realClock: SimClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/** Simulated time each node takes: a base per type plus a spread derived from the ids, so it is reproducible. */
const NODE_MS: Record<NodeType, number> = {
  ioForms: 120, scheduler: 80, deviceAlert: 90, switch: 30, delay: 40, email: 640, sms: 420, workOrder: 520, report: 1400,
};

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

const simulatedMs = (type: NodeType, execId: string, nodeId: string) => NODE_MS[type] + (hash(execId + nodeId) % (NODE_MS[type] / 2 + 1));

export interface SimulationInput {
  execId: string;
  workflow: { id: string; name: string };
  graph: Graph;
  source: ExecutionSource;
  /** IO Forms: values by field key. Scheduler: `{ firedAt }`. Device alert: see `deviceAlertData`. */
  triggerData: Record<string, unknown>;
  ctx: Directory;
  clock: SimClock;
  /** Visible pause per node; 0 runs instantly (tests, seed, reduced motion). */
  stepMs?: number;
  onUpdate?: (e: Execution) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Trigger values keyed by variable id. */
export function triggerValues(trigger: WfNode | undefined, data: Record<string, unknown>): Record<string, unknown> {
  if (trigger?.type === 'scheduler') {
    const d = new Date(Number(data.firedAt));
    return { 'run.date': formatDate(toYmd(d)), 'run.weekday': WEEKDAYS[d.getDay()], 'run.time': formatTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`) };
  }
  if (trigger?.type === 'deviceAlert') {
    return {
      'device.name': data.device, 'device.location': data.location, 'device.parameter': data.parameter, 'device.reading': data.reading,
      'device.limit': data.limit, 'device.unit': data.unit, 'device.time': formatRunTime(Number(data.firedAt)),
    };
  }
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [`form.${k}`, v]));
}

/** Scope for `{{Label}}` tokens: labels as typed and lower-cased. */
export function labelScope(vars: TriggerVariable[], values: Record<string, unknown>): Scope {
  const scope: Scope = {};
  for (const v of vars) {
    scope[v.label] = values[v.id];
    scope[v.label.toLowerCase()] = values[v.id];
  }
  return scope;
}

export function render(template: string, scope: Scope) {
  const withLower = template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (m, t: string) => (t in scope ? m : `{{${t.toLowerCase()}}}`));
  return stringify(resolveTemplate(withLower, scope).value);
}

/**
 * What a Device alert hands on for one reading: the device, the reading and
 * its limit. Without a reading it takes one just past the limit.
 */
export function deviceAlertData(trigger: DeviceAlertNode, devices: Directory['devices'], now: number, reading?: number): Record<string, unknown> {
  const c = trigger.config;
  const w = watched(c, devices);
  const n = toNumber(c.limit);
  const limit = Number.isFinite(n) ? n : 0;
  const step = Math.max(1, Math.round(Math.abs(limit) * 0.05));
  return {
    device: w?.device.name ?? '', location: w?.device.location ?? '', parameter: w?.parameter.label ?? '', unit: w?.parameter.unit ?? '',
    limit, reading: reading ?? (c.op === 'above' ? limit + step : limit - step), firedAt: now,
  };
}

/** Pre-filled test data: the form's sample values, a reading past the limit, or "now" for a schedule. */
export function defaultTestData(trigger: WfNode | undefined, dir: Directory, now: number): Record<string, unknown> {
  if (trigger?.type === 'ioForms') {
    const form = dir.forms.find((f) => f.id === trigger.config.formId);
    return Object.fromEntries((form?.fields ?? []).map((f) => [f.key, f.sample]));
  }
  if (trigger?.type === 'deviceAlert') return deviceAlertData(trigger, dir.devices, now);
  return { firedAt: now };
}

interface StepResult { status: 'success' | 'failed'; message: string; handle: string; takenLabel?: string; field?: string; output?: unknown }

const ok = (message: string, output?: unknown): StepResult => ({ status: 'success', message, handle: OUT_HANDLE, ...(output !== undefined ? { output } : {}) });
const fail = (message: string, field: string): StepResult => ({ status: 'failed', message, handle: OUT_HANDLE, field });
const people = (k: number) => `${k} ${k === 1 ? 'person' : 'people'}`;

function runSwitch(n: SwitchNode, vars: TriggerVariable[], values: Record<string, unknown>): StepResult {
  const checked: { condition: string; matched: boolean; note?: string }[] = [];
  for (const c of n.config.conditions) {
    const v = vars.find((x) => x.id === c.field);
    if (!v || !c.op) continue;
    const label = conditionLabel(c, vars);
    const r = evaluate(c.op, values[v.id], c.value, v.type, v.label);
    checked.push({ condition: label, matched: r.matched, ...(r.note ? { note: r.note } : {}) });
    if (r.matched) return { status: 'success', message: `Matched ‘${label}’.`, handle: c.id, takenLabel: label, output: { checked } };
  }
  const notes = checked.flatMap((c) => (c.note ? [c.note] : []));
  const why = notes.length ? ` ${[...new Set(notes)].join('. ')}.` : '';
  return { status: 'success', message: `No condition matched, so Default ran.${why}`, handle: DEFAULT_HANDLE, takenLabel: 'Default', output: { checked } };
}

function runDeviceAlert(n: DeviceAlertNode, data: Record<string, unknown>, output: unknown): StepResult {
  const unit = String(data.unit ?? '');
  return ok(`${data.device} ${String(data.parameter).toLowerCase()} read ${withUnit(String(data.reading), unit)}, ${n.config.op} the ${withUnit(String(data.limit), unit)} limit.`, output);
}

function runDelay(n: DelayNode): StepResult {
  return ok(`Waited ${delayLabel(n.config)} (simulated: a test doesn’t really wait).`, { wait: delayLabel(n.config) });
}

function runEmail(n: EmailNode, dir: Directory, vars: TriggerVariable[], values: Record<string, unknown>, scope: Scope): StepResult {
  const { recipients, problems } = resolveRecipients(n.config, { users: dir.users, vars, values });
  const p = problems[0];
  if (p) {
    const message = p.reason === 'empty'
      ? `Recipient ‘${p.label}’ was empty in this submission. No email was sent.`
      : p.reason === 'invalid'
        ? `Recipient ‘${p.value}’ isn’t a valid email address. No email was sent.`
        : `${p.label} is no longer available. No email was sent.`;
    return fail(message, p.source === 'other' ? 'other' : 'to');
  }
  if (recipients.length === 0) return fail('There were no recipients. No email was sent.', 'to');
  const output = {
    to: recipients.map((r) => r.address),
    subject: render(n.config.subject, scope),
    body: render(n.config.body, scope),
    simulated: true,
  };
  return ok(`Simulated: would send to ${recipients.length} ${recipients.length === 1 ? 'recipient' : 'recipients'}.`, output);
}

function runSms(n: SmsNode, dir: Directory, scope: Scope): StepResult {
  const { recipients, problems } = resolvePhones(n.config, dir.users);
  const p = problems[0];
  if (p) {
    return p.reason === 'invalid'
      ? fail(`‘${p.label}’ isn’t a valid phone number. No text was sent.`, 'other')
      : fail(`${p.label} has no phone number. No text was sent.`, 'to');
  }
  if (recipients.length === 0) return fail('There were no recipients. No text was sent.', 'to');
  return ok(`Simulated: would text ${people(recipients.length)}.`, { to: recipients.map((r) => r.number), message: render(n.config.message, scope), simulated: true });
}

function runWorkOrder(n: WorkOrderNode, dir: Directory, execId: string, scope: Scope): StepResult {
  const c = n.config;
  const number = `WO-${1000 + (hash(execId + n.id) % 9000)}`;
  const assignee = dir.users.find((u) => u.id === c.assignee);
  const output = {
    workOrder: number, title: render(c.title, scope), priority: PRIORITY_LABEL[c.priority], assignee: assignee?.name ?? 'Maintenance queue',
    description: render(c.description, scope), simulated: true,
  };
  return ok(`Simulated: would raise ${number} (${PRIORITY_LABEL[c.priority]} priority) for ${assignee?.name ?? 'the maintenance queue'}.`, output);
}

function runReport(n: ReportNode, dir: Directory, now: number): StepResult {
  const c = n.config;
  const report = dir.reports.find((r) => r.id === c.reportId);
  if (!report) return fail('The report no longer exists. Nothing was sent.', 'reportId');
  const to = c.to.map((ref) => dir.users.find((u) => `user:${u.id}` === ref)?.email).filter((e): e is string => !!e);
  if (to.length === 0) return fail('There were no recipients. No report was sent.', 'to');
  const period = periodText(c.period, now);
  const file = `${slug(report.name)}-${toYmd(period.end)}.${c.format}`;
  return ok(`Simulated: would email ${file} to ${people(to.length)}.`, { report: report.name, period: period.text, format: FORMAT_LABEL[c.format], file, to, simulated: true });
}

/** Short failure reason for summaries: "recipient was empty". */
function shortReason(message: string) {
  if (message.includes('was empty')) return 'recipient was empty';
  if (message.includes('valid email') || message.includes('valid phone')) return 'invalid recipient';
  if (message.includes('no phone number')) return 'recipient has no phone number';
  if (message.includes('no recipients')) return 'no recipients';
  return 'failed';
}

const NOUN: Partial<Record<NodeType, [string, string]>> = {
  email: ['email', 'emails'], sms: ['text', 'texts'], workOrder: ['work order', 'work orders'], report: ['report', 'reports'],
};

/** "2 emails and 1 work order". */
function actionsDone(types: NodeType[]): string {
  const counts = new Map<NodeType, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  const parts = [...counts].map(([t, k]) => `${k} ${NOUN[t]?.[k === 1 ? 0 : 1] ?? 'actions'}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? '';
}

/**
 * Walks the workflow from its trigger. Deterministic: time comes from `clock`,
 * durations are fixed per node type, and nothing is ever actually sent.
 */
export async function runSimulation(input: SimulationInput): Promise<Execution> {
  const { graph: g, clock, ctx } = input;
  const stepMs = input.stepMs ?? 0;
  const order = flowOrder(g);
  const trigger = getTrigger(g);
  const vars = triggerVariables(trigger, ctx.forms);
  const values = triggerValues(trigger, input.triggerData);
  const scope = labelScope(vars, values);
  const live = reachable(g);

  const results = new Map<string, NodeResult>(order.map((id) => {
    const n = getNode(g, id)!;
    const base: NodeResult = { nodeId: id, name: n.name, type: n.type, status: 'not_run' };
    return [id, live.has(id) ? base : { ...base, status: 'skipped', message: 'Not connected to the trigger.' }];
  }));
  const path: string[] = [];
  const exec: Execution = {
    id: input.execId, workflowId: input.workflow.id, workflowName: input.workflow.name, source: input.source,
    status: 'running', startedAt: clock.now(), triggerData: input.triggerData, nodes: [], path, summary: 'Running…',
  };
  const emit = () => input.onUpdate?.({ ...exec, nodes: order.map((id) => results.get(id)!), path: [...path] });
  const set = (id: string, patch: Partial<NodeResult>) => results.set(id, { ...results.get(id)!, ...patch });

  let failed: WfNode | undefined;
  let cur: WfNode | undefined = trigger;
  if (cur) set(cur.id, { status: 'queued' });
  emit();

  while (cur) {
    set(cur.id, { status: 'running' });
    emit();
    if (stepMs > 0) await clock.sleep(stepMs);

    let r: StepResult;
    switch (cur.type) {
      case 'ioForms': r = ok('Form submission received.', scopeOut(vars, values)); break;
      case 'scheduler': r = ok(`Ran ${formatRunTime(Number(input.triggerData.firedAt))} (simulated).`, scopeOut(vars, values)); break;
      case 'deviceAlert': r = runDeviceAlert(cur, input.triggerData, scopeOut(vars, values)); break;
      case 'switch': r = runSwitch(cur, vars, values); break;
      case 'delay': r = runDelay(cur); break;
      case 'email': r = runEmail(cur, ctx, vars, values, scope); break;
      case 'sms': r = runSms(cur, ctx, scope); break;
      case 'workOrder': r = runWorkOrder(cur, ctx, input.execId, scope); break;
      case 'report': r = runReport(cur, ctx, exec.startedAt); break;
    }

    path.push(cur.id);
    set(cur.id, {
      status: r.status, message: r.message, durationMs: simulatedMs(cur.type, input.execId, cur.id),
      ...(r.takenLabel ? { takenHandle: r.handle, takenLabel: r.takenLabel } : {}),
      ...(r.field ? { field: r.field } : {}),
      ...(r.output !== undefined ? { output: r.output } : {}),
    });
    if (r.status === 'failed') { failed = cur; break; }

    const next = edgeFrom(g, cur.id, r.handle);
    cur = next ? getNode(g, next.target) : undefined;
    if (cur) set(cur.id, { status: 'queued' });
    emit();
  }

  const afterFailure = failed ? reachableFrom(g, failed.id) : new Set<string>();
  for (const id of order) {
    const res = results.get(id)!;
    if (res.status !== 'not_run') continue;
    if (afterFailure.has(id)) set(id, { message: `Didn’t run because ‘${failed!.name}’ failed.` });
    else set(id, { status: 'skipped', message: 'Skipped: condition not met.' });
  }

  exec.status = failed || !trigger ? 'failed' : 'success';
  exec.durationMs = path.reduce((sum, id) => sum + (results.get(id)!.durationMs ?? 0), 0);
  if (!trigger) exec.summary = 'Failed: the workflow has no trigger';
  else if (failed) {
    exec.failedNodeId = failed.id;
    exec.summary = `Failed at ${failed.name}: ${shortReason(results.get(failed.id)!.message ?? '')}`;
  } else {
    const done = actionsDone(path.map((id) => getNode(g, id)!.type).filter(isActionType));
    exec.summary = done ? `Completed: ${done} simulated` : 'Completed';
  }
  const final: Execution = { ...exec, nodes: order.map((id) => results.get(id)!), path: [...path] };
  input.onUpdate?.(final);
  return final;
}

/** Trigger output shown in the execution detail: values by label. */
function scopeOut(vars: TriggerVariable[], values: Record<string, unknown>) {
  return Object.fromEntries(vars.map((v) => [v.label, values[v.id] ?? null]));
}
