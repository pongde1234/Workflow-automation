import { extractTokens } from '@/engine/expressions';
import type {
  DelayNode, DeviceAlertNode, Directory, EmailNode, Graph, Issue, ReportNode, SchedulerNode, SmsNode, SwitchNode, TriggerVariable, WfNode,
  WorkOrderNode,
} from '../domain/types';
import { isActionType, isTriggerType } from '../domain/nodeTypes';
import { triggerVariables } from '../domain/variables';
import { edgeFrom, getNode, getTrigger, getTriggers, reachable } from './graph';
import { invalidAddresses } from './email';
import { invalidPhones } from './phone';
import { OPERATORS_BY_TYPE, conditionLabel, isUnary, toDayKey, toNumber } from './operators';
import { isValidDate, isValidTime, onceAt } from './schedule';

export interface ValidationContext extends Directory { now: number }

type Push = (severity: Issue['severity'], message: string, field?: string, code?: string) => void;

/** One SMS is 160 characters; longer messages arrive split. */
export const SMS_LENGTH = 160;

function checkScheduler(n: SchedulerNode, now: number, push: Push) {
  const c = n.config;
  if (c.mode === 'once') {
    if (!isValidDate(c.date)) push('error', 'Choose a date.', 'date');
    if (!isValidTime(c.time)) push('error', 'Choose a time.', 'time');
    const at = onceAt(c);
    if (at !== null && at <= now) push('error', 'This time has already passed. Pick a future date and time.', 'date', 'past');
    return;
  }
  if (c.frequency !== 'minutes' && c.frequency !== 'hourly' && !isValidTime(c.time)) push('error', 'Choose a time.', 'time');
  if (c.frequency === 'weekly' && c.days.length === 0) push('error', 'Choose at least one day.', 'days');
}

function checkDeviceAlert(n: DeviceAlertNode, ctx: ValidationContext, push: Push) {
  const c = n.config;
  const device = ctx.devices.find((d) => d.id === c.deviceId);
  if (!c.deviceId) push('error', 'Choose a device.', 'deviceId');
  else if (!device) push('error', 'The selected device no longer exists. Choose another.', 'deviceId');
  if (!c.parameter) push('error', 'Choose a reading to watch.', 'parameter');
  else if (device && !device.parameters.some((p) => p.key === c.parameter)) push('error', 'This device doesn’t report that reading. Choose another.', 'parameter');
  if (!c.limit.trim()) push('error', 'Enter a limit.', 'limit');
  else if (!Number.isFinite(toNumber(c.limit))) push('error', 'Enter a number.', 'limit');
}

function checkSwitch(n: SwitchNode, g: Graph, vars: TriggerVariable[], push: Push) {
  const cs = n.config.conditions;
  if (cs.length === 0) push('error', 'Add at least one condition.', 'conditions');
  const seen: { key: string; label: string }[] = [];
  cs.forEach((c) => {
    const at = `conditions.${c.id}`;
    const v = vars.find((x) => x.id === c.field);
    if (!c.field) push('error', 'Choose a value to check.', `${at}.field`, c.id);
    else if (!v) push('error', 'This value is no longer provided by the trigger.', `${at}.field`, c.id);
    if (!c.op) push('error', 'Choose a comparison.', `${at}.op`, c.id);
    else if (v && !OPERATORS_BY_TYPE[v.type].includes(c.op)) push('error', 'This comparison doesn’t fit the value. Choose another.', `${at}.op`, c.id);
    if (c.op && !isUnary(c.op)) {
      const value = c.value.trim();
      if (!value) push('error', 'Enter a value to compare with.', `${at}.value`, c.id);
      else if (v?.type === 'number' && !Number.isFinite(toNumber(value))) push('error', 'Enter a number.', `${at}.value`, c.id);
      else if (v?.type === 'date' && !toDayKey(value)) push('error', 'Enter a date.', `${at}.value`, c.id);
    }
    if (v && c.op) {
      const key = `${c.field}|${c.op}|${c.value.trim().toLowerCase()}`;
      const same = seen.find((s) => s.key === key);
      if (same) push('warning', `Never runs: same condition as ‘${same.label}’ above.`, at, `dup-${c.id}`);
      seen.push({ key, label: conditionLabel(c, vars) });
      if (!edgeFrom(g, n.id, c.id)) push('warning', `Nothing happens when ‘${conditionLabel(c, vars)}’ matches.`, at, `open-${c.id}`);
    }
  });
}

