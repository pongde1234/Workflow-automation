import type { Directory, Graph, IoForm, IoUser, SchedulerConfig, SwitchCondition, WfNode, WorkOrderPriority } from '../domain/types';
import { at, cond, device as deviceNode, email, form as formNode, link, report as reportNode, schedule, sms, sw, workOrder } from '../seed/builders';
import { CURRENT_USER_ID } from '../seed/seed';
import { tidyLayout } from '../engine/layout';

/**
 * The simulated assistant's "model": reads a sentence with keyword rules and
 * drafts a workflow from the sample directory (forms, devices, people,
 * reports). No AI is involved; the same sentence always gives the same draft.
 */
export interface Draft {
  name: string;
  graph: Graph;
  /** What was understood, one line per step, in flow order. */
  understood: string[];
  /** What it couldn't work out; those nodes show "Needs setup". */
  notes: string[];
}
export type DraftResult = { ok: true; draft: Draft } | { ok: false; error: string };

type Action = 'email' | 'sms' | 'workOrder' | 'report';

const FORM_WORDS: [RegExp, string][] = [
  [/breakdown|broke down|machine (?:failure|stopped)/, 'f_breakdown'],
  [/quality|inspection|batch|defect/, 'f_quality'],
  [/safety|incident|injur|near miss|spill|fire/, 'f_safety'],
  [/handover|shift change|downtime|rejects/, 'f_handover'],
];
const DEVICE_WORDS: [RegExp, string][] = [
  [/compressor/, 'd_comp3'], [/cnc|spindle/, 'd_cnc07'], [/incomer|demand|power factor/, 'd_incomer'],
  [/chiller/, 'd_chiller1'], [/boiler|steam/, 'd_boiler1'], [/\bdg\b|diesel|generator|fuel/, 'd_dg1'],
];
const REPORT_WORDS: [RegExp, string][] = [[/energy/, 'r_energy'], [/oee/, 'r_oee'], [/shift|production/, 'r_shift'], [/quality/, 'r_quality']];
const ROLE_WORDS: [RegExp, (u: IoUser) => boolean][] = [
  [/maintenance (?:lead|team|engineer)s?/, (u) => u.role.startsWith('Maintenance lead')],
  [/plant manager/, (u) => u.role === 'Plant manager'],
  [/safety officer/, (u) => u.role === 'Safety officer'],
  [/quality (?:engineer|team)/, (u) => u.role === 'Quality engineer'],
  [/energy (?:analyst|team)/, (u) => u.role === 'Energy analyst'],
  [/shift supervisors?/, (u) => u.role.startsWith('Shift supervisor')],
  [/utilities (?:engineer|team)/, (u) => u.role === 'Utilities engineer'],
  [/(?:production )?planner|planning/, (u) => u.role === 'Production planner'],
  [/\b(?:me|myself)\b/, (u) => u.id === CURRENT_USER_ID],
];
/** How each kind of trigger names things in a message: a headline and a fuller line. */
const FORM_TEXT: Record<string, { short: string; headline: string; detail: string }> = {
  f_breakdown: { short: 'Breakdown', headline: '{{Severity}} breakdown on {{Machine ID}}', detail: '{{Machine ID}} on {{Line}} was reported as {{Severity}}.\n\n{{Description}}' },
  f_quality: { short: 'Quality', headline: 'Batch {{Batch ID}}: {{Result}}', detail: 'Batch {{Batch ID}} was inspected: {{Result}}, {{Defects found}} defects.' },
  f_safety: { short: 'Safety incident', headline: '{{Incident type}} at {{Location}}', detail: '{{Reported by}} reported a {{Incident type}} at {{Location}}.\n\n{{Details}}' },
  f_handover: { short: 'Handover', headline: 'Shift {{Shift}} handover, {{Line}}', detail: 'Shift {{Shift}} on {{Line}}: {{Output}} made, {{Rejects}} rejects, {{Downtime (min)}} min downtime.' },
};
const DEVICE_TEXT = { headline: '{{Device}} {{Parameter}} at {{Reading}} {{Unit}}', detail: '{{Parameter}} read {{Reading}} {{Unit}} at {{Alert time}}, past the {{Limit}} {{Unit}} limit.' };

