import { seeded } from '@/lib/util';
import type { Directory, Execution, ExecutionSource, Graph, IoDevice, IoForm, IoReport, IoUser, WfNode, Workflow, WorkflowVersion } from '../domain/types';
import { isActionType } from '../domain/nodeTypes';
import { flowOrder, outgoing } from '../engine/graph';
import { changesText, graphChanges } from '../engine/diff';
import { DEFAULT_HANDLE } from '../domain/types';
import { deviceAlertData, runSimulation } from '../engine/simulate';
import { ROW, at, cond, delay, device, email, form, link, report, schedule, sms, sw, workOrder } from './builders';

/* Fictional, IoT-flavoured sample data. Same output for the same `now`. */

/** The demo's signed-in person: the plant manager. */
export const CURRENT_USER_ID = 'u_meera';

export const SEED_USERS: IoUser[] = [
  { id: 'u_meera', name: 'Meera Kulkarni', email: 'meera.kulkarni@example.com', phone: '+91 90000 10001', role: 'Plant manager' },
  { id: 'u_arjun', name: 'Arjun Rao', email: 'arjun.rao@example.com', phone: '+91 90000 10002', role: 'Maintenance lead' },
  { id: 'u_sana', name: 'Sana Sheikh', email: 'sana.sheikh@example.com', phone: '+91 90000 10003', role: 'Maintenance lead' },
  { id: 'u_ravi', name: 'Ravi Iyer', email: 'ravi.iyer@example.com', phone: '+91 90000 10004', role: 'Quality engineer' },
  { id: 'u_neha', name: 'Neha Joshi', email: 'neha.joshi@example.com', phone: '+91 90000 10005', role: 'Safety officer' },
  { id: 'u_vikram', name: 'Vikram Patel', email: 'vikram.patel@example.com', phone: '+91 90000 10006', role: 'Energy analyst' },
  { id: 'u_kiran', name: 'Kiran Desai', email: 'kiran.desai@example.com', phone: '+91 90000 10007', role: 'Shift supervisor, Lines 1–2' },
  { id: 'u_farah', name: 'Farah Khan', email: 'farah.khan@example.com', phone: '+91 90000 10008', role: 'Shift supervisor, Lines 3–4' },
  { id: 'u_dev', name: 'Dev Menon', email: 'dev.menon@example.com', phone: '+91 90000 10009', role: 'Utilities engineer' },
  { id: 'u_tara', name: 'Tara Nair', email: 'tara.nair@example.com', phone: '+91 90000 10010', role: 'Production planner' },
];

export const SEED_DEVICES: IoDevice[] = [
  {
    id: 'd_comp3', name: 'Compressor 3', location: 'Utilities', parameters: [
      { key: 'temperature', label: 'Temperature', unit: '°C' },
      { key: 'pressure', label: 'Pressure', unit: 'bar' },
      { key: 'current', label: 'Current', unit: 'A' },
    ],
  },
  {
    id: 'd_cnc07', name: 'CNC-07', location: 'Line 2', parameters: [
      { key: 'spindle_temp', label: 'Spindle temp', unit: '°C' },
      { key: 'vibration', label: 'Vibration', unit: 'mm/s' },
    ],
  },
  {
    id: 'd_incomer', name: 'Main incomer', location: 'Substation', parameters: [
      { key: 'power', label: 'Power', unit: 'kW' },
      { key: 'pf', label: 'Power factor', unit: '' },
    ],
  },
  { id: 'd_chiller1', name: 'Chiller 1', location: 'Utilities', parameters: [{ key: 'outlet_temp', label: 'Outlet temp', unit: '°C' }] },
  {
    id: 'd_boiler1', name: 'Boiler 1', location: 'Utilities', parameters: [
      { key: 'steam_pressure', label: 'Steam pressure', unit: 'bar' },
      { key: 'stack_temp', label: 'Stack temp', unit: '°C' },
    ],
  },
  {
    id: 'd_dg1', name: 'DG set 1', location: 'Substation', parameters: [
      { key: 'fuel_level', label: 'Fuel level', unit: '%' },
      { key: 'load', label: 'Load', unit: 'kW' },
    ],
  },
];

export const SEED_REPORTS: IoReport[] = [
  { id: 'r_energy', name: 'Energy consumption summary', description: 'kWh by line and utility, against target' },
  { id: 'r_oee', name: 'OEE and downtime', description: 'Availability, performance, quality and top stoppages' },
  { id: 'r_shift', name: 'Shift production report', description: 'Output, rejects and downtime per shift' },
  { id: 'r_quality', name: 'Quality inspection summary', description: 'Batches inspected, failures and defect types' },
];

const LINES = ['Line 1', 'Line 2', 'Line 3', 'Line 4'];