function checkDelay(n: DelayNode, push: Push) {
  if (!Number.isFinite(n.config.amount) || n.config.amount < 1) push('error', 'Wait at least 1 minute.', 'amount');
}

/** `{{Value}}` tokens the trigger doesn't provide. */
function checkTokens(text: string, field: string, name: string, vars: TriggerVariable[], push: Push) {
  const labels = new Set(vars.map((v) => v.label.toLowerCase()));
  const unknown = extractTokens(text).filter((t) => !labels.has(t.toLowerCase()));
  if (unknown.length) push('error', `${name} uses ‘{{${unknown[0]}}}’, which this trigger doesn’t provide.`, field, 'token');
}

/** People picked from the directory who have since left it. */
function checkPeople(refs: string[], ctx: ValidationContext, push: Push) {
  for (const ref of refs) {
    if (ref.startsWith('user:') && !ctx.users.some((u) => `user:${u.id}` === ref)) {
      push('error', 'A recipient is no longer in the directory. Remove them.', 'to', ref);
    }
  }
}

function checkEmail(n: EmailNode, vars: TriggerVariable[], ctx: ValidationContext, push: Push) {
  const c = n.config;
  if (c.to.length === 0 && !c.other.trim()) push('error', 'Add at least one recipient.', 'to');
  checkPeople(c.to, ctx, push);
  for (const ref of c.to) {
    if (!ref.startsWith('field:')) continue;
    const v = vars.find((x) => `field:${x.id}` === ref);
    if (!v || !v.isEmail) push('error', 'A form field recipient is no longer available from the trigger. Remove it.', 'to', ref);
    else if (!v.required) push('warning', `If ‘${v.label}’ is left blank on the form, this email fails.`, 'to', `opt-${ref}`);
  }
  const bad = invalidAddresses(c.other);
  if (bad.length) {
    const list = bad.map((a) => `‘${a}’`).join(', ');
    push('error', `${list} ${bad.length === 1 ? 'isn’t a valid email address' : 'aren’t valid email addresses'}.`, 'other');
  }
  if (!c.subject.trim()) push('error', 'Subject is required.', 'subject');
  if (!c.body.trim()) push('error', 'Message is required.', 'body');
  checkTokens(c.subject, 'subject', 'Subject', vars, push);
  checkTokens(c.body, 'body', 'Message', vars, push);
}

function checkSms(n: SmsNode, vars: TriggerVariable[], ctx: ValidationContext, push: Push) {
  const c = n.config;
  if (c.to.length === 0 && !c.other.trim()) push('error', 'Add at least one recipient.', 'to');
  checkPeople(c.to, ctx, push);
  const bad = invalidPhones(c.other);
  if (bad.length) {
    const list = bad.map((a) => `‘${a}’`).join(', ');
    push('error', `${list} ${bad.length === 1 ? 'isn’t a valid phone number' : 'aren’t valid phone numbers'}.`, 'other');
  }
  if (!c.message.trim()) push('error', 'Message is required.', 'message');
  else if (c.message.length > SMS_LENGTH) push('warning', `Longer than ${SMS_LENGTH} characters, so it may arrive as more than one text.`, 'message', 'long');
  checkTokens(c.message, 'message', 'Message', vars, push);
}

