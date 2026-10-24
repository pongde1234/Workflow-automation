import type { DelayConfig, DeviceAlertConfig, IoDevice, ReportPeriod, WorkOrderPriority } from '../domain/types';
import { toNumber } from './operators';
import { formatDate, toYmd } from './schedule';

/* Words for the newer nodes' settings, shared by summaries, forms and the simulation. */

export const PRIORITY_LABEL: Record<WorkOrderPriority, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
export const PERIOD_LABEL: Record<ReportPeriod, string> = { yesterday: 'Yesterday', last_7_days: 'Last 7 days', last_month: 'Last month' };
export const FORMAT_LABEL = { pdf: 'PDF', xlsx: 'Excel' } as const;

/** "15 minutes", "1 hour". */
export function delayLabel(c: DelayConfig): string {
  const one = c.amount === 1;
  return `${c.amount} ${c.unit === 'hours' ? (one ? 'hour' : 'hours') : (one ? 'minute' : 'minutes')}`;
}

/** "85 °C", or just "0.92" for a reading without a unit. */
export const withUnit = (n: number | string, unit: string) => (unit ? `${n} ${unit}` : String(n));

export function crossesLimit(op: DeviceAlertConfig['op'], reading: number, limit: number): boolean {
  return op === 'above' ? reading > limit : reading < limit;
}

/** The device and reading a Device alert watches, or undefined while not chosen. */
export function watched(c: DeviceAlertConfig, devices: IoDevice[]) {
  const device = devices.find((d) => d.id === c.deviceId);
  const parameter = device?.parameters.find((p) => p.key === c.parameter);
  return device && parameter ? { device, parameter } : undefined;
}

/** "Compressor 3 · Temperature above 85 °C" (how long it must last is in the drawer). */
export function deviceAlertText(c: DeviceAlertConfig, devices: IoDevice[]): string | null {
  const w = watched(c, devices);
  if (!w) return null;
  const limit = Number.isFinite(toNumber(c.limit)) ? withUnit(c.limit.trim(), w.parameter.unit) : '…';
  return `${w.device.name} · ${w.parameter.label} ${c.op} ${limit}`;
}

const DAY = 86_400_000;

/** The dates a report covers, ending the day before `now`. */
export function periodText(period: ReportPeriod, now: number): { text: string; end: Date } {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const end = new Date(today.getTime() - DAY);
  if (period === 'yesterday') return { text: formatDate(toYmd(end)), end };
  if (period === 'last_7_days') return { text: `${formatDate(toYmd(new Date(today.getTime() - 7 * DAY)))} to ${formatDate(toYmd(end))}`, end };
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return { text: lastMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), end: new Date(today.getFullYear(), today.getMonth(), 0) };
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