export const SEED_FORMS: IoForm[] = [
  {
    id: 'f_breakdown',
    name: 'Equipment breakdown report',
    fields: [
      { key: 'machine_id', label: 'Machine ID', type: 'text', required: true, sample: 'CNC-07' },
      { key: 'line', label: 'Line', type: 'select', required: true, options: LINES, sample: 'Line 2' },
      { key: 'severity', label: 'Severity', type: 'select', required: true, options: ['Low', 'Medium', 'High', 'Critical'], sample: 'Critical' },
      { key: 'temperature', label: 'Temperature (°C)', type: 'number', required: false, sample: 92 },
      { key: 'supervisor_email', label: 'Supervisor email', type: 'email', required: false, sample: 'line2.supervisor@example.com' },
      { key: 'description', label: 'Description', type: 'textarea', required: true, sample: 'Spindle overheating; machine stopped mid-cycle.' },
    ],
  },
  {
    id: 'f_quality',
    name: 'Quality inspection log',
    fields: [
      { key: 'batch_id', label: 'Batch ID', type: 'text', required: true, sample: 'B-2291' },
      { key: 'defects', label: 'Defects found', type: 'number', required: true, sample: 7 },
      { key: 'result', label: 'Result', type: 'select', required: true, options: ['Pass', 'Fail'], sample: 'Fail' },
      { key: 'inspector_email', label: 'Inspector email', type: 'email', required: true, sample: 'ravi.iyer@example.com' },
    ],
  },
  {
    id: 'f_safety',
    name: 'Safety incident report',
    fields: [
      { key: 'location', label: 'Location', type: 'select', required: true, options: ['Assembly', 'Paint shop', 'Warehouse', 'Utilities'], sample: 'Warehouse' },
      { key: 'incident_type', label: 'Incident type', type: 'select', required: true, options: ['Near miss', 'Injury', 'Spill', 'Fire'], sample: 'Near miss' },
      { key: 'reported_by', label: 'Reported by', type: 'text', required: true, sample: 'Shift B lead' },
      { key: 'details', label: 'Details', type: 'textarea', required: true, sample: 'Pallet stack leaning in aisle 4.' },
    ],
  },
  {
    id: 'f_handover',
    name: 'Shift handover',
    fields: [
      { key: 'shift', label: 'Shift', type: 'select', required: true, options: ['A', 'B', 'C'], sample: 'A' },
      { key: 'line', label: 'Line', type: 'select', required: true, options: LINES, sample: 'Line 1' },
      { key: 'output', label: 'Output', type: 'number', required: true, sample: 1840 },
      { key: 'rejects', label: 'Rejects', type: 'number', required: true, sample: 22 },
      { key: 'downtime', label: 'Downtime (min)', type: 'number', required: true, sample: 18 },
      { key: 'next_supervisor_email', label: 'Next supervisor email', type: 'email', required: false, sample: 'farah.khan@example.com' },
      { key: 'notes', label: 'Notes', type: 'textarea', required: false, sample: 'Die change on press 2 ran 10 minutes over.' },
    ],
  },
];

export const SEED_DIRECTORY: Directory = { forms: SEED_FORMS, users: SEED_USERS, devices: SEED_DEVICES, reports: SEED_REPORTS };

/* ── Sample graphs ── */

function breakdownGraph(): Graph {
  return {
    nodes: [
      form('bd_t', 'Breakdown reported', 'f_breakdown', at(0, 108)),
      sw('bd_s', 'Check severity', [cond('bd_c1', 'form.severity', 'is', 'Critical'), cond('bd_c2', 'form.temperature', 'gt', '80')], at(1, 72)),
      email('bd_e1', 'Alert maintenance leads', {
        to: ['user:u_arjun', 'user:u_sana'],
        subject: 'Critical breakdown on {{Machine ID}}',
        body: '{{Machine ID}} on {{Line}} was reported as Critical.\n\n{{Description}}',
      }, at(2, 0)),
      email('bd_e2', 'Alert safety officer', {
        to: ['user:u_neha'],
        subject: 'Overheating: {{Machine ID}} at {{Temperature (°C)}} °C',
        body: '{{Machine ID}} on {{Line}} is running at {{Temperature (°C)}} °C.',
      }, at(2, ROW)),
      email('bd_e3', 'Notify supervisor', {
        to: ['field:form.supervisor_email'],
        subject: 'Breakdown logged: {{Machine ID}}',
        body: 'A {{Severity}} breakdown was logged for {{Machine ID}} on {{Line}}.\n\n{{Description}}',
      }, at(2, 2 * ROW)),
    ],
    edges: [link('bd_t', 'bd_s'), link('bd_s', 'bd_e1', 'bd_c1'), link('bd_s', 'bd_e2', 'bd_c2'), link('bd_s', 'bd_e3', DEFAULT_HANDLE)],
  };
}

function energyGraph(): Graph {
  return {
    nodes: [
      schedule('en_t', 'Weekday mornings', { frequency: 'daily', time: '08:00', weekdaysOnly: true }, at(0, 0)),
      report('en_r', 'Send energy report', { reportId: 'r_energy', period: 'yesterday', format: 'pdf', to: ['user:u_vikram', 'user:u_meera'] }, at(1, 0)),
    ],
    edges: [link('en_t', 'en_r')],
  };
}

