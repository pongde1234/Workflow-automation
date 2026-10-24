import { describe, expect, it } from 'vitest';
import type { Graph, SchedulerConfig, WfNode } from '../domain/types';
import { DEFAULT_HANDLE } from '../domain/types';
import { SEED_DIRECTORY, seedExecutions, seedWorkflows } from '../seed/seed';
import { searchNodeTypes } from '../domain/nodeTypes';
import { nodeSummary } from '../canvas/summary';
import { canConnect, flowOrder, reachable } from './graph';
import { addCondition, connect, removeCondition, removeNode } from './graphOps';
import { evaluate } from './operators';
import { defaultSchedulerConfig, formatTime, nextRun, summarizeSchedule, toCron } from './schedule';
import { invalidAddresses, parseAddresses } from './email';
import { invalidPhones, isValidPhone } from './phone';
import { blockingIssues, validateWorkflow } from './validate';
import { defaultTestData, deviceAlertData, runSimulation } from './simulate';
import { freeSpot, insertOnEdge, placeAfter } from './layout';

const NOW = new Date(2026, 9, 23, 10, 0).getTime();
const ctx = { ...SEED_DIRECTORY, now: NOW };
const clock = { now: () => NOW, sleep: async () => {} };
const wfs = seedWorkflows(NOW);
const graphOf = (id: string) => structuredClone(wfs.find((w) => w.id === id)!.graph);

const formNode = (id = 't'): WfNode => ({ id, type: 'ioForms', name: 'Form', position: { x: 0, y: 0 }, config: { formId: 'f_breakdown' } });
const emailNode = (id: string, extra: Partial<Extract<WfNode, { type: 'email' }>['config']> = {}): WfNode =>
  ({ id, type: 'email', name: `Email ${id}`, position: { x: 400, y: 0 }, config: { to: ['user:u_arjun'], other: '', subject: 'Hi', body: 'Body', ...extra } });

function simulate(graph: Graph, data: Record<string, unknown>) {
  return runSimulation({ execId: 'x', workflow: { id: 'w', name: 'W' }, graph, source: 'test', triggerData: data, ctx, clock });
}

describe('graph rules', () => {
  const g: Graph = { nodes: [formNode(), emailNode('a'), emailNode('b')], edges: [] };

  it('refuses connections into a trigger, to itself and loops', () => {
    expect(canConnect(g, 'a', 'out', 't')).toMatchObject({ ok: false });
    expect(canConnect(g, 'a', 'out', 'a')).toMatchObject({ ok: false });
    const chain = connect(connect(g, 't', 'out', 'a'), 'a', 'out', 'b');
    expect(canConnect(chain, 'b', 'out', 'a')).toEqual({ ok: false, reason: 'That would create a loop.' });
  });

  it('allows one link per output and replaces it', () => {
    const g1 = connect(g, 't', 'out', 'a');
    expect(canConnect(g1, 't', 'out', 'b')).toMatchObject({ ok: true, replaces: g1.edges[0].id });
    const g2 = connect(g1, 't', 'out', 'b');
    expect(g2.edges).toHaveLength(1);
    expect(g2.edges[0].target).toBe('b');
  });

  it('lets inputs take many links and removes edges with their node', () => {
    const merged = connect(connect(connect(g, 't', 'out', 'a'), 'a', 'out', 'b'), 't', 'out', 'b');
    expect(canConnect(merged, 'a', 'out', 'b')).toMatchObject({ ok: false });
    expect(removeNode(merged, 'b').edges.every((e) => e.target !== 'b')).toBe(true);
  });

  it('removing a Switch condition removes its edge', () => {
    const g0 = graphOf('wf_breakdown');
    const g1 = removeCondition(g0, 'bd_s', 'bd_c2');
    expect(g1.edges.some((e) => e.sourceHandle === 'bd_c2')).toBe(false);
    expect(addCondition(g1, 'bd_s', 'c_new').nodes.find((n) => n.id === 'bd_s')!.type).toBe('switch');
  });

  it('orders the flow trigger-first along branches', () => {
    expect(flowOrder(graphOf('wf_breakdown'))).toEqual(['bd_t', 'bd_s', 'bd_e1', 'bd_e2', 'bd_e3']);
  });
});

