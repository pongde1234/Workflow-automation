import { CronExpressionParser } from 'cron-parser';
import cronstrue from 'cronstrue';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function scheduleToCron(config: Record<string, any>): string {
  const [hh, mm] = String(config.time || '09:00').split(':').map((n) => Number(n) || 0);
  switch (config.frequency) {
    case 'minutes':
      return `*/${Math.max(1, Math.min(59, Number(config.interval) || 15))} * * * *`;
    case 'hourly':
      return `${Math.min(59, Number(config.minute) || 0)} * * * *`;
    case 'weekly':
      return `${mm} ${hh} * * ${Number(config.weekday ?? 1)}`;
    case 'monthly':
      return `${mm} ${hh} ${Math.max(1, Math.min(28, Number(config.dayOfMonth) || 1))} * *`;
    case 'cron':
      return String(config.cron || '0 9 * * 1-5');
    case 'daily':
    default:
      return `${mm} ${hh} * * ${config.weekdaysOnly ? '1-5' : '*'}`;
  }
}

export function describeCron(expr: string): string {
  try {
    return cronstrue.toString(expr, { use24HourTimeFormat: false, verbose: false });
  } catch {
    return 'Invalid schedule';
  }
}

export function nextRuns(expr: string, count = 5, from = new Date(), tz?: string): Date[] {
  try {
    const it = CronExpressionParser.parse(expr, { currentDate: from, ...(tz ? { tz } : {}) });
    return Array.from({ length: count }, () => it.next().toDate());
  } catch {
    return [];
  }
}

export function isValidCron(expr: string) {
  try {
    CronExpressionParser.parse(expr);
    return expr.trim().split(/\s+/).length >= 5;
  } catch {
    return false;
  }
}

/** Most recent scheduled fire time at or before `now`, or null. */
export function lastDue(expr: string, now = new Date(), tz?: string): Date | null {
  try {
    const it = CronExpressionParser.parse(expr, { currentDate: now, ...(tz ? { tz } : {}) });
    return it.prev().toDate();
  } catch {
    return null;
  }
}