function compressorGraph(): Graph {
  return {
    nodes: [
      device('cp_t', 'Compressor running hot', { deviceId: 'd_comp3', parameter: 'temperature', op: 'above', limit: '85', forMinutes: 5 }, at(0, 0)),
      workOrder('cp_w', 'Raise work order', {
        title: '{{Device}} running hot at {{Reading}} {{Unit}}',
        priority: 'high',
        assignee: 'u_arjun',
        description: '{{Parameter}} read {{Reading}} {{Unit}} at {{Alert time}}, above the {{Limit}} {{Unit}} limit. Check cooling and load.',
      }, at(1, 0)),
      sms('cp_s', 'Text maintenance leads', {
        to: ['user:u_arjun', 'user:u_sana'],
        other: '',
        message: '{{Device}} at {{Reading}} {{Unit}} (limit {{Limit}}). Work order raised, please check.',
      }, at(2, 0)),
    ],
    edges: [link('cp_t', 'cp_w'), link('cp_w', 'cp_s')],
  };
}

function oeeGraph(): Graph {
  return {
    nodes: [
      schedule('oee_t', 'Monday morning', { frequency: 'weekly', time: '09:00', days: [1] }, at(0, 0)),
      email('oee_e', 'Send OEE review reminder', {
        to: ['user:u_meera', 'user:u_arjun'],
        subject: 'Weekly OEE review at 10:00',
        body: 'Reminder: the weekly OEE review starts at 10:00. Bring last week’s downtime notes.',
      }, at(1, 0)),
    ],
    edges: [link('oee_t', 'oee_e')],
  };
}

function qualityGraph(subject: string): Graph {
  return {
    nodes: [
      form('q_t', 'Inspection logged', 'f_quality', at(0, 36)),
      sw('q_s', 'Check result', [cond('q_c1', 'form.result', 'is', 'Fail'), cond('q_c2', 'form.defects', 'gt', '5')], at(1, 0)),
      email('q_e1', 'Escalate failed batch', {
        to: ['user:u_ravi', 'field:form.inspector_email'],
        subject,
        body: 'Batch {{Batch ID}} failed inspection with {{Defects found}} defects.',
      }, at(2, 0)),
      email('q_e2', 'Flag high defect count', {
        to: ['user:u_ravi'],
        subject: 'High defect count on {{Batch ID}}',
        body: 'Batch {{Batch ID}} passed but had {{Defects found}} defects.',
      }, at(2, ROW)),
    ],
    edges: [link('q_t', 'q_s'), link('q_s', 'q_e1', 'q_c1'), link('q_s', 'q_e2', 'q_c2')],
  };
}

function safetyGraph(): Graph {
  return {
    nodes: [
      form('sf_t', 'Incident reported', 'f_safety', at(0, 36)),
      sw('sf_s', 'Check incident type', [cond('sf_c1', 'form.incident_type', 'is', 'Injury'), cond('sf_c2', 'form.location', null)], at(1, 0)),
      email('sf_e1', 'Notify safety officer', { to: ['user:u_neha', 'user:u_meera'], subject: '', body: 'An injury was reported at {{Location}} by {{Reported by}}.\n\n{{Details}}' }, at(2, 0)),
      email('sf_e2', 'Log near misses', { to: ['user:u_neha'], subject: '{{Incident type}} at {{Location}}', body: '{{Details}}' }, at(2, 2 * ROW)),
    ],
    edges: [link('sf_t', 'sf_s'), link('sf_s', 'sf_e1', 'sf_c1'), link('sf_s', 'sf_e2', DEFAULT_HANDLE)],
  };
}

function alarmGraph(): Graph {
  const leads = ['user:u_arjun', 'user:u_sana', 'user:u_arjun', 'user:u_sana'];
  const lineNodes = LINES.flatMap((line, i) => {
    const n = i + 1;
    const nodes: WfNode[] = [email(`al_e${n}`, `Notify ${line} maintenance`, {
      to: [leads[i]],
      subject: '{{Severity}} alarm on {{Machine ID}} ({{Line}})',
      body: '{{Machine ID}} raised a {{Severity}} alarm.\n\n{{Description}}',
    }, at(2, i * ROW))];
    nodes.push(email(`al_m${n}`, `Copy manager (${line})`, {
      to: ['user:u_meera'],
      subject: '{{Line}}: {{Machine ID}} alarm forwarded',
      body: 'Forwarded for visibility: {{Description}}',
    }, at(3, i * ROW)));
    return nodes;
  });
  return {
    nodes: [
      form('al_t', 'Alarm reported', 'f_breakdown', at(0, 2 * ROW)),
      sw('al_s', 'Route by line', LINES.map((line, i) => cond(`al_c${i + 1}`, 'form.line', 'is', line)), at(1, 2 * ROW - 72)),
      ...lineNodes,
      email('al_d', 'Notify plant manager', {
        to: ['user:u_meera'],
        subject: 'Unrouted alarm on {{Machine ID}}',
        body: 'An alarm came in without a known line.\n\n{{Description}}',
      }, at(2, 4 * ROW)),
    ],
    edges: [
      link('al_t', 'al_s'),
      ...LINES.map((_, i) => link('al_s', `al_e${i + 1}`, `al_c${i + 1}`)),
      ...LINES.map((_, i) => link(`al_e${i + 1}`, `al_m${i + 1}`)),
      link('al_s', 'al_d', DEFAULT_HANDLE),
    ],
  };
}