describe('layout', () => {
  it('places new nodes right of their source without overlapping', () => {
    const g = graphOf('wf_breakdown');
    const p = placeAfter(g, {}, 'bd_e1', 'out', { w: 288, h: 144 });
    expect(p.x).toBeGreaterThan(g.nodes.find((n) => n.id === 'bd_e1')!.position.x);
    expect(freeSpot(g, {}, { x: 720, y: 0 }, { w: 288, h: 144 }).y).toBeGreaterThan(336);
  });
});

describe('inserting on a connection', () => {
  const email: WfNode = { id: 'n_new', type: 'email', name: 'New', position: { x: 0, y: 0 }, config: { to: [], other: '', subject: '', body: '' } };

  it('rewires A → new → B and slides what follows B to make room', () => {
    const g = graphOf('wf_breakdown');
    const before = (id: string) => g.nodes.find((n) => n.id === id)!.position;
    const next = insertOnEdge(g, {}, 'e_bd_s_bd_c1', email);
    expect(next.edges.find((e) => e.source === 'bd_s' && e.sourceHandle === 'bd_c1')?.target).toBe('n_new');
    expect(next.edges.find((e) => e.source === 'n_new')?.target).toBe('bd_e1');
    expect(next.nodes.find((n) => n.id === 'n_new')!.position).toEqual(before('bd_e1'));
    expect(next.nodes.find((n) => n.id === 'bd_e1')!.position.x).toBe(before('bd_e1').x + 384); // node width + gap
    expect(next.nodes.find((n) => n.id === 'bd_e2')!.position).toEqual(before('bd_e2'));
    expect(reachable(next).size).toBe(next.nodes.length);
  });

  it('uses the free space between distant nodes and keeps a Switch’s first condition on the path', () => {
    const g: Graph = { nodes: [formNode(), { ...emailNode('b'), position: { x: 1300, y: 0 } }], edges: [] };
    const linked = connect(g, 't', 'out', 'b');
    const sw: WfNode = { id: 's', type: 'switch', name: 'S', position: { x: 0, y: 0 }, config: { conditions: [{ id: 'c1', field: null, op: null, value: '' }] } };
    const next = insertOnEdge(linked, {}, linked.edges[0].id, sw);
    expect(next.nodes.find((n) => n.id === 'b')!.position.x).toBe(1300);
    expect(next.nodes.find((n) => n.id === 's')!.position.x).toBeGreaterThan(288);
    expect(next.edges.find((e) => e.source === 's')).toMatchObject({ sourceHandle: 'c1', target: 'b' });
  });
});

describe('operators', () => {
  it('never matches a blank value except "is empty"', () => {
    expect(evaluate('gt', '', '-5', 'number', 'Temperature')).toEqual({ matched: false, note: '‘Temperature’ was empty' });
    expect(evaluate('is_empty', null, '', 'number', 'Temperature').matched).toBe(true);
  });
  it('compares numbers strictly and text without case', () => {
    expect(evaluate('gt', '1,200', '80', 'number', 'X').matched).toBe(true);
    expect(evaluate('gt', 'abc', '80', 'number', 'X').note).toContain('not a number');
    expect(evaluate('is', ' critical ', 'Critical', 'choice', 'S').matched).toBe(true);
    expect(evaluate('before', '2026-10-01', '2026-10-02', 'date', 'D').matched).toBe(true);
  });
});