const firstIndex = (text: string, re: RegExp) => { const m = re.exec(text); return m ? m.index : -1; };
const listNames = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/** "above 85", "over 80", "more than 5" → the operator and number that follow a word. */
function comparison(text: string, after: number): { above: boolean; value: string } | null {
  const rest = text.slice(after, after + 40);
  const m = /(above|over|exceeds?|more than|greater than|higher than|>|below|under|less than|lower than|<)\s*(-?\d+(?:\.\d+)?)/.exec(rest);
  if (!m) return null;
  return { above: !/below|under|less|lower|</.test(m[1]), value: m[2] };
}

function scheduleFrom(text: string): { cfg: Partial<SchedulerConfig>; said: string } | null {
  if (!/every|daily|each (?:morning|day|week)|weekly|hourly|monthly|at \d/.test(text)) return null;
  const t = /at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/.exec(text);
  let hour = t ? Number(t[1]) : 8;
  if (t?.[3] === 'pm' && hour < 12) hour += 12;
  const time = `${String(hour).padStart(2, '0')}:${t?.[2] ?? '00'}`;
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const day = days.findIndex((d) => text.includes(d));
  if (/hourly|every hour/.test(text)) return { cfg: { frequency: 'hourly', minute: 0 }, said: 'every hour' };
  if (/monthly|every month|1st of/.test(text)) return { cfg: { frequency: 'monthly', dayOfMonth: 1, time }, said: `on the 1st of every month at ${time}` };
  if (day >= 0 || /weekly|every week/.test(text)) {
    const d = day >= 0 ? day : 1;
    return { cfg: { frequency: 'weekly', days: [d], time }, said: `every ${days[d][0].toUpperCase()}${days[d].slice(1)} at ${time}` };
  }
  const weekdays = /weekday|working day|mon(?:day)? to fri/.test(text);
  return { cfg: { frequency: 'daily', time, weekdaysOnly: weekdays }, said: `every ${weekdays ? 'weekday' : 'day'} at ${time}` };
}