/** `otherNumber` is the typed number the first published version texted, with a letter O for a zero. */
function chillerGraph(otherNumber = ''): Graph {
  return {
    nodes: [
      device('ch_t', 'Outlet above 12 °C', { deviceId: 'd_chiller1', parameter: 'outlet_temp', op: 'above', limit: '12', forMinutes: 10 }, at(0, 0)),
      sms('ch_s', 'Text utilities engineer', {
        to: ['user:u_dev'],
        other: otherNumber,
        message: '{{Device}} outlet at {{Reading}} {{Unit}} (limit {{Limit}}). Check the condenser.',
      }, at(1, 0)),
      email('ch_e', 'Email plant manager', {
        to: ['user:u_meera'],
        subject: '{{Device}} running warm: {{Reading}} {{Unit}}',
        body: '{{Device}} outlet temperature read {{Reading}} {{Unit}} at {{Alert time}}, above the {{Limit}} {{Unit}} limit for 10 minutes.',
      }, at(2, 0)),
    ],
    edges: [link('ch_t', 'ch_s'), link('ch_s', 'ch_e')],
  };
}

function incomerGraph(): Graph {
  return {
    nodes: [
      device('in_t', 'Incomer above 1,800 kW', { deviceId: 'd_incomer', parameter: 'power', op: 'above', limit: '1800', forMinutes: 5 }, at(0, 36)),
      sw('in_s', 'How far over', [cond('in_c1', 'device.reading', 'gt', '2100')], at(1, 0)),
      sms('in_m', 'Text utilities engineer', {
        to: ['user:u_dev'],
        other: '',
        message: 'Main incomer at {{Reading}} kW. Contract demand at risk: shed non-critical loads.',
      }, at(2, 0)),
      email('in_p', 'Copy plant manager', {
        to: ['user:u_meera'],
        subject: 'Main incomer peaked at {{Reading}} kW',
        body: 'Demand reached {{Reading}} kW at {{Alert time}}. The utilities engineer has been texted to shed load.',
      }, at(3, 0)),
      email('in_e', 'Tell the energy analyst', {
        to: ['user:u_vikram'],
        subject: 'Main incomer above {{Limit}} kW',
        body: 'Demand read {{Reading}} kW at {{Alert time}} for over 5 minutes. No load shedding needed yet.',
      }, at(2, ROW)),
    ],
    edges: [link('in_t', 'in_s'), link('in_s', 'in_m', 'in_c1'), link('in_m', 'in_p'), link('in_s', 'in_e', DEFAULT_HANDLE)],
  };
}

function vibrationGraph(): Graph {
  return {
    nodes: [
      device('vb_t', 'Spindle vibration high', { deviceId: 'd_cnc07', parameter: 'vibration', op: 'above', limit: '7.1', forMinutes: 2 }, at(0, 0)),
      workOrder('vb_w', 'Raise inspection order', {
        title: 'Inspect {{Device}} spindle: vibration {{Reading}} {{Unit}}',
        priority: 'high',
        assignee: 'u_sana',
        description: 'Vibration read {{Reading}} {{Unit}} at {{Alert time}}, above the {{Limit}} {{Unit}} ISO limit. Check bearings and tool balance.',
      }, at(1, 0)),
      delay('vb_d', 'Wait 30 minutes', { amount: 30, unit: 'minutes' }, at(2, 0)),
      email('vb_e', 'Remind line supervisor', {
        to: ['user:u_kiran'],
        subject: 'Check the {{Device}} inspection has been picked up',
        body: 'An inspection order was raised 30 minutes ago for {{Device}} (vibration {{Reading}} {{Unit}}). Please confirm someone is on it.',
      }, at(3, 0)),
    ],
    edges: [link('vb_t', 'vb_w'), link('vb_w', 'vb_d'), link('vb_d', 'vb_e')],
  };
}

function shiftReportGraph(): Graph {
  return {
    nodes: [
      schedule('sr_t', 'Every morning at 07:00', { frequency: 'daily', time: '07:00', weekdaysOnly: false }, at(0, 0)),
      report('sr_r', 'Send shift production report', { reportId: 'r_shift', period: 'yesterday', format: 'xlsx', to: ['user:u_kiran', 'user:u_farah', 'user:u_tara'] }, at(1, 0)),
    ],
    edges: [link('sr_t', 'sr_r')],
  };
}