describe('schedule', () => {
  const base = defaultSchedulerConfig(NOW);
  const cfg = (p: Partial<SchedulerConfig>): SchedulerConfig => ({ ...base, ...p });

  it('summarises every frequency in plain English', () => {
    expect(summarizeSchedule(cfg({ frequency: 'daily', weekdaysOnly: true, time: '09:00' }))).toBe('Weekdays at 9:00 AM');
    expect(summarizeSchedule(cfg({ frequency: 'daily', weekdaysOnly: false, time: '17:45' }))).toBe('Every day at 5:45 PM');
    expect(summarizeSchedule(cfg({ frequency: 'weekly', days: [4, 1], time: '00:30' }))).toBe('Every Monday and Thursday at 12:30 AM');
    expect(summarizeSchedule(cfg({ frequency: 'weekly', days: [1, 2, 3, 4, 5] }))).toBe('Weekdays at 9:00 AM');
    expect(summarizeSchedule(cfg({ frequency: 'monthly', dayOfMonth: 2 }))).toBe('On the 2nd of every month at 9:00 AM');
    expect(summarizeSchedule(cfg({ frequency: 'minutes', everyMinutes: 15 }))).toBe('Every 15 minutes');
    expect(summarizeSchedule(cfg({ frequency: 'hourly', minute: 0 }))).toBe('Every hour, on the hour');
    expect(summarizeSchedule(cfg({ mode: 'once', date: '2026-10-24', time: '09:00' }))).toBe('Once on Sat, 24 Oct 2026 at 9:00 AM');
  });

  it('builds cron for multi-day weekly and finds the next run', () => {
    expect(toCron(cfg({ frequency: 'weekly', days: [5, 1, 3], time: '08:15' }))).toBe('15 8 * * 1,3,5');
    const next = nextRun(cfg({ frequency: 'daily', weekdaysOnly: true, time: '09:00' }), NOW);
    expect(new Date(next!)).toEqual(new Date(2026, 9, 26, 9, 0)); // Fri 23 Oct 10:00 → Mon 26 Oct 9:00
  });

  it('returns no next run for a Once in the past', () => {
    expect(nextRun(cfg({ mode: 'once', date: '2026-10-01', time: '09:00' }), NOW)).toBeNull();
    expect(formatTime('00:05')).toBe('12:05 AM');
  });
});

describe('email addresses', () => {
  it('parses and validates typed addresses', () => {
    expect(parseAddresses(' a@x.com, ,b@y.io;\nc@z.org ')).toEqual(['a@x.com', 'b@y.io', 'c@z.org']);
    expect(invalidAddresses('a@x.com, priya@plant, nope')).toEqual(['priya@plant', 'nope']);
  });
});

describe('validation', () => {
  it('finds the seeded Draft’s errors on the right node and field', () => {
    const issues = validateWorkflow(graphOf('wf_safety'), ctx);
    const errors = blockingIssues(graphOf('wf_safety'), issues);
    expect(errors.map((i) => [i.nodeId, i.field])).toEqual(expect.arrayContaining([
      ['sf_s', 'conditions.sf_c2.op'],
      ['sf_e1', 'subject'],
    ]));
  });

  it('passes the published seeded workflows with no blocking errors', () => {
    for (const w of wfs.filter((x) => x.status !== 'draft')) {
      expect(blockingIssues(w.graph, validateWorkflow(w.graph, ctx))).toEqual([]);
    }
  });

  it('warns about an optional form field used as a recipient', () => {
    const issues = validateWorkflow(graphOf('wf_breakdown'), ctx);
    expect(issues.find((i) => i.nodeId === 'bd_e3' && i.severity === 'warning')?.message).toContain('Supervisor email');
  });

  it('flags workflow-level problems', () => {
    expect(validateWorkflow({ nodes: [], edges: [] }, ctx)[0].message).toBe('Add a trigger to start the workflow.');
    const lonely: Graph = { nodes: [formNode(), emailNode('a')], edges: [] };
    const issues = validateWorkflow(lonely, ctx);
    expect(issues.some((i) => !i.nodeId && i.message.startsWith('This workflow doesn’t do anything yet'))).toBe(true);
    expect(issues.some((i) => i.nodeId === 'a' && i.severity === 'warning')).toBe(true);
  });

  it('names invalid addresses, unknown tokens and past Once schedules', () => {
    const g: Graph = { nodes: [formNode(), emailNode('a', { other: 'ok@x.com, bob@', subject: 'Hi {{Machine Id}} {{Nope}}' })], edges: [] };
    const issues = validateWorkflow(connect(g, 't', 'out', 'a'), ctx);
    expect(issues.find((i) => i.field === 'other')?.message).toBe('‘bob@’ isn’t a valid email address.');
    expect(issues.find((i) => i.field === 'subject')?.message).toContain('{{Nope}}');
    const s: Graph = { nodes: [{ id: 's', type: 'scheduler', name: 'S', position: { x: 0, y: 0 }, config: { ...defaultSchedulerConfig(NOW), mode: 'once', date: '2026-10-01' } }], edges: [] };
    expect(validateWorkflow(s, ctx).some((i) => i.field === 'date' && i.message.startsWith('This time has already passed'))).toBe(true);
  });
});

