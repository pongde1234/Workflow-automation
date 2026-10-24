import { nextRuns } from '@/catalog/schedule';
import type { MinuteInterval, SchedulerConfig } from '../domain/types';
import { WEEKDAYS } from '../domain/variables';

export const MINUTE_INTERVALS: MinuteInterval[] = [5, 10, 15, 20, 30];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Every quarter hour of the day, as HH:mm. */
export const TIME_OPTIONS: string[] = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);

export const isValidTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
export const isValidDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d));

/** "09:00" → "9:00 AM". */
export function formatTime(hhmm: string): string {
  if (!isValidTime(hhmm)) return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

export function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "2026-10-24" → "Sat, 24 Oct 2026". */
export function formatDate(ymd: string): string {
  if (!isValidDate(ymd)) return ymd;
  const [y, mo, d] = ymd.split('-').map(Number);
  const date = new Date(y, mo - 1, d);
  return `${WEEKDAYS[date.getDay()].slice(0, 3)}, ${d} ${MONTHS[mo - 1]} ${y}`;
}

/** "Mon, 27 Oct 2026 at 9:00 AM" for a timestamp. */
export function formatRunTime(ts: number): string {
  const d = new Date(ts);
  return `${formatDate(toYmd(d))} at ${formatTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`)}`;
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function listDays(days: number[]) {
  const names = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d)).map((d) => WEEKDAYS[d]);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function toCron(c: SchedulerConfig): string | null {
  if (c.mode === 'once') return null;
  const [hh, mm] = (isValidTime(c.time) ? c.time : '09:00').split(':').map(Number);
  switch (c.frequency) {
    case 'minutes': return `*/${c.everyMinutes} * * * *`;
    case 'hourly': return `${Math.min(59, Math.max(0, c.minute))} * * * *`;
    case 'daily': return `${mm} ${hh} * * ${c.weekdaysOnly ? '1-5' : '*'}`;
    case 'weekly': return `${mm} ${hh} * * ${[...c.days].sort((a, b) => a - b).join(',') || '1'}`;
    case 'monthly': return `${mm} ${hh} ${Math.min(28, Math.max(1, c.dayOfMonth))} * *`;
  }
}

/** Local timestamp of a Once schedule, or null when incomplete. */
export function onceAt(c: SchedulerConfig): number | null {
  if (!isValidDate(c.date) || !isValidTime(c.time)) return null;
  const [y, mo, d] = c.date.split('-').map(Number);
  const [h, m] = c.time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, m).getTime();
}

/** Plain-English schedule: "Weekdays at 9:00 AM". */
export function summarizeSchedule(c: SchedulerConfig): string {
  const at = formatTime(c.time);
  if (c.mode === 'once') {
    return onceAt(c) === null ? 'Once, date and time not set' : `Once on ${formatDate(c.date)} at ${at}`;
  }
  switch (c.frequency) {
    case 'minutes': return `Every ${c.everyMinutes} minutes`;
    case 'hourly': return c.minute === 0 ? 'Every hour, on the hour' : `Every hour at ${c.minute} minutes past`;
    case 'daily': return c.weekdaysOnly ? `Weekdays at ${at}` : `Every day at ${at}`;
    case 'weekly': {
      const days = new Set(c.days);
      if (days.size === 0) return 'Weekly, no days chosen';
      if (days.size === 7) return `Every day at ${at}`;
      if (days.size === 5 && [1, 2, 3, 4, 5].every((d) => days.has(d))) return `Weekdays at ${at}`;
      if (days.size === 2 && days.has(0) && days.has(6)) return `Weekends at ${at}`;
      return `Every ${listDays(c.days)} at ${at}`;
    }
    case 'monthly': return `On the ${ordinal(c.dayOfMonth)} of every month at ${at}`;
  }
}

/** Next time this schedule would run after `now`, or null. */
export function nextRun(c: SchedulerConfig, now: number): number | null {
  if (c.mode === 'once') {
    const t = onceAt(c);
    return t !== null && t > now ? t : null;
  }
  if (c.frequency === 'weekly' && c.days.length === 0) return null;
  const cron = toCron(c);
  const next = cron ? nextRuns(cron, 1, new Date(now))[0] : undefined;
  return next ? next.getTime() : null;
}

export function defaultSchedulerConfig(now = Date.now()): SchedulerConfig {
  return {
    mode: 'recurring',
    date: toYmd(new Date(now + 86_400_000)),
    time: '09:00',
    frequency: 'daily',
    everyMinutes: 15,
    minute: 0,
    weekdaysOnly: true,
    days: [1],
    dayOfMonth: 1,
  };
}