function handoverGraph(): Graph {
  return {
    nodes: [
      form('ho_t', 'Handover submitted', 'f_handover', at(0, 144)),
      sw('ho_s', 'Check the shift', [cond('ho_c1', 'form.downtime', 'gt', '30'), cond('ho_c2', 'form.rejects', 'gt', '40')], at(1, 108)),
      workOrder('ho_w', 'Review downtime', {
        title: 'Review {{Downtime (min)}} min downtime on {{Line}}',
        priority: 'medium',
        assignee: null,
        description: 'Shift {{Shift}} on {{Line}} logged {{Downtime (min)}} minutes of downtime.\n\n{{Notes}}',
      }, at(2, 0)),
      email('ho_q', 'Alert quality engineer', {
        to: ['user:u_ravi'],
        subject: '{{Rejects}} rejects on {{Line}}, shift {{Shift}}',
        body: 'Shift {{Shift}} on {{Line}} handed over with {{Rejects}} rejects from {{Output}} parts.\n\n{{Notes}}',
      }, at(2, ROW)),
      email('ho_n', 'Brief next supervisor', {
        to: ['field:form.next_supervisor_email'],
        subject: 'Handover: {{Line}}, shift {{Shift}}',
        body: 'Output {{Output}}, rejects {{Rejects}}, downtime {{Downtime (min)}} min.\n\n{{Notes}}',
      }, at(2, 2 * ROW)),
    ],
    edges: [link('ho_t', 'ho_s'), link('ho_s', 'ho_w', 'ho_c1'), link('ho_s', 'ho_q', 'ho_c2'), link('ho_s', 'ho_n', DEFAULT_HANDLE)],
  };
}

function monthlyQualityGraph(): Graph {
  return {
    nodes: [
      schedule('mq_t', '1st of the month', { frequency: 'monthly', dayOfMonth: 1, time: '09:00' }, at(0, 0)),
      report('mq_r', 'Send quality summary', { reportId: 'r_quality', period: 'last_month', format: 'pdf', to: ['user:u_ravi', 'user:u_meera'] }, at(1, 0)),
    ],
    edges: [link('mq_t', 'mq_r')],
  };
}

function boilerGraph(): Graph {
  return {
    nodes: [
      device('bo_t', 'Steam pressure high', { deviceId: 'd_boiler1', parameter: 'steam_pressure', op: 'above', limit: '10.5', forMinutes: 3 }, at(0, 0)),
      sms('bo_s', 'Text utilities engineer', { to: ['user:u_dev'], other: '', message: '{{Device}} steam pressure {{Reading}} {{Unit}} (limit {{Limit}}). Check the safety valve.' }, at(1, 0)),
      email('bo_e', 'Email plant manager', {
        to: ['user:u_meera'],
        subject: '{{Device}} steam pressure at {{Reading}} {{Unit}}',
        body: 'Steam pressure stayed above {{Limit}} {{Unit}} for 3 minutes, peaking at {{Reading}} {{Unit}} at {{Alert time}}.',
      }, at(2, 0)),
    ],
    edges: [link('bo_t', 'bo_s'), link('bo_s', 'bo_e')],
  };
}

function dieselGraph(): Graph {
  return {
    nodes: [
      device('dg_t', 'Fuel below 25 %', { deviceId: 'd_dg1', parameter: 'fuel_level', op: 'below', limit: '25', forMinutes: 0 }, at(0, 0)),
      workOrder('dg_w', 'Raise refuelling order', {
        title: 'Refuel {{Device}}: {{Reading}} {{Unit}} left',
        priority: 'medium',
        assignee: 'u_dev',
        description: 'Fuel level read {{Reading}} {{Unit}} at {{Alert time}}. Arrange a top-up before the next planned outage.',
      }, at(1, 0)),
    ],
    edges: [link('dg_t', 'dg_w')],
  };
}

/* ── Workflows ── */

const DAY = 86_400_000;

/** The graph without its last action (one with nothing after it): what a first version looked like before that step was added. */
function withoutLastAction(g: Graph): Graph | null {
  const last = [...flowOrder(g)].reverse().map((id) => g.nodes.find((n) => n.id === id)!).find((n) => isActionType(n.type) && outgoing(g, n.id).length === 0);
  if (!last || g.nodes.length < 3) return null;
  return { nodes: g.nodes.filter((n) => n.id !== last.id), edges: g.edges.filter((e) => e.target !== last.id) };
}

/**
 * Sample publish history: a workflow older than a few days first went live one step shorter, and its last action
 * came in version 2 (unless an `earlier` graph says what really changed, like the chiller's mistyped number).
 */
function sampleVersions(id: string, ownerId: string, published: Graph, createdAt: number, publishedAt: number, earlier?: Graph): WorkflowVersion[] {
  const first = earlier ?? (publishedAt - createdAt > 3 * DAY ? withoutLastAction(published) : null);
  const latest = (number: number, changes: string | null): WorkflowVersion => ({ id: `${id}_v${number}`, number, graph: published, publishedAt, publishedBy: ownerId, changes });
  if (!first) return [latest(1, null)];
  return [
    { id: `${id}_v1`, number: 1, graph: first, publishedAt: createdAt + 2 * 3_600_000, publishedBy: ownerId, changes: null },
    latest(2, changesText(graphChanges(published, first))),
  ];
}