describe('simulation', () => {
  const sample = defaultTestData(graphOf('wf_breakdown').nodes[0], SEED_DIRECTORY, NOW);

  it('runs the first matching condition and skips the other branches', async () => {
    const e = await simulate(graphOf('wf_breakdown'), { ...sample, severity: 'Critical', temperature: 95 });
    expect(e.status).toBe('success');
    expect(e.path).toEqual(['bd_t', 'bd_s', 'bd_e1']);
    const sw = e.nodes.find((n) => n.nodeId === 'bd_s')!;
    expect(sw.takenLabel).toBe('Severity is Critical');
    expect(e.nodes.find((n) => n.nodeId === 'bd_e2')).toMatchObject({ status: 'skipped', message: 'Skipped: condition not met.' });
    expect(e.nodes.find((n) => n.nodeId === 'bd_e1')!.output).toMatchObject({ subject: 'Critical breakdown on CNC-07', simulated: true });
  });

  it('falls through to Default and fails on a blank recipient', async () => {
    const e = await simulate(graphOf('wf_breakdown'), { ...sample, severity: 'Low', temperature: '', supervisor_email: '' });
    expect(e.nodes.find((n) => n.nodeId === 'bd_s')!.takenHandle).toBe(DEFAULT_HANDLE);
    expect(e.status).toBe('failed');
    expect(e.failedNodeId).toBe('bd_e3');
    expect(e.nodes.find((n) => n.nodeId === 'bd_e3')).toMatchObject({ status: 'failed', field: 'to', message: 'Recipient ‘Supervisor email’ was empty in this submission. No email was sent.' });
    expect(e.summary).toBe('Failed at Notify supervisor: recipient was empty');
  });

  it('marks nodes after a failure as not run', async () => {
    const g = graphOf('wf_alarm');
    const broken = { ...g, nodes: g.nodes.map((n) => (n.id === 'al_e2' && n.type === 'email' ? { ...n, config: { ...n.config, to: [], other: 'bad@' } } : n)) };
    const e = await simulate(broken, { ...sample, line: 'Line 2' });
    expect(e.nodes.find((n) => n.nodeId === 'al_m2')).toMatchObject({ status: 'not_run', message: 'Didn’t run because ‘Notify Line 2 maintenance’ failed.' });
  });

  it('reports every update in order and is deterministic', async () => {
    const seen: string[] = [];
    const run = () => runSimulation({ execId: 'x', workflow: { id: 'w', name: 'W' }, graph: graphOf('wf_energy'), source: 'test', triggerData: { firedAt: NOW }, ctx, clock, onUpdate: (e) => seen.push(e.nodes.map((n) => n.status).join(',')) });
    const a = await run();
    expect(seen.slice(0, 3)).toEqual(['queued,not_run', 'running,not_run', 'success,queued']);
    expect(await run()).toEqual(a);
    expect(a.nodes[1].output).toMatchObject({
      report: 'Energy consumption summary', period: 'Thu, 22 Oct 2026', file: 'energy-consumption-summary-2026-10-22.pdf',
      to: ['vikram.patel@example.com', 'meera.kulkarni@example.com'],
    });
    expect(a.summary).toBe('Completed: 1 report simulated');
  });
});

