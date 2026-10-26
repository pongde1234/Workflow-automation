/* Short, locale-aware dates and times for tables, lists and charts. */

const STAMP = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const DATE_TIME = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
const DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const DAY = 86_400_000;
const midnight = (ts: number) => new Date(ts).setHours(0, 0, 0, 0);

/** "24 Oct, 10:57 am": a run's start in a table cell. */
export const formatStamp = (ts: number) => STAMP.format(ts);
/** "26 Oct 2026, 2:33 pm": a moment that may be far back, on one line. */
export const formatDateTime = (ts: number) => DATE_TIME.format(ts);
/** "2:36 pm": a time under a day heading. */
export const formatTime = (ts: number) => TIME.format(ts);

/** "Today", "Yesterday", "Thursday 22 Oct" within the week, else "8 Oct 2026". */
export function dayTitle(ts: number, now: number): string {
  const days = Math.round((midnight(now) - midnight(ts)) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return WEEKDAY.format(ts);
  return DATE.format(ts);
}

/** Items (newest first) grouped under their day's heading, in the same order. */
export function groupByDay<T extends { startedAt: number }>(items: T[], now: number): { key: string; title: string; items: T[] }[] {
  const groups: { key: string; title: string; items: T[] }[] = [];
  for (const item of items) {
    const key = String(midnight(item.startedAt));
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, title: dayTitle(item.startedAt, now), items: [item] });
  }
  return groups;
}