export function seedWorkflows(now: number): Workflow[] {
  const wf = (w: Omit<Workflow, 'published' | 'createdAt' | 'updatedAt' | 'versions'> & { createdDaysAgo: number; updatedDaysAgo: number; publishedGraph?: Graph; earlierGraph?: Graph }): Workflow => {
    const createdAt = now - w.createdDaysAgo * DAY;
    const publishedAt = now - w.updatedDaysAgo * DAY;
    const published = w.publishedGraph ?? w.graph;
    return {
      id: w.id, name: w.name, description: w.description, status: w.status, graph: w.graph, ownerId: w.ownerId,
      published: w.status === 'draft' ? null : { graph: published, publishedAt },
      versions: w.status === 'draft' ? [] : sampleVersions(w.id, w.ownerId, published, createdAt, publishedAt, w.earlierGraph),
      createdAt, updatedAt: publishedAt,
    };
  };
  return [
    wf({ id: 'wf_breakdown', ownerId: 'u_arjun', name: 'Critical breakdown alerts', description: 'Alerts maintenance and safety when a breakdown is reported.', status: 'active', graph: breakdownGraph(), createdDaysAgo: 40, updatedDaysAgo: 6 }),
    wf({ id: 'wf_compressor', ownerId: 'u_sana', name: 'Compressor overheating response', description: 'Raises a work order and texts maintenance when Compressor 3 runs hot.', status: 'active', graph: compressorGraph(), createdDaysAgo: 25, updatedDaysAgo: 4 }),
    wf({ id: 'wf_energy', ownerId: 'u_vikram', name: 'Daily energy summary', description: 'Emails the energy report every weekday morning.', status: 'active', graph: energyGraph(), createdDaysAgo: 60, updatedDaysAgo: 21 }),
    wf({ id: 'wf_oee', ownerId: 'u_meera', name: 'Weekly OEE review reminder', description: 'Reminds the plant team before the Monday OEE review.', status: 'paused', graph: oeeGraph(), createdDaysAgo: 90, updatedDaysAgo: 12 }),
    wf({
      id: 'wf_quality', ownerId: 'u_ravi', name: 'Quality failure escalation', description: 'Escalates failed inspections to quality engineering.', status: 'active',
      graph: qualityGraph('Failed inspection: batch {{Batch ID}} ({{Defects found}} defects)'),
      publishedGraph: qualityGraph('Batch {{Batch ID}} failed inspection'), createdDaysAgo: 30, updatedDaysAgo: 1,
    }),
    wf({ id: 'wf_safety', ownerId: 'u_neha', name: 'Safety incident routing', description: 'Routes safety incidents to the safety officer.', status: 'draft', graph: safetyGraph(), createdDaysAgo: 2, updatedDaysAgo: 0 }),
    wf({ id: 'wf_alarm', ownerId: 'u_arjun', name: 'Plant-wide alarm routing', description: 'Sends each line’s alarms to its maintenance lead.', status: 'active', graph: alarmGraph(), createdDaysAgo: 75, updatedDaysAgo: 9 }),
    wf({ id: 'wf_chiller', ownerId: 'u_dev', name: 'Chiller outlet temperature watch', description: 'Texts utilities and emails the plant manager when Chiller 1 runs warm.', status: 'active', graph: chillerGraph(), earlierGraph: chillerGraph('+91 98200 12O4'), createdDaysAgo: 35, updatedDaysAgo: 12 }),
    wf({ id: 'wf_incomer', ownerId: 'u_vikram', name: 'Main incomer demand alert', description: 'Warns before the plant crosses its contract demand.', status: 'active', graph: incomerGraph(), createdDaysAgo: 50, updatedDaysAgo: 15 }),
    wf({ id: 'wf_vibration', ownerId: 'u_sana', name: 'CNC spindle vibration alert', description: 'Raises an inspection order when CNC-07 vibrates past its ISO limit.', status: 'active', graph: vibrationGraph(), createdDaysAgo: 28, updatedDaysAgo: 3 }),
    wf({ id: 'wf_shift_report', ownerId: 'u_tara', name: 'Shift production report', description: 'Sends yesterday’s output, rejects and downtime every morning.', status: 'active', graph: shiftReportGraph(), createdDaysAgo: 120, updatedDaysAgo: 30 }),
    wf({ id: 'wf_handover', ownerId: 'u_kiran', name: 'Shift handover escalation', description: 'Flags long downtime and high rejects at shift change.', status: 'active', graph: handoverGraph(), createdDaysAgo: 45, updatedDaysAgo: 7 }),
    wf({ id: 'wf_monthly_quality', ownerId: 'u_ravi', name: 'Monthly quality summary', description: 'Sends last month’s inspection summary on the 1st.', status: 'active', graph: monthlyQualityGraph(), createdDaysAgo: 100, updatedDaysAgo: 40 }),
    wf({ id: 'wf_boiler', ownerId: 'u_dev', name: 'Boiler steam pressure watch', description: 'Alerts utilities when Boiler 1 steam pressure runs high.', status: 'paused', graph: boilerGraph(), createdDaysAgo: 70, updatedDaysAgo: 8 }),
    wf({ id: 'wf_diesel', ownerId: 'u_meera', name: 'DG fuel top-up', description: 'Raises a refuelling order when DG set 1 runs low.', status: 'draft', graph: dieselGraph(), createdDaysAgo: 3, updatedDaysAgo: 1 }),
  ];
}

