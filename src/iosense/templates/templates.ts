import type { Graph } from '../domain/types';
import { DEFAULT_HANDLE } from '../domain/types';
import { ROW, at, cond, device, email, form, link, report, schedule, sms, sw, workOrder } from '../seed/builders';

/** A ready-made workflow to start from. `build` returns fixed ids; use it through `withFreshIds`. */
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  build: () => Graph;
}

/**
 * Plant routines people set up first, built on the sample directory (forms,
 * people, devices, reports). Each validates with no errors or warnings, so a
 * template can be tested straight away.
 */
export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'breakdown',
    name: 'Critical breakdown escalation',
    description: 'Raises a work order and alerts the maintenance leads when a breakdown is reported as Critical.',
    build: () => ({
      nodes: [
        form('t', 'Breakdown reported', 'f_breakdown', at(0, 48)),
        sw('s', 'Is it critical?', [cond('c1', 'form.severity', 'is', 'Critical')], at(1, 24)),
        workOrder('w', 'Raise work order', {
          title: 'Critical breakdown on {{Machine ID}}',
          priority: 'critical',
          assignee: 'u_arjun',
          description: '{{Machine ID}} on {{Line}} was reported as Critical.\n\n{{Description}}',
        }, at(2, 0)),
        email('e1', 'Alert maintenance leads', {
          to: ['user:u_arjun', 'user:u_sana'],
          subject: 'Critical breakdown on {{Machine ID}}',
          body: '{{Machine ID}} on {{Line}} was reported as Critical. A work order is raised.\n\n{{Description}}',
        }, at(3, 0)),
        email('e2', 'Tell the shift supervisor', {
          to: ['user:u_kiran'],
          subject: '{{Severity}} breakdown logged: {{Machine ID}}',
          body: 'A {{Severity}} breakdown was logged for {{Machine ID}} on {{Line}}.\n\n{{Description}}',
        }, at(2, ROW)),
      ],
      edges: [link('t', 's'), link('s', 'w', 'c1'), link('w', 'e1'), link('s', 'e2', DEFAULT_HANDLE)],
    }),
  },
  {
    id: 'energy',
    name: 'Daily energy report',
    description: 'Emails yesterday’s energy report to the energy analyst and the plant manager every weekday at 8:00.',
    build: () => ({
      nodes: [
        schedule('t', 'Weekday mornings', { frequency: 'daily', time: '08:00', weekdaysOnly: true }, at(0, 0)),
        report('r', 'Send energy report', { reportId: 'r_energy', period: 'yesterday', format: 'pdf', to: ['user:u_vikram', 'user:u_meera'] }, at(1, 0)),
      ],
      edges: [link('t', 'r')],
    }),
  },
  {
    id: 'device',
    name: 'Device threshold alert',
    description: 'Texts the maintenance leads and raises a work order when Compressor 3 runs above 85 °C for 5 minutes.',
    build: () => ({
      nodes: [
        device('t', 'Compressor running hot', { deviceId: 'd_comp3', parameter: 'temperature', op: 'above', limit: '85', forMinutes: 5 }, at(0, 0)),
        sms('s', 'Text maintenance leads', {
          to: ['user:u_arjun', 'user:u_sana'],
          other: '',
          message: '{{Device}} at {{Reading}} {{Unit}} (limit {{Limit}}). Please check.',
        }, at(1, 0)),
        workOrder('w', 'Raise work order', {
          title: '{{Device}} running hot at {{Reading}} {{Unit}}',
          priority: 'high',
          assignee: 'u_sana',
          description: '{{Parameter}} read {{Reading}} {{Unit}} at {{Alert time}}, above the {{Limit}} {{Unit}} limit.',
        }, at(2, 0)),
      ],
      edges: [link('t', 's'), link('s', 'w')],
    }),
  },
  {
    id: 'quality',
    name: 'Quality failure escalation',
    description: 'Sends failed inspections to the quality engineer, and tells planning when a batch is cleared.',
    build: () => ({
      nodes: [
        form('t', 'Inspection logged', 'f_quality', at(0, 48)),
        sw('s', 'Did it fail?', [cond('c1', 'form.result', 'is', 'Fail')], at(1, 24)),
        email('e1', 'Escalate failed batch', {
          to: ['user:u_ravi'],
          subject: 'Batch {{Batch ID}} failed inspection',
          body: 'Batch {{Batch ID}} failed inspection with {{Defects found}} defects.',
        }, at(2, 0)),
        email('e2', 'Tell planning it’s cleared', {
          to: ['user:u_tara'],
          subject: 'Batch {{Batch ID}} cleared',
          body: 'Batch {{Batch ID}} passed inspection ({{Defects found}} defects).',
        }, at(2, ROW)),
      ],
      edges: [link('t', 's'), link('s', 'e1', 'c1'), link('s', 'e2', DEFAULT_HANDLE)],
    }),
  },
  {
    id: 'shift',
    name: 'Shift production report',
    description: 'Sends yesterday’s output, rejects and downtime to the shift supervisors every morning at 7:00.',
    build: () => ({
      nodes: [
        schedule('t', 'Every morning at 07:00', { frequency: 'daily', time: '07:00', weekdaysOnly: false }, at(0, 0)),
        report('r', 'Send shift production report', { reportId: 'r_shift', period: 'yesterday', format: 'xlsx', to: ['user:u_kiran', 'user:u_farah', 'user:u_tara'] }, at(1, 0)),
      ],
      edges: [link('t', 'r')],
    }),
  },
  {
    id: 'safety',
    name: 'Safety incident routing',
    description: 'Emails every safety incident to the safety officer and the plant manager as soon as it’s reported.',
    build: () => ({
      nodes: [
        form('t', 'Incident reported', 'f_safety', at(0, 0)),
        email('e', 'Notify safety officer', {
          to: ['user:u_neha', 'user:u_meera'],
          subject: '{{Incident type}} at {{Location}}',
          body: '{{Reported by}} reported a {{Incident type}} at {{Location}}.\n\n{{Details}}',
        }, at(1, 0)),
      ],
      edges: [link('t', 'e')],
    }),
  },
];
