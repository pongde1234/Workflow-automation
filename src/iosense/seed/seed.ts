import { seeded } from '@/lib/util';
import type {
  DeviceAlertConfig, Directory, EmailConfig, Execution, ExecutionSource, Graph, IoDevice, IoForm, IoReport, IoUser, ReportConfig, SchedulerConfig,
  SmsConfig, SwitchCondition, WfNode, WorkOrderConfig, Workflow, XY,
} from '../domain/types';
import { DEFAULT_HANDLE, OUT_HANDLE } from '../domain/types';
import { edgeId } from '../engine/graph';
import { defaultSchedulerConfig } from '../engine/schedule';
import { deviceAlertData, runSimulation } from '../engine/simulate';

/* Fictional, IoT-flavoured sample data. Same output for the same `now`. */

export const SEED_USERS: IoUser[] = [
  { id: 'u_meera', name: 'Meera Kulkarni', email: 'meera.kulkarni@example.com', phone: '+91 90000 10001', role: 'Plant manager' },
  { id: 'u_arjun', name: 'Arjun Rao', email: 'arjun.rao@example.com', phone: '+91 90000 10002', role: 'Maintenance lead' },
  { id: 'u_sana', name: 'Sana Sheikh', email: 'sana.sheikh@example.com', phone: '+91 90000 10003', role: 'Maintenance lead' },
  { id: 'u_ravi', name: 'Ravi Iyer', email: 'ravi.iyer@example.com', phone: '+91 90000 10004', role: 'Quality engineer' },
  { id: 'u_neha', name: 'Neha Joshi', email: 'neha.joshi@example.com', phone: '+91 90000 10005', role: 'Safety officer' },
  { id: 'u_vikram', name: 'Vikram Patel', email: 'vikram.patel@example.com', phone: '+91 90000 10006', role: 'Energy analyst' },
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
];

export const SEED_DIRECTORY: Directory = { forms: SEED_FORMS, users: SEED_USERS, devices: SEED_DEVICES, reports: SEED_REPORTS };

/* ── Graph builders ── */

const COL = 384;
const at = (col: number, y: number): XY => ({ x: col * COL, y });

const form = (id: string, name: string, formId: string, p: XY): WfNode => ({ id, type: 'ioForms', name, position: p, config: { formId } });
const schedule = (id: string, name: string, cfg: Partial<SchedulerConfig>, p: XY): WfNode =>
  ({ id, type: 'scheduler', name, position: p, config: { ...defaultSchedulerConfig(0), ...cfg } });
const sw = (id: string, name: string, conditions: SwitchCondition[], p: XY): WfNode => ({ id, type: 'switch', name, position: p, config: { conditions } });
const email = (id: string, name: string, cfg: Partial<EmailConfig>, p: XY): WfNode =>
  ({ id, type: 'email', name, position: p, config: { to: [], other: '', subject: '', body: '', ...cfg } });
const device = (id: string, name: string, cfg: DeviceAlertConfig, p: XY): WfNode => ({ id, type: 'deviceAlert', name, position: p, config: cfg });
const workOrder = (id: string, name: string, cfg: WorkOrderConfig, p: XY): WfNode => ({ id, type: 'workOrder', name, position: p, config: cfg });
const sms = (id: string, name: string, cfg: SmsConfig, p: XY): WfNode => ({ id, type: 'sms', name, position: p, config: cfg });
const report = (id: string, name: string, cfg: ReportConfig, p: XY): WfNode => ({ id, type: 'report', name, position: p, config: cfg });
const cond = (id: string, field: string | null, op: SwitchCondition['op'], value = ''): SwitchCondition => ({ id, field, op, value });
const link = (source: string, target: string, handle = OUT_HANDLE) => ({ id: edgeId(source, handle), source, sourceHandle: handle, target });