function checkWorkOrder(n: WorkOrderNode, vars: TriggerVariable[], ctx: ValidationContext, push: Push) {
  const c = n.config;
  if (!c.title.trim()) push('error', 'Title is required.', 'title');
  if (c.assignee && !ctx.users.some((u) => u.id === c.assignee)) push('error', 'This person is no longer in the directory. Choose someone else.', 'assignee');
  checkTokens(c.title, 'title', 'Title', vars, push);
  checkTokens(c.description, 'description', 'Description', vars, push);
}

function checkReport(n: ReportNode, ctx: ValidationContext, push: Push) {
  const c = n.config;
  if (!c.reportId) push('error', 'Choose a report.', 'reportId');
  else if (!ctx.reports.some((r) => r.id === c.reportId)) push('error', 'This report no longer exists. Choose another.', 'reportId');
  if (c.to.length === 0) push('error', 'Choose who receives the report.', 'to');
  checkPeople(c.to, ctx, push);
}

/** Every problem in a workflow, each tied to a node and (when it applies) a field. */
export function validateWorkflow(g: Graph, ctx: ValidationContext): Issue[] {
  const issues: Issue[] = [];
  const pushFor = (node?: WfNode): Push => (severity, message, field, code = '') => {
    issues.push({ id: `${node?.id ?? 'wf'}:${field ?? ''}:${code}:${severity}`, severity, message, ...(node ? { nodeId: node.id } : {}), ...(field ? { field } : {}) });
  };

  const triggers = getTriggers(g);
  const trigger = getTrigger(g);
  const vars = triggerVariables(trigger, ctx.forms);
  const live = reachable(g);

  if (!trigger) pushFor()('error', 'Add a trigger to start the workflow.');
  triggers.slice(1).forEach((t) => pushFor(t)('error', 'A workflow can only have one trigger. Delete this one.'));
  if (trigger && !g.nodes.some((n) => isActionType(n.type) && live.has(n.id))) {
    pushFor()('error', 'This workflow doesn’t do anything yet. Add an action, such as an Email, after the trigger.', undefined, 'no-action');
  }

  for (const n of g.nodes) {
    const push = pushFor(n);
    if (!n.name.trim()) push('error', 'Name is required.', 'name');
    if (trigger && n.id !== trigger.id && !live.has(n.id) && triggers.every((t) => t.id !== n.id)) {
      push('warning', 'Not connected to the trigger, so it never runs.', undefined, 'unreachable');
    }
    // A disabled node doesn't run, so what it's missing can wait until it's switched back on.
    if (n.settings?.disabled && !isTriggerType(n.type)) continue;
    switch (n.type) {
      case 'ioForms':
        if (!n.config.formId) push('error', 'Choose a form.', 'formId');
        else if (!ctx.forms.some((f) => f.id === n.config.formId)) push('error', 'The selected form no longer exists. Choose another.', 'formId');
        break;
      case 'scheduler': checkScheduler(n, ctx.now, push); break;
      case 'deviceAlert': checkDeviceAlert(n, ctx, push); break;
      case 'switch': checkSwitch(n, g, vars, push); break;
      case 'delay': checkDelay(n, push); break;
      case 'email': checkEmail(n, vars, ctx, push); break;
      case 'sms': checkSms(n, vars, ctx, push); break;
      case 'workOrder': checkWorkOrder(n, vars, ctx, push); break;
      case 'report': checkReport(n, ctx, push); break;
    }
  }
  // A Switch's Default output may stay empty: "do nothing" is a valid choice, so it isn't flagged.
  return issues;
}

/** Errors that stop Test and Publish: workflow-level ones, trigger ones, and those on nodes that would run. */
export function blockingIssues(g: Graph, issues: Issue[]): Issue[] {
  const live = reachable(g);
  return issues.filter((i) => {
    if (i.severity !== 'error') return false;
    const n = getNode(g, i.nodeId);
    return !n || live.has(n.id) || isTriggerType(n.type);
  });
}