describe('newer node types', () => {
  const alert = () => graphOf('wf_compressor').nodes.find((n) => n.type === 'deviceAlert')!;

  it('finds nodes by what people call them', () => {
    expect(searchNodeTypes('')).toHaveLength(6);
    expect(searchNodeTypes('text')).toContain('sms');
    expect(searchNodeTypes('Ticket')).toEqual(['workOrder']);
    expect(searchNodeTypes('wait')).toEqual(['delay']);
  });

  it('runs a device alert through a work order and a text', async () => {
    const data = deviceAlertData(alert() as Extract<WfNode, { type: 'deviceAlert' }>, SEED_DIRECTORY.devices, NOW, 91);
    expect(data).toMatchObject({ device: 'Compressor 3', parameter: 'Temperature', unit: '°C', limit: 85, reading: 91 });
    const e = await simulate(graphOf('wf_compressor'), data);
    expect(e.path).toEqual(['cp_t', 'cp_w', 'cp_s']);
    expect(e.nodes[0].message).toBe('Compressor 3 temperature read 91 °C, above the 85 °C limit.');
    expect(e.nodes[1].output).toMatchObject({ title: 'Compressor 3 running hot at 91 °C', priority: 'High', assignee: 'Arjun Rao' });
    expect(e.nodes[2].output).toMatchObject({ to: ['+91 90000 10002', '+91 90000 10003'], message: 'Compressor 3 at 91 °C (limit 85). Work order raised, please check.' });
    expect(e.summary).toBe('Completed: 1 work order and 1 text simulated');
  });

  it('pre-fills a reading just past the limit', () => {
    const below = { ...alert(), config: { ...(alert() as Extract<WfNode, { type: 'deviceAlert' }>).config, op: 'below' as const } };
    expect(defaultTestData(alert(), SEED_DIRECTORY, NOW).reading).toBeGreaterThan(85);
    expect(defaultTestData(below, SEED_DIRECTORY, NOW).reading).toBeLessThan(85);
  });

  it('validates phones, delays, reports and device alerts', () => {
    expect(isValidPhone('+91 90000 10002')).toBe(true);
    expect(invalidPhones('+91 90000 10002, 12ab, 123')).toEqual(['12ab', '123']);
    const g: Graph = {
      nodes: [
        { id: 't', type: 'deviceAlert', name: 'A', position: { x: 0, y: 0 }, config: { deviceId: 'd_comp3', parameter: 'nope', op: 'above', limit: 'hot', forMinutes: 0 } },
        { id: 'd', type: 'delay', name: 'D', position: { x: 400, y: 0 }, config: { amount: 0, unit: 'minutes' } },
        { id: 's', type: 'sms', name: 'S', position: { x: 800, y: 0 }, config: { to: [], other: '12ab', message: '' } },
        { id: 'r', type: 'report', name: 'R', position: { x: 1200, y: 0 }, config: { reportId: null, period: 'yesterday', format: 'pdf', to: [] } },
      ],
      edges: [],
    };
    const linked = connect(connect(connect(g, 't', 'out', 'd'), 'd', 'out', 's'), 's', 'out', 'r');
    const at = (id: string) => validateWorkflow(linked, ctx).filter((i) => i.nodeId === id && i.severity === 'error').map((i) => i.field);
    expect(at('t')).toEqual(['parameter', 'limit']);
    expect(at('d')).toEqual(['amount']);
    expect(at('s')).toEqual(['other', 'message']);
    expect(at('r')).toEqual(['reportId', 'to']);
  });

  it('needs an action, not only logic, to do something', () => {
    const g: Graph = {
      nodes: [formNode(), { id: 'd', type: 'delay', name: 'D', position: { x: 400, y: 0 }, config: { amount: 5, unit: 'minutes' } }],
      edges: [],
    };
    const issues = validateWorkflow(connect(g, 't', 'out', 'd'), ctx);
    expect(issues.some((i) => !i.nodeId && i.message.startsWith('This workflow doesn’t do anything yet'))).toBe(true);
  });

  it('fails an SMS to a malformed number and says so', async () => {
    const g = graphOf('wf_compressor');
    const broken = { ...g, nodes: g.nodes.map((n) => (n.type === 'sms' ? { ...n, config: { ...n.config, other: '12ab' } } : n)) };
    const e = await simulate(broken, deviceAlertData(alert() as Extract<WfNode, { type: 'deviceAlert' }>, SEED_DIRECTORY.devices, NOW, 90));
    expect(e.nodes.find((n) => n.nodeId === 'cp_s')).toMatchObject({ status: 'failed', field: 'other', message: '‘12ab’ isn’t a valid phone number. No text was sent.' });
    expect(e.summary).toBe('Failed at Text maintenance leads: invalid recipient');
  });

  it('summarises a device alert on its card', () => {
    expect(nodeSummary(alert(), { ...SEED_DIRECTORY, vars: [] })).toBe('Compressor 3 · Temperature above 85 °C');
  });
});

describe('seed', () => {
  it('is deterministic for the same moment', async () => {
    expect(seedWorkflows(NOW)).toEqual(seedWorkflows(NOW));
    const [a, b] = await Promise.all([seedExecutions(NOW, wfs), seedExecutions(NOW, seedWorkflows(NOW))]);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(30);
    expect(a.filter((e) => e.workflowId === 'wf_breakdown')[0].status).toBe('failed');
  });

  it('connects every seeded node to its trigger', () => {
    for (const w of wfs) expect(reachable(w.graph).size).toBe(w.graph.nodes.length);
  });
});
