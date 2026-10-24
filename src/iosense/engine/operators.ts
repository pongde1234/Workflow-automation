import type { DataType, OperatorId, SwitchCondition, TriggerVariable } from '../domain/types';

export const OPERATORS: Record<OperatorId, { label: string; unary?: boolean }> = {
  is: { label: 'is' },
  is_not: { label: 'is not' },
  contains: { label: 'contains' },
  starts_with: { label: 'starts with' },
  eq: { label: '=' },
  neq: { label: '≠' },
  gt: { label: '>' },
  gte: { label: '≥' },
  lt: { label: '<' },
  lte: { label: '≤' },
  before: { label: 'is before' },
  after: { label: 'is after' },
  is_empty: { label: 'is empty', unary: true },
  is_not_empty: { label: 'is not empty', unary: true },
};

export const OPERATORS_BY_TYPE: Record<DataType, OperatorId[]> = {
  text: ['is', 'is_not', 'contains', 'starts_with', 'is_empty', 'is_not_empty'],
  choice: ['is', 'is_not', 'is_empty', 'is_not_empty'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty'],
  date: ['before', 'after', 'is_empty', 'is_not_empty'],
};

export const isUnary = (op: OperatorId | null) => !!op && OPERATORS[op].unary === true;

export function isBlank(v: unknown) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

/** Strict number parsing: "1,200" → 1200, "abc" → NaN, "" → NaN. */
export function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[ ,]/g, '');
  return s === '' ? NaN : Number(s);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Calendar day as YYYY-MM-DD (local time for timestamps). */
export function toDayKey(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(v);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const t = Date.parse(s);
  return Number.isFinite(t) ? toDayKey(t) : null;
}

export interface Evaluation { matched: boolean; note?: string }

/** One condition against one value. Blank values only ever match "is empty". */
export function evaluate(op: OperatorId, actual: unknown, expected: string, type: DataType, label: string): Evaluation {
  const blank = isBlank(actual);
  if (op === 'is_empty') return { matched: blank };
  if (op === 'is_not_empty') return { matched: !blank };
  if (blank) return { matched: false, note: `‘${label}’ was empty` };

  if (type === 'number') {
    const a = toNumber(actual);
    const b = toNumber(expected);
    if (!Number.isFinite(a)) return { matched: false, note: `‘${label}’ was ‘${String(actual)}’, not a number` };
    switch (op) {
      case 'eq': return { matched: a === b };
      case 'neq': return { matched: a !== b };
      case 'gt': return { matched: a > b };
      case 'gte': return { matched: a >= b };
      case 'lt': return { matched: a < b };
      case 'lte': return { matched: a <= b };
      default: return { matched: false };
    }
  }

  if (type === 'date') {
    const a = toDayKey(actual);
    const b = toDayKey(expected);
    if (!a || !b) return { matched: false, note: `‘${label}’ was not a date` };
    if (op === 'before') return { matched: a < b };
    if (op === 'after') return { matched: a > b };
    return { matched: false };
  }

  const a = String(actual).trim().toLowerCase();
  const b = expected.trim().toLowerCase();
  switch (op) {
    case 'is': return { matched: a === b };
    case 'is_not': return { matched: a !== b };
    case 'contains': return { matched: a.includes(b) };
    case 'starts_with': return { matched: a.startsWith(b) };
    default: return { matched: false };
  }
}

/** "Severity is Critical", "Temperature > 80", "Supervisor email is empty". */
export function conditionLabel(c: SwitchCondition, vars: TriggerVariable[]): string {
  const v = vars.find((x) => x.id === c.field);
  if (!v || !c.op) return 'New condition';
  const op = OPERATORS[c.op];
  if (op.unary) return `${v.label} ${op.label}`;
  return `${v.label} ${op.label} ${c.value.trim() || '…'}`;
}
