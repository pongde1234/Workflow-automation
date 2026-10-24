import type {
  DelayConfig, DeviceAlertConfig, EmailConfig, IoFormsConfig, NodeType, ReportConfig, SchedulerConfig, SmsConfig, SwitchConfig,
  TriggerType, WfNode, WorkOrderConfig,
} from './types';
import { defaultSchedulerConfig } from '../engine/schedule';

export type NodeCategory = 'trigger' | 'logic' | 'action';

/** Where a node sits in the "Add a node" window. Triggers aren't listed there: they start a workflow. */
export type PickerSection = 'notify' | 'operations' | 'flow';

export const PICKER_SECTIONS: { id: PickerSection; title: string }[] = [
  { id: 'notify', title: 'Notify people' },
  { id: 'operations', title: 'Maintenance and reports' },
  { id: 'flow', title: 'Flow control' },
];

interface NodeTypeDef<C> {
  category: NodeCategory;
  section?: PickerSection;
  label: string;
  description: string;
  /** Extra words people might search for. */
  keywords: string[];
  defaultName: string;
  defaultConfig: (newId: () => string) => C;
}

/**
 * The node registry. Adding a node type = one entry here, its config type in
 * `types.ts`, a validator and a simulation step in `engine/`, a summary and a
 * config form in `nodes/`.
 */
export const NODE_TYPES: {
  ioForms: NodeTypeDef<IoFormsConfig>;
  scheduler: NodeTypeDef<SchedulerConfig>;
  deviceAlert: NodeTypeDef<DeviceAlertConfig>;
  switch: NodeTypeDef<SwitchConfig>;
  delay: NodeTypeDef<DelayConfig>;
  email: NodeTypeDef<EmailConfig>;
  sms: NodeTypeDef<SmsConfig>;
  workOrder: NodeTypeDef<WorkOrderConfig>;
  report: NodeTypeDef<ReportConfig>;
} = {
  ioForms: {
    category: 'trigger',
    label: 'IO Forms',
    description: 'Runs when a form is submitted',
    keywords: ['form', 'submission'],
    defaultName: 'Form submitted',
    defaultConfig: () => ({ formId: null }),
  },
  scheduler: {
    category: 'trigger',
    label: 'Scheduler',
    description: 'Runs at a set time',
    keywords: ['time', 'daily', 'weekly', 'schedule'],
    defaultName: 'On schedule',
    defaultConfig: () => defaultSchedulerConfig(),
  },
  deviceAlert: {
    category: 'trigger',
    label: 'Device alert',
    description: 'Runs when a sensor reading crosses a limit',
    keywords: ['sensor', 'threshold', 'alarm', 'machine', 'temperature'],
    defaultName: 'Reading out of range',
    defaultConfig: () => ({ deviceId: null, parameter: null, op: 'above', limit: '', forMinutes: 5 }),
  },
  switch: {
    category: 'logic',
    section: 'flow',
    label: 'Switch',
    description: 'Takes a different path depending on a value',
    keywords: ['if', 'condition', 'branch', 'route', 'filter'],
    defaultName: 'Check condition',
    defaultConfig: (newId) => ({ conditions: [{ id: newId(), field: null, op: null, value: '' }] }),
  },
  delay: {
    category: 'logic',
    section: 'flow',
    label: 'Delay',
    description: 'Waits before the next node runs',
    keywords: ['wait', 'pause', 'later', 'timer'],
    defaultName: 'Wait',
    defaultConfig: () => ({ amount: 15, unit: 'minutes' }),
  },
  email: {
    category: 'action',
    section: 'notify',
    label: 'Email',
    description: 'Sends an email',
    keywords: ['mail', 'message', 'notify', 'alert'],
    defaultName: 'Send email',
    defaultConfig: () => ({ to: [], other: '', subject: '', body: '' }),
  },
  sms: {
    category: 'action',
    section: 'notify',
    label: 'SMS',
    description: 'Sends a text message to phones',
    keywords: ['text', 'phone', 'mobile', 'message', 'notify', 'alert'],
    defaultName: 'Send SMS',
    defaultConfig: () => ({ to: [], other: '', message: '' }),
  },
  workOrder: {
    category: 'action',
    section: 'operations',
    label: 'Work order',
    description: 'Raises a maintenance work order',
    keywords: ['maintenance', 'ticket', 'repair', 'job', 'cmms'],
    defaultName: 'Raise work order',
    defaultConfig: () => ({ title: '', priority: 'high', assignee: null, description: '' }),
  },
  report: {
    category: 'action',
    section: 'operations',
    label: 'Report',
    description: 'Generates a report and emails it',
    keywords: ['pdf', 'excel', 'energy', 'oee', 'summary', 'shift'],
    defaultName: 'Send report',
    defaultConfig: () => ({ reportId: null, period: 'yesterday', format: 'pdf', to: [] }),
  },
};

export const ALL_NODE_TYPES = Object.keys(NODE_TYPES) as NodeType[];
export const TRIGGER_TYPES = ALL_NODE_TYPES.filter((t): t is TriggerType => NODE_TYPES[t].category === 'trigger');
/** Node types that can follow another node. */
export const ADDABLE_TYPES = ALL_NODE_TYPES.filter((t): t is Exclude<NodeType, TriggerType> => NODE_TYPES[t].category !== 'trigger');
export type AddableType = (typeof ADDABLE_TYPES)[number];

export const nodeTypeLabel = (t: NodeType) => NODE_TYPES[t].label;
export const isTriggerType = (t: NodeType): t is TriggerType => NODE_TYPES[t].category === 'trigger';
export const isActionType = (t: NodeType) => NODE_TYPES[t].category === 'action';
export const hasInput = (n: WfNode) => !isTriggerType(n.type);

/** Node types whose label, description or keywords contain the query. */
export function searchNodeTypes(query: string, types: readonly NodeType[] = ADDABLE_TYPES): NodeType[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...types];
  return types.filter((t) => {
    const d = NODE_TYPES[t];
    return [d.label, d.description, ...d.keywords].some((s) => s.toLowerCase().includes(q));
  });
}

/** A new node of `type` with defaults and a name not already used in the graph. */
export function createNode(type: NodeType, at: { x: number; y: number }, existingNames: string[], newId: (prefix: string) => string): WfNode {
  const def = NODE_TYPES[type];
  const taken = new Set(existingNames);
  let name = def.defaultName;
  for (let i = 2; taken.has(name); i++) name = `${def.defaultName} ${i}`;
  return { id: newId('n'), type, name, position: at, config: def.defaultConfig(() => newId('c')) } as WfNode;
}
