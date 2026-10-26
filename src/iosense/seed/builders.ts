import type {
  DelayConfig, DeviceAlertConfig, EmailConfig, ReportConfig, SchedulerConfig, SmsConfig, SwitchCondition, WfEdge, WfNode, WorkOrderConfig, XY,
} from '../domain/types';
import { OUT_HANDLE } from '../domain/types';
import { edgeId } from '../engine/graph';
import { defaultSchedulerConfig } from '../engine/schedule';

/* Graph builders shared by the sample workflows, the templates and the AI drafter. */

export const COL = 384;
/** Stacked nodes sit a row apart: a card is about 145 tall, so this leaves the same 48 gap as Tidy up. */
export const ROW = 192;
export const at = (col: number, y: number): XY => ({ x: col * COL, y });

export const form = (id: string, name: string, formId: string, p: XY): WfNode => ({ id, type: 'ioForms', name, position: p, config: { formId } });
export const schedule = (id: string, name: string, cfg: Partial<SchedulerConfig>, p: XY): WfNode =>
  ({ id, type: 'scheduler', name, position: p, config: { ...defaultSchedulerConfig(0), ...cfg } });
export const sw = (id: string, name: string, conditions: SwitchCondition[], p: XY): WfNode => ({ id, type: 'switch', name, position: p, config: { conditions } });
export const email = (id: string, name: string, cfg: Partial<EmailConfig>, p: XY): WfNode =>
  ({ id, type: 'email', name, position: p, config: { to: [], other: '', subject: '', body: '', ...cfg } });
export const device = (id: string, name: string, cfg: DeviceAlertConfig, p: XY): WfNode => ({ id, type: 'deviceAlert', name, position: p, config: cfg });
export const workOrder = (id: string, name: string, cfg: WorkOrderConfig, p: XY): WfNode => ({ id, type: 'workOrder', name, position: p, config: cfg });
export const sms = (id: string, name: string, cfg: SmsConfig, p: XY): WfNode => ({ id, type: 'sms', name, position: p, config: cfg });
export const report = (id: string, name: string, cfg: ReportConfig, p: XY): WfNode => ({ id, type: 'report', name, position: p, config: cfg });
export const delay = (id: string, name: string, cfg: DelayConfig, p: XY): WfNode => ({ id, type: 'delay', name, position: p, config: cfg });
export const cond = (id: string, field: string | null, op: SwitchCondition['op'], value = ''): SwitchCondition => ({ id, field, op, value });
export const link = (source: string, target: string, handle = OUT_HANDLE): WfEdge => ({ id: edgeId(source, handle), source, sourceHandle: handle, target });