function breakdownGraph(): Graph {
  return {
    nodes: [
      form('bd_t', 'Breakdown reported', 'f_breakdown', at(0, 84)),
      sw('bd_s', 'Check severity', [cond('bd_c1', 'form.severity', 'is', 'Critical'), cond('bd_c2', 'form.temperature', 'gt', '80')], at(1, 48)),
      email('bd_e1', 'Alert maintenance leads', {
        to: ['user:u_arjun', 'user:u_sana'],
        subject: 'Critical breakdown on {{Machine ID}}',
        body: '{{Machine ID}} on {{Line}} was reported as Critical.\n\n{{Description}}',
      }, at(2, 0)),
      email('bd_e2', 'Alert safety officer', {
        to: ['user:u_neha'],
        subject: 'Overheating: {{Machine ID}} at {{Temperature (°C)}} °C',
        body: '{{Machine ID}} on {{Line}} is running at {{Temperature (°C)}} °C.',
      }, at(2, 168)),
      email('bd_e3', 'Notify supervisor', {
        to: ['field:form.supervisor_email'],
        subject: 'Breakdown logged: {{Machine ID}}',
        body: 'A {{Severity}} breakdown was logged for {{Machine ID}} on {{Line}}.\n\n{{Description}}',
      }, at(2, 336)),
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
      }, at(2, 168)),
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
      email('sf_e2', 'Log near misses', { to: ['user:u_neha'], subject: '{{Incident type}} at {{Location}}', body: '{{Details}}' }, at(2, 336)),
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
    }, at(2, i * 168))];
    nodes.push(email(`al_m${n}`, `Copy manager (${line})`, {
      to: ['user:u_meera'],
      subject: '{{Line}}: {{Machine ID}} alarm forwarded',
      body: 'Forwarded for visibility: {{Description}}',
    }, at(3, i * 168)));
    return nodes;
  });
  return {
    nodes: [
      form('al_t', 'Alarm reported', 'f_breakdown', at(0, 336)),
      sw('al_s', 'Route by line', LINES.map((line, i) => cond(`al_c${i + 1}`, 'form.line', 'is', line)), at(1, 264)),
      ...lineNodes,
      email('al_d', 'Notify plant manager', {
        to: ['user:u_meera'],
        subject: 'Unrouted alarm on {{Machine ID}}',
        body: 'An alarm came in without a known line.\n\n{{Description}}',
      }, at(2, 672)),
    ],
    edges: [
      link('al_t', 'al_s'),
      ...LINES.map((_, i) => link('al_s', `al_e${i + 1}`, `al_c${i + 1}`)),
      ...LINES.map((_, i) => link(`al_e${i + 1}`, `al_m${i + 1}`)),
      link('al_s', 'al_d', DEFAULT_HANDLE),
    ],
  };
}

/* ── Workflows ── */

const DAY = 86_400_000;

export function seedWorkflows(now: number): Workflow[] {
  const wf = (w: Omit<Workflow, 'published' | 'createdAt' | 'updatedAt'> & { createdDaysAgo: number; updatedDaysAgo: number; publishedGraph?: Graph }): Workflow => ({
    id: w.id, name: w.name, description: w.description, status: w.status, graph: w.graph,
    published: w.status === 'draft' ? null : { graph: w.publishedGraph ?? w.graph, publishedAt: now - w.updatedDaysAgo * DAY },
    createdAt: now - w.createdDaysAgo * DAY, updatedAt: now - w.updatedDaysAgo * DAY,
  });
  return [
    wf({ id: 'wf_breakdown', name: 'Critical breakdown alerts', description: 'Alerts maintenance and safety when a breakdown is reported.', status: 'active', graph: breakdownGraph(), createdDaysAgo: 40, updatedDaysAgo: 6 }),
    wf({ id: 'wf_compressor', name: 'Compressor overheating response', description: 'Raises a work order and texts maintenance when Compressor 3 runs hot.', status: 'active', graph: compressorGraph(), createdDaysAgo: 25, updatedDaysAgo: 4 }),
    wf({ id: 'wf_energy', name: 'Daily energy summary', description: 'Emails the energy report every weekday morning.', status: 'active', graph: energyGraph(), createdDaysAgo: 60, updatedDaysAgo: 21 }),
    wf({ id: 'wf_oee', name: 'Weekly OEE review reminder', description: 'Reminds the plant team before the Monday OEE review.', status: 'paused', graph: oeeGraph(), createdDaysAgo: 90, updatedDaysAgo: 12 }),
    wf({
      id: 'wf_quality', name: 'Quality failure escalation', description: 'Escalates failed inspections to quality engineering.', status: 'active',
      graph: qualityGraph('Failed inspection: batch {{Batch ID}} ({{Defects found}} defects)'),
      publishedGraph: qualityGraph('Batch {{Batch ID}} failed inspection'), createdDaysAgo: 30, updatedDaysAgo: 1,
    }),
    wf({ id: 'wf_safety', name: 'Safety incident routing', description: 'Routes safety incidents to the safety officer.', status: 'draft', graph: safetyGraph(), createdDaysAgo: 2, updatedDaysAgo: 0 }),
    wf({ id: 'wf_alarm', name: 'Plant-wide alarm routing', description: 'Sends each line’s alarms to its maintenance lead.', status: 'active', graph: alarmGraph(), createdDaysAgo: 75, updatedDaysAgo: 9 }),
  ];
}

