import type { Directory, TriggerVariable, WfNode } from '../domain/types';
import { conditionLabel } from '../engine/operators';
import { summarizeSchedule } from '../engine/schedule';
import { parseAddresses } from '../engine/email';
import { FORMAT_LABEL, PRIORITY_LABEL, delayLabel, deviceAlertText } from '../engine/nodeText';

export interface SummaryContext extends Directory { vars: TriggerVariable[] }

/** Readable names for picked people and form fields, then typed addresses or numbers. */
export function recipientNames(to: string[], other: string, ctx: SummaryContext): string[] {
  const names = to.map((ref) => {
    if (ref.startsWith('user:')) return ctx.users.find((u) => `user:${u.id}` === ref)?.name;
    return ctx.vars.find((v) => `field:${v.id}` === ref)?.label;
  }).filter((n): n is string => !!n);
  return [...names, ...parseAddresses(other)];
}

/**
 * A card's one line, as plain text. Email and SMS say only who they go to: their subject or message, with its
 * inserted values, is in the drawer (on the card it was clutter).
 */
export function cardSummary(node: WfNode, ctx: SummaryContext): string {
  if (node.type !== 'email' && node.type !== 'sms') return nodeSummary(node, ctx);
  const names = recipientNames(node.config.to, node.config.other, ctx);
  return names.length ? `To ${names.join(', ')}` : 'No recipients yet';
}

/** "To Arjun Rao +1", or the fallback when nobody is chosen yet. */
function toLine(names: string[]) {
  return names.length ? `To ${names[0]}${names.length > 1 ? ` +${names.length - 1}` : ''}` : 'No recipients yet';
}

/** The one line a node card shows about its setup. */
export function nodeSummary(node: WfNode, ctx: SummaryContext): string {
  switch (node.type) {
    case 'ioForms': {
      const form = ctx.forms.find((f) => f.id === node.config.formId);
      return form ? `Form: ${form.name}` : 'Choose a form';
    }
    case 'scheduler': return summarizeSchedule(node.config);
    case 'deviceAlert': return deviceAlertText(node.config, ctx.devices) ?? 'Choose a device and reading';
    case 'switch': return `${node.config.conditions.length} ${node.config.conditions.length === 1 ? 'condition' : 'conditions'} and Default`;
    case 'delay': return `Wait ${delayLabel(node.config)}`;
    case 'email': {
      const to = toLine(recipientNames(node.config.to, node.config.other, ctx));
      return node.config.subject.trim() ? `${to} · ${node.config.subject.trim()}` : to;
    }
    case 'sms': {
      const to = toLine(recipientNames(node.config.to, node.config.other, ctx));
      return node.config.message.trim() ? `${to} · ${node.config.message.trim()}` : to;
    }
    case 'workOrder': {
      const who = ctx.users.find((u) => u.id === node.config.assignee)?.name ?? 'Maintenance queue';
      return `${PRIORITY_LABEL[node.config.priority]} priority · ${who}`;
    }
    case 'report': {
      const report = ctx.reports.find((r) => r.id === node.config.reportId);
      if (!report) return 'Choose a report';
      return `${report.name} · ${FORMAT_LABEL[node.config.format]} · ${toLine(recipientNames(node.config.to, '', ctx))}`;
    }
  }
}

/** Switch output rows, in order, ending with Default. */
export function switchRows(node: Extract<WfNode, { type: 'switch' }>, vars: TriggerVariable[]): { handle: string; label: string }[] {
  return [...node.config.conditions.map((c) => ({ handle: c.id, label: conditionLabel(c, vars) })), { handle: 'default', label: 'Default' }];
}