/* ── Execution history ── */

/** `graph` replays a run on an earlier published version (e.g. before a fix). */
interface PlannedRun { workflowId: string; daysAgo: number; source: ExecutionSource; data: Record<string, unknown>; graph?: Graph }

/** How far back the sample history goes. */
const HISTORY_DAYS = 30;

function plannedRuns(now: number): PlannedRun[] {
  const rnd = seeded(20261023);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const runs: PlannedRun[] = [];
  const minutes = (n: number) => n / 1440;
  /** Days ago of `d` days back at hh:mm local time, or null while that time is still ahead today. */
  const timeOn = (d: number, h: number, m = 0): number | null => {
    const t = new Date(now - d * DAY).setHours(h, m, 0, 0);
    return t > now ? null : (now - t) / DAY;
  };
  /** A random moment in working hours (06:00–22:00), `d` days back. */
  const shiftTime = (d: number) => timeOn(d, 6 + Math.floor(rnd() * 16), Math.floor(rnd() * 60));
  const weekday = (d: number) => { const day = new Date(now - d * DAY).getDay(); return day !== 0 && day !== 6; };
  const push = (run: Omit<PlannedRun, 'daysAgo'> & { daysAgo: number | null }) => { if (run.daysAgo !== null) runs.push(run as PlannedRun); };

  // Breakdown alerts: forms through the month; a few come in without a supervisor email and fail.
  const MACHINES = ['CNC-07', 'PRS-12', 'WLD-03', 'CNV-21', 'CNC-04'];
  for (let i = 0; i < 18; i++) {
    const severity = pick(['Low', 'Medium', 'Medium', 'High', 'Critical']);
    push({
      workflowId: 'wf_breakdown', daysAgo: shiftTime(1 + Math.floor(i * 1.6)), source: i === 7 ? 'test' : 'form',
      data: {
        machine_id: pick(MACHINES), line: pick(LINES), severity,
        temperature: severity === 'Critical' ? 75 + Math.round(rnd() * 25) : 55 + Math.round(rnd() * 30),
        supervisor_email: i === 3 || i === 11 ? '' : `${pick(['line1', 'line2', 'line3', 'line4'])}.supervisor@example.com`,
        description: pick(['Unexpected stop reported by operator.', 'Spindle overheating; machine stopped mid-cycle.', 'Conveyor belt slipping at the transfer point.', 'Weld gun not firing on station 3.']),
      },
    });
  }
  runs.push({
    workflowId: 'wf_breakdown', daysAgo: minutes(95), source: 'form',
    data: { machine_id: 'PRS-12', line: 'Line 3', severity: 'Low', temperature: 64, supervisor_email: '', description: 'Hydraulic pressure warning, press still running.' },
  });

  // Plant-wide alarms: most days; one in five comes from a controller with no line set and goes to Default.
  for (let d = 0; d < HISTORY_DAYS; d++) {
    if (rnd() < 0.35) continue;
    push({
      workflowId: 'wf_alarm', daysAgo: shiftTime(d), source: 'form',
      data: { machine_id: pick(MACHINES), line: rnd() < 0.2 ? '' : pick(LINES), severity: pick(['High', 'Critical']), temperature: 70, supervisor_email: '', description: pick(['Alarm raised by line controller.', 'Guard door opened during cycle.', 'Coolant flow low.']) },
    });
  }

  // Quality inspections: about one a day; twice the inspector's address was mistyped on a failed batch.
  for (let d = 0; d < HISTORY_DAYS; d++) {
    if (!weekday(d) && rnd() < 0.7) continue;
    const defects = Math.round(rnd() * rnd() * 14);
    const typo = d === 9 || d === 21;
    push({
      workflowId: 'wf_quality', daysAgo: shiftTime(d), source: d === 2 ? 'test' : 'form',
      data: { batch_id: `B-${2400 - d}`, defects, result: typo || defects > 8 || rnd() < 0.1 ? 'Fail' : 'Pass', inspector_email: typo ? 'ravi.iyer@example' : 'ravi.iyer@example.com' },
    });
  }

  // Shift handovers: shifts A (14:00) and B (22:00) on weekdays; a few leave the next supervisor blank.
  for (let d = 0; d < HISTORY_DAYS; d++) {
    if (!weekday(d)) continue;
    for (const [shift, h] of [['A', 14], ['B', 22]] as const) {
      const downtime = Math.round(rnd() * rnd() * 70);
      const output = 1500 + Math.round(rnd() * 600);
      push({
        workflowId: 'wf_handover', daysAgo: timeOn(d, h, 5 + Math.floor(rnd() * 20)), source: 'form',
        data: {
          shift, line: pick(LINES), output, rejects: Math.round(output * rnd() * 0.03), downtime,
          next_supervisor_email: rnd() < 0.12 ? '' : shift === 'A' ? 'farah.khan@example.com' : 'kiran.desai@example.com',
          notes: pick(['Smooth shift.', 'Die change on press 2 ran 10 minutes over.', 'Waited 25 minutes for material from stores.', 'Two operators short in the second half.']),
        },
      });
    }
  }

  // Compressor 3: runs hot a couple of times a week.
  for (let i = 0; i < 12; i++) {
    push({ workflowId: 'wf_compressor', daysAgo: 0.4 + i * 2.4 + rnd(), source: i === 5 ? 'test' : 'device', data: { reading: 86 + Math.round(rnd() * 10) } });
  }

  // Chiller 1: warm afternoons. Until it was fixed 12 days ago the SMS also went to a mistyped number and failed.
  for (let i = 0; i < 14; i++) {
    const daysAgo = timeOn(Math.floor(i * 2.1), 13 + Math.floor(rnd() * 4), Math.floor(rnd() * 60));
    if (daysAgo === null) continue;
    runs.push({
      workflowId: 'wf_chiller', daysAgo, source: 'device', data: { reading: 12.4 + Math.round(rnd() * 25) / 10 },
      ...(daysAgo > 12 && daysAgo < 22 ? { graph: chillerGraph('+91 98200 12O4') } : {}),
    });
  }

  // Main incomer: afternoon peaks; one in three goes past 2,100 kW.
  for (let i = 0; i < 9; i++) {
    push({ workflowId: 'wf_incomer', daysAgo: timeOn(1 + Math.floor(i * 3.2), 15, Math.floor(rnd() * 50)), source: 'device', data: { reading: rnd() < 0.35 ? 2120 + Math.round(rnd() * 140) : 1810 + Math.round(rnd() * 260) } });
  }

  // CNC-07 spindle vibration.
  for (let i = 0; i < 11; i++) {
    push({ workflowId: 'wf_vibration', daysAgo: 0.25 + i * 2.5 + rnd() * 0.8, source: i === 1 ? 'test' : 'device', data: { reading: 7.2 + Math.round(rnd() * 30) / 10 } });
  }

  // Boiler 1: alerts until it was paused 8 days ago.
  for (let i = 0; i < 7; i++) {
    push({ workflowId: 'wf_boiler', daysAgo: 9 + i * 3 + rnd(), source: 'device', data: { reading: 10.6 + Math.round(rnd() * 8) / 10 } });
  }

  // Schedules: shift report daily at 07:00, energy summary weekdays at 08:00, quality summary on the 1st.
  for (let d = 0; d < HISTORY_DAYS; d++) {
    push({ workflowId: 'wf_shift_report', daysAgo: timeOn(d, 7), source: 'schedule', data: { firedAt: 0 } });
    if (weekday(d)) push({ workflowId: 'wf_energy', daysAgo: timeOn(d, 8), source: 'schedule', data: { firedAt: 0 } });
    if (new Date(now - d * DAY).getDate() === 1) push({ workflowId: 'wf_monthly_quality', daysAgo: timeOn(d, 9), source: 'schedule', data: { firedAt: 0 } });
  }
  // OEE reminder: the Mondays before it was paused 12 days ago.
  for (let d = 13; d < HISTORY_DAYS; d++) {
    if (new Date(now - d * DAY).getDay() === 1) push({ workflowId: 'wf_oee', daysAgo: timeOn(d, 9), source: 'schedule', data: { firedAt: 0 } });
  }
  return runs;
}