/* ── Execution history ── */

interface PlannedRun { workflowId: string; daysAgo: number; source: ExecutionSource; data: Record<string, unknown> }

function plannedRuns(now: number): PlannedRun[] {
  const rnd = seeded(20261023);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const runs: PlannedRun[] = [];
  const minutes = (n: number) => n / 1440;

  // Breakdown alerts: form submissions, newest one fails (blank supervisor email).
  for (let i = 0; i < 9; i++) {
    const severity = pick(['Low', 'Medium', 'High', 'Critical']);
    runs.push({
      workflowId: 'wf_breakdown', daysAgo: 2 + i * 3 + rnd(), source: i === 4 ? 'test' : 'form',
      data: {
        machine_id: pick(['CNC-07', 'PRS-12', 'WLD-03', 'CNV-21']), line: pick(LINES), severity,
        temperature: severity === 'Critical' ? 70 + Math.round(rnd() * 30) : 55 + Math.round(rnd() * 40),
        supervisor_email: 'line2.supervisor@example.com', description: 'Unexpected stop reported by operator.',
      },
    });
  }
  runs.push({
    workflowId: 'wf_breakdown', daysAgo: minutes(95), source: 'form',
    data: { machine_id: 'PRS-12', line: 'Line 3', severity: 'Low', temperature: 64, supervisor_email: '', description: 'Hydraulic pressure warning, press still running.' },
  });

  // Compressor: readings past 85 °C.
  for (let i = 0; i < 6; i++) {
    runs.push({ workflowId: 'wf_compressor', daysAgo: 0.6 + i * 3.5 + rnd(), source: i === 2 ? 'test' : 'device', data: { reading: 87 + Math.round(rnd() * 10) } });
  }

  // Energy summary: weekday mornings.
  for (let d = 1; d <= 14; d++) {
    const day = new Date(now - d * DAY).getDay();
    if (day === 0 || day === 6) continue;
    runs.push({ workflowId: 'wf_energy', daysAgo: d, source: 'schedule', data: { firedAt: 0 } });
  }
  // OEE reminder: the three Mondays before it was paused.
  for (let d = 13, found = 0; found < 3 && d < 60; d++) {
    if (new Date(now - d * DAY).getDay() !== 1) continue;
    runs.push({ workflowId: 'wf_oee', daysAgo: d, source: 'schedule', data: { firedAt: 0 } });
    found++;
  }
  // Quality escalation.
  for (let i = 0; i < 6; i++) {
    const result = pick(['Pass', 'Fail']);
    runs.push({
      workflowId: 'wf_quality', daysAgo: 1.5 + i * 4 + rnd(), source: i === 0 ? 'test' : 'form',
      data: { batch_id: `B-${2280 + i}`, defects: Math.round(rnd() * 12), result, inspector_email: 'ravi.iyer@example.com' },
    });
  }
  // Alarm routing.
  for (let i = 0; i < 7; i++) {
    runs.push({
      workflowId: 'wf_alarm', daysAgo: 1 + i * 4 + rnd(), source: 'form',
      data: { machine_id: pick(['CNC-07', 'PRS-12', 'WLD-03']), line: i === 5 ? '' : pick(LINES), severity: pick(['High', 'Critical']), temperature: 70, supervisor_email: '', description: 'Alarm raised by line controller.' },
    });
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
    const graph = p.source === 'test' ? w.graph : w.published?.graph ?? w.graph;
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
