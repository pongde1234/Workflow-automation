import type { Execution, ExecutionSource } from '../domain/types';

/* Figures for the Overview page and the workflow list, from the run history. Pure: `now` is passed in. */

export const DAY = 86_400_000;

/** Midnight (local) at the start of the day `ts` falls in. */
export const startOfDay = (ts: number) => new Date(ts).setHours(0, 0, 0, 0);

/** Finished runs only: a run still in progress has no outcome to count yet. */
const finished = (e: Execution) => e.status !== 'running';

export interface WindowStats {
  runs: number;
  failed: number;
  /** Share of runs that succeeded, 0–100; null with no runs. */
  successRate: number | null;
}

/** Runs that started in [from, to). */
export function windowStats(executions: Execution[], from: number, to: number): WindowStats {
  const runs = executions.filter((e) => finished(e) && e.startedAt >= from && e.startedAt < to);
  const failed = runs.filter((e) => e.status === 'failed').length;
  return { runs: runs.length, failed, successRate: runs.length ? ((runs.length - failed) / runs.length) * 100 : null };
}

/** This week (the last 7 days up to now) and the 7 days before it. */
export function weekOverWeek(executions: Execution[], now: number) {
  return { current: windowStats(executions, now - 7 * DAY, now + 1), previous: windowStats(executions, now - 14 * DAY, now - 7 * DAY) };
}

/** Per-day counts for `days` days ending today (oldest first). */
export function dailyCounts(executions: Execution[], now: number, days: number, filter: (e: Execution) => boolean = () => true): number[] {
  const first = startOfDay(now) - (days - 1) * DAY;
  const counts = new Array<number>(days).fill(0);
  for (const e of executions) {
    if (!finished(e) || !filter(e) || e.startedAt < first || e.startedAt > now) continue;
    const i = Math.floor((startOfDay(e.startedAt) - first) / DAY);
    if (i >= 0 && i < days) counts[i]++;
  }
  return counts;
}

/** Per-day success rate (0–100) for `days` days ending today; null on a day with no runs (a gap, not a zero). */
export function dailySuccessRates(executions: Execution[], now: number, days: number): (number | null)[] {
  const all = dailyCounts(executions, now, days);
  const failed = dailyCounts(executions, now, days, (e) => e.status === 'failed');
  return all.map((n, i) => (n ? Math.round(((n - failed[i]) / n) * 1000) / 10 : null));
}

/** Each workflow's runs per day for `days` days ending today. */
export function dailyCountsByWorkflow(executions: Execution[], now: number, days: number): Map<string, number[]> {
  const byWorkflow = new Map<string, Execution[]>();
  for (const e of executions) {
    const list = byWorkflow.get(e.workflowId);
    if (list) list.push(e);
    else byWorkflow.set(e.workflowId, [e]);
  }
  return new Map([...byWorkflow].map(([id, list]) => [id, dailyCounts(list, now, days)]));
}

/** Per-bucket succeeded and failed counts for chart buckets ({ start, end } inclusive). */
export function outcomesPerBucket(executions: Execution[], buckets: { start: Date; end: Date }[]) {
  const succeeded = buckets.map(() => 0);
  const failed = buckets.map(() => 0);
  for (const e of executions) {
    if (!finished(e)) continue;
    const i = buckets.findIndex((b) => e.startedAt >= b.start.getTime() && e.startedAt <= b.end.getTime());
    if (i < 0) continue;
    if (e.status === 'failed') failed[i]++;
    else succeeded[i]++;
  }
  return { succeeded, failed };
}

/** How many runs each kind of trigger started since `from`. */
export function runsBySource(executions: Execution[], from: number): Record<ExecutionSource, number> {
  const out: Record<ExecutionSource, number> = { form: 0, schedule: 0, device: 0, test: 0 };
  for (const e of executions) if (finished(e) && e.startedAt >= from) out[e.source]++;
  return out;
}

/** Failed runs since `from`, newest first. */
export const failuresSince = (executions: Execution[], from: number) =>
  executions.filter((e) => e.status === 'failed' && e.startedAt >= from).sort((a, b) => b.startedAt - a.startedAt);

/** A signed whole-number percentage change ("+12%", "−8%", "0%"), or null when there's nothing to compare with. */
export function percentChange(current: number, previous: number): string | null {
  if (previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return pct > 0 ? `+${pct}%` : pct < 0 ? `−${Math.abs(pct)}%` : '0%';
}