/** History for the seeded workflows, produced by the same engine as live tests. */
export async function seedExecutions(now: number, workflows: Workflow[]): Promise<Execution[]> {
  const out: Execution[] = [];
  const planned = plannedRuns(now).sort((a, b) => b.daysAgo - a.daysAgo);
  let n = 1000;
  for (const p of planned) {
    const w = workflows.find((x) => x.id === p.workflowId);
    if (!w) continue;
    const graph = p.graph ?? (p.source === 'test' ? w.graph : w.published?.graph ?? w.graph);
    let startedAt = Math.round(now - p.daysAgo * DAY);
    const trigger = graph.nodes.find((x) => x.type === 'scheduler');
    if (p.source === 'schedule' && trigger?.type === 'scheduler') {
      const [h, m] = trigger.config.time.split(':').map(Number);
      startedAt = new Date(startedAt).setHours(h, m, 0, 0);
    }
    const alert = graph.nodes.find((x) => x.type === 'deviceAlert');
    const data = 'firedAt' in p.data ? { firedAt: startedAt }
      : alert?.type === 'deviceAlert' ? deviceAlertData(alert, SEED_DEVICES, startedAt, Number(p.data.reading)) : p.data;
    out.push(await runSimulation({
      execId: `ex_${++n}`, workflow: { id: w.id, name: w.name }, graph, source: p.source, triggerData: data,
      ctx: SEED_DIRECTORY, clock: { now: () => startedAt, sleep: async () => {} },
    }));
  }
  return out.sort((a, b) => b.startedAt - a.startedAt);
}
