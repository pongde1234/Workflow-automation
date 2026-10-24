/* iosense Workflow Automation — domain model. Pure types, no UI. */

export interface XY { x: number; y: number }

/* ── Directory & forms (seeded, read-only in this prototype) ── */

export type FormFieldType = 'text' | 'textarea' | 'number' | 'email' | 'date' | 'select';

export interface IoFormField {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options?: string[];
  sample: string | number | null;
}

export interface IoForm { id: string; name: string; fields: IoFormField[] }

export interface IoUser { id: string; name: string; email: string; phone: string; role: string }

/** A connected device and the readings it reports. */
export interface DeviceParameter { key: string; label: string; unit: string }
export interface IoDevice { id: string; name: string; location: string; parameters: DeviceParameter[] }

/** A report iosense can generate (energy, OEE…). */
export interface IoReport { id: string; name: string; description: string }

/** Everything a workflow can refer to: forms, people, devices and reports. Read-only here. */
export interface Directory { forms: IoForm[]; users: IoUser[]; devices: IoDevice[]; reports: IoReport[] }

/* ── Values a trigger provides (form fields, run time…) ── */

export type DataType = 'text' | 'number' | 'date' | 'choice';

export interface TriggerVariable {
  /** Stable id used by conditions and recipients, e.g. `form.supervisor_email`. */
  id: string;
  /** What people see and type inside `{{ }}`, e.g. `Supervisor email`. */
  label: string;
  type: DataType;
  isEmail: boolean;
  required: boolean;
  options?: string[];
}

/* ── Nodes ── */

export type TriggerType = 'ioForms' | 'scheduler' | 'deviceAlert';
export type NodeType = TriggerType | 'switch' | 'delay' | 'email' | 'sms' | 'workOrder' | 'report';

export interface IoFormsConfig { formId: string | null }

export interface DeviceAlertConfig {
  deviceId: string | null;
  /** DeviceParameter key. */
  parameter: string | null;
  op: 'above' | 'below';
  /** As typed; a number when valid. */
  limit: string;
  /** How long the reading must stay past the limit; 0 = straight away. */
  forMinutes: number;
}

export type Frequency = 'minutes' | 'hourly' | 'daily' | 'weekly' | 'monthly';
export type MinuteInterval = 5 | 10 | 15 | 20 | 30;

export interface SchedulerConfig {
  mode: 'once' | 'recurring';
  /** YYYY-MM-DD (Once). */
  date: string;
  /** HH:mm, 24-hour. */
  time: string;
  frequency: Frequency;
  everyMinutes: MinuteInterval;
  /** Minute past the hour (Hourly). */
  minute: number;
  weekdaysOnly: boolean;
  /** 0 = Sunday … 6 = Saturday (Weekly). */
  days: number[];
  /** 1–28 (Monthly). */
  dayOfMonth: number;
}

export type OperatorId =
  | 'is' | 'is_not' | 'contains' | 'starts_with'
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'before' | 'after'
  | 'is_empty' | 'is_not_empty';

export interface SwitchCondition {
  /** Doubles as the output handle id. */
  id: string;
  /** TriggerVariable id. */
  field: string | null;
  op: OperatorId | null;
  value: string;
}

export interface SwitchConfig { conditions: SwitchCondition[] }

export interface EmailConfig {
  /** `user:<id>` or `field:<variable id>`. */
  to: string[];
  /** Other addresses as typed, comma-separated. */
  other: string;
  subject: string;
  body: string;
}

export interface DelayConfig { amount: number; unit: 'minutes' | 'hours' }

export interface SmsConfig {
  /** `user:<id>`. */
  to: string[];
  /** Other numbers as typed, comma-separated. */
  other: string;
  message: string;
}

export type WorkOrderPriority = 'low' | 'medium' | 'high' | 'critical';

export interface WorkOrderConfig {
  title: string;
  priority: WorkOrderPriority;
  /** User id; null leaves it in the maintenance queue. */
  assignee: string | null;
  description: string;
}

export type ReportPeriod = 'yesterday' | 'last_7_days' | 'last_month';

export interface ReportConfig {
  reportId: string | null;
  period: ReportPeriod;
  format: 'pdf' | 'xlsx';
  /** `user:<id>`. */
  to: string[];
}

interface NodeBase<T extends NodeType, C> { id: string; type: T; name: string; position: XY; config: C }

export type IoFormsNode = NodeBase<'ioForms', IoFormsConfig>;
export type SchedulerNode = NodeBase<'scheduler', SchedulerConfig>;
export type DeviceAlertNode = NodeBase<'deviceAlert', DeviceAlertConfig>;
export type SwitchNode = NodeBase<'switch', SwitchConfig>;
export type DelayNode = NodeBase<'delay', DelayConfig>;
export type EmailNode = NodeBase<'email', EmailConfig>;
export type SmsNode = NodeBase<'sms', SmsConfig>;
export type WorkOrderNode = NodeBase<'workOrder', WorkOrderConfig>;
export type ReportNode = NodeBase<'report', ReportConfig>;
export type WfNode = IoFormsNode | SchedulerNode | DeviceAlertNode | SwitchNode | DelayNode | EmailNode | SmsNode | WorkOrderNode | ReportNode;
export type TriggerNode = IoFormsNode | SchedulerNode | DeviceAlertNode;

export const DEFAULT_HANDLE = 'default';
export const OUT_HANDLE = 'out';

export interface WfEdge {
  id: string;
  source: string;
  /** `out`, `default`, or a Switch condition id. */
  sourceHandle: string;
  target: string;
}

export interface Graph { nodes: WfNode[]; edges: WfEdge[] }

/* ── Workflow ── */

export type WorkflowStatus = 'draft' | 'active' | 'paused';

export interface Workflow {
  id: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  /** The working draft (autosaved). */
  graph: Graph;
  /** What is Active/Paused. Null while Draft. */
  published: { graph: Graph; publishedAt: number } | null;
  createdAt: number;
  updatedAt: number;
}

/* ── Executions ── */

export type ExecutionSource = 'test' | 'schedule' | 'form' | 'device';
export type ExecutionStatus = 'running' | 'success' | 'failed';
export type NodeRunStatus = 'queued' | 'running' | 'success' | 'failed' | 'skipped' | 'not_run';

export interface NodeResult {
  nodeId: string;
  name: string;
  type: NodeType;
  status: NodeRunStatus;
  durationMs?: number;
  message?: string;
  /** Switch: the handle that ran and its readable label. */
  takenHandle?: string;
  takenLabel?: string;
  /** Config field the message is about (for "Open in editor"). */
  field?: string;
  input?: unknown;
  output?: unknown;
}

export interface Execution {
  id: string;
  workflowId: string;
  workflowName: string;
  source: ExecutionSource;
  status: ExecutionStatus;
  startedAt: number;
  durationMs?: number;
  triggerData: Record<string, unknown>;
  /** Every node of the graph at run time, in flow order. */
  nodes: NodeResult[];
  /** Node ids along the path that ran. */
  path: string[];
  failedNodeId?: string;
  summary: string;
}

/* ── Validation ── */

export interface Issue {
  /** Stable key. */
  id: string;
  severity: 'error' | 'warning';
  /** Undefined for workflow-level issues. */
  nodeId?: string;
  /** Config field path, e.g. `subject`, `other`, `conditions.<id>.value`. */
  field?: string;
  message: string;
}