/** A condition on the form's fields: a choice named in the sentence ("critical"), or a number with a comparison. */
function conditionFrom(text: string, f: IoForm): { c: SwitchCondition; said: string } | null {
  for (const field of f.fields) {
    if (field.type === 'select') {
      // Whole words only (with -s/-ed/-ing), so "higher than" is not the option High.
      const option = field.options?.find((o) => new RegExp(`\\b${o.toLowerCase().replace(/[^a-z0-9 ]/g, '')}(?:s|ed|ing)?\\b`).test(text));
      // "Line" options are too generic to read as a condition.
      if (option && field.key !== 'line' && field.key !== 'shift') return { c: cond('c1', `form.${field.key}`, 'is', option), said: `${field.label} is ${option}` };
    }
  }
  for (const field of f.fields) {
    if (field.type !== 'number') continue;
    const word = field.label.toLowerCase().split(/[ (]/)[0];
    const i = text.indexOf(word);
    const cmp = i >= 0 ? comparison(text, i) ?? comparison(text, Math.max(0, i - 25)) : null;
    if (cmp) return { c: cond('c1', `form.${field.key}`, cmp.above ? 'gt' : 'lt', cmp.value), said: `${field.label} ${cmp.above ? '>' : '<'} ${cmp.value}` };
  }
  return null;
}

/** The people a sentence names, by role or first name, in the order it mentions them. */
function peopleFrom(text: string, users: IoUser[]): IoUser[] {
  const firstSeen = new Map<IoUser, number>();
  const add = (u: IoUser, i: number) => { if (!firstSeen.has(u) || firstSeen.get(u)! > i) firstSeen.set(u, i); };
  for (const [re, pick] of ROLE_WORDS) {
    const i = firstIndex(text, re);
    if (i >= 0) users.filter(pick).forEach((u, k) => add(u, i + k / 100));
  }
  for (const u of users) {
    const i = firstIndex(text, new RegExp(`\\b${u.name.split(' ')[0].toLowerCase()}\\b`));
    if (i >= 0) add(u, i);
  }
  return [...firstSeen.entries()].sort((a, b) => a[1] - b[1]).map(([u]) => u);
}

export function draftWorkflow(prompt: string, dir: Directory): DraftResult {
  const text = prompt.toLowerCase().replace(/\s+/g, ' ').trim();
  if (text.length < 8) return { ok: false, error: 'Tell me what should start the workflow and what it should do, e.g. “When a breakdown is reported as Critical, email the maintenance leads.”' };

  const understood: string[] = [];
  const notes: string[] = [];
  const nodes: WfNode[] = [];
  const edges: Graph['edges'] = [];
  let name = '';
  let text4Message = { headline: '', detail: '' };

  // ── Trigger: a device past a limit, a schedule, or a form ──
  const deviceId = DEVICE_WORDS.find(([re]) => re.test(text))?.[1];
  const dev = dir.devices.find((d) => d.id === deviceId);
  const param = dev?.parameters.find((p) => text.includes(p.label.toLowerCase()) || text.includes(p.key.replace('_', ' '))) ?? dev?.parameters[0];
  const devCmp = dev && param ? comparison(text, Math.max(0, firstIndex(text, new RegExp(param.label.toLowerCase().split(' ')[0])))) ?? comparison(text, 0) : null;
  const sched = scheduleFrom(text);
  const formId = FORM_WORDS.find(([re]) => re.test(text))?.[1];
  const f = dir.forms.find((x) => x.id === formId);

  let formForFields: IoForm | undefined;
  if (dev && param && devCmp) {
    nodes.push(deviceNode('t', `${dev.name} ${param.label.toLowerCase()} ${devCmp.above ? 'high' : 'low'}`, {
      deviceId: dev.id, parameter: param.key, op: devCmp.above ? 'above' : 'below', limit: devCmp.value, forMinutes: 5,
    }, at(0, 0)));
    understood.push(`Starts when ${dev.name} ${param.label.toLowerCase()} goes ${devCmp.above ? 'above' : 'below'} ${devCmp.value} ${param.unit} for 5 minutes`);
    name = `${dev.name} ${param.label.toLowerCase()} alert`;
    text4Message = DEVICE_TEXT;
  } else if (sched && !(f && /when|whenever|if|once/.test(text))) {
    nodes.push(schedule('t', `Runs ${sched.said}`, sched.cfg, at(0, 0)));
    understood.push(`Runs ${sched.said}`);
    name = `Scheduled ${sched.said.startsWith('every') ? sched.said.split(' at ')[0].replace('every ', '') : 'run'}`;
  } else if (f) {
    formForFields = f;
    nodes.push(formNode('t', `${FORM_TEXT[f.id].short} reported`, f.id, at(0, 0)));
    understood.push(`Starts when the ${f.name} form is submitted`);
    name = `${FORM_TEXT[f.id].short} alerts`;
    text4Message = FORM_TEXT[f.id];
  } else {
    return { ok: false, error: 'I couldn’t tell what should start it. Mention a form (breakdown, quality, safety, handover), a schedule (“every weekday at 8”) or a device reading (“compressor temperature above 85”).' };
  }

  // ── Condition (forms only: a device trigger already has its limit) ──
  let from = 't';
  let handle = 'out';
  const condition = formForFields ? conditionFrom(text, formForFields) : null;
  if (condition) {
    nodes.push(sw('s', `Check ${condition.said.split(' ')[0].toLowerCase()}`, [condition.c], at(1, 0)));
    edges.push(link('t', 's'));
    understood.push(`Only when ${condition.said}`);
    from = 's';
    handle = 'c1';
    if (/critical/.test(condition.said.toLowerCase())) name = `Critical ${name.toLowerCase()}`;
  }

  // ── Actions, in the order the sentence mentions them ──
  const actionAt: [Action, number][] = [
    ['email', firstIndex(text, /\be-?mail|\bmail\b|\bnotify|\balert (?!when)|\btell|\binform|\blet .* know/)],
    ['sms', firstIndex(text, /\btext\b|\bsms\b|\bmessage\b/)],
    ['workOrder', firstIndex(text, /work ?order|ticket|maintenance job|raise a job/)],
    ['report', firstIndex(text, /\breport\b/)],
  ];
  // "report" in "is reported" is the trigger, not a report to send.
  if (/report(?:ed|s)? (?:as|is|was)|is reported|gets reported|reported/.test(text) && !/send .*report|email .*report|\breport (?:to|for)/.test(text)) {
    actionAt[3][1] = -1;
  }
  const actions = actionAt.filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]).map(([a]) => a);
  // Texting wins over a generic "notify" placed before it, so "notify … by text" is one SMS.
  if (actions.includes('sms') && actions.includes('email') && !/\be-?mail/.test(text)) actions.splice(actions.indexOf('email'), 1);
  if (actions.length === 0) {
    return { ok: false, error: 'I couldn’t tell what it should do. Try “email …”, “text …”, “raise a work order” or “send the energy report”.' };
  }

  const people = peopleFrom(text, dir.users);
  const peopleNames = listNames(people.map((u) => u.name));
  const toUsers = people.map((u) => `user:${u.id}`);
  const supervisorField = formForFields?.fields.find((x) => x.type === 'email' && /supervisor/.test(text) && x.key.includes('supervisor'));
  const to = supervisorField ? [...toUsers, `field:form.${supervisorField.key}`] : toUsers;
  const priority: WorkOrderPriority = /critical|urgent|immediately|asap/.test(text) ? 'critical' : 'high';
  const headline = text4Message.headline || (sched ? `${name}` : 'Workflow update');
  const detail = text4Message.detail || headline;

  actions.forEach((a, i) => {
    const id = `a${i + 1}`;
    const p = at(2 + i, 0);
    if (a === 'email') {
      nodes.push(email(id, people.length ? `Email ${people.length === 1 ? people[0].name.split(' ')[0] : 'the team'}` : 'Send email', { to, subject: headline, body: detail }, p));
      understood.push(to.length ? `Emails ${listNames([...people.map((u) => u.name), ...(supervisorField ? [supervisorField.label] : [])])}` : 'Sends an email');
      if (!to.length) notes.push('Who should get the email? Pick the recipients in its settings.');
    } else if (a === 'sms') {
      const phoneTo = toUsers;
      nodes.push(sms(id, people.length ? `Text ${people.length === 1 ? people[0].name.split(' ')[0] : 'the team'}` : 'Send SMS', { to: phoneTo, other: '', message: headline }, p));
      understood.push(phoneTo.length ? `Texts ${peopleNames}` : 'Sends a text message');
      if (!phoneTo.length) notes.push('Who should get the text? Pick the recipients in its settings.');
    } else if (a === 'workOrder') {
      const assignee = people.find((u) => u.role.startsWith('Maintenance')) ?? people[0];
      nodes.push(workOrder(id, 'Raise work order', { title: headline, priority, assignee: assignee?.id ?? null, description: detail }, p));
      understood.push(`Raises a ${priority} work order${assignee ? ` for ${assignee.name}` : ' in the maintenance queue'}`);
    } else {
      const reportId = REPORT_WORDS.find(([re]) => re.test(text))?.[1] ?? null;
      const rep = dir.reports.find((r) => r.id === reportId);
      const period = /month/.test(text) ? 'last_month' : /week|7 days/.test(text) ? 'last_7_days' : 'yesterday';
      nodes.push(reportNode(id, rep ? `Send ${rep.name.toLowerCase()}` : 'Send report', { reportId, period, format: /excel|xlsx|spreadsheet/.test(text) ? 'xlsx' : 'pdf', to: toUsers }, p));
      understood.push(rep ? `Sends the ${rep.name}${toUsers.length ? ` to ${peopleNames}` : ''}` : 'Sends a report');
      if (!rep) notes.push('Which report? Choose it in the report step.');
      if (!toUsers.length) notes.push('Who should get the report? Pick the recipients in its settings.');
      if (rep && sched) name = `${sched.said.split(' at ')[0].replace('every ', '').replace(/^\w/, (c) => c.toUpperCase())} ${rep.name.toLowerCase()}`;
    }
    edges.push(link(from, id, handle));
    from = id;
    handle = 'out';
  });

  const graph = tidyLayout({ nodes, edges }, {});
  return { ok: true, draft: { name: name.replace(/^\w/, (c) => c.toUpperCase()), graph, understood, notes } };
}
