/**
 * The {{ }} template language.
 *
 *   {{s_ab12.body.email}}        a field from an earlier step's output (stable step id)
 *   {{s_ab12.items[0].name}}     array index
 *   {{$vars.API_URL}}            workspace variable
 *   {{$secrets.TOKEN}}           secret
 *   {{$now}} {{$today}}          ISO timestamp / date
 *   {{$workflow.name}} {{$run.id}}
 *   {{$item.price}} {{$index}}   inside a Loop
 *
 * A value that is exactly one token keeps its type (number, object, array).
 * Anything else interpolates to a string; objects are JSON-encoded.
 */

export const TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

export type Scope = Record<string, unknown>;

export function parsePath(path: string): (string | number)[] {
  const out: (string | number)[] = [];
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path))) {
    if (m[1] !== undefined) out.push(/^\d+$/.test(m[1]) ? Number(m[1]) : m[1]);
    else out.push(Number(m[2]));
  }
  return out;
}

export function getPath(root: unknown, path: string | (string | number)[]): unknown {
  const parts = typeof path === 'string' ? parsePath(path) : path;
  let cur: any = root;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (typeof cur === 'string' && (cur.startsWith('{') || cur.startsWith('['))) {
      try { cur = JSON.parse(cur); } catch { return undefined; }
    }
    cur = cur[p as any];
  }
  return cur;
}

export function stringify(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  try { return JSON.stringify(v); } catch { return String(v); }
}

export interface ResolveResult {
  value: unknown;
  missing: string[];
}

export function resolveTemplate(input: string, scope: Scope): ResolveResult {
  const missing: string[] = [];
  const lookup = (expr: string) => {
    const v = getPath(scope, expr);
    if (v === undefined) missing.push(expr);
    return v;
  };
  const trimmed = input.trim();
  const single = trimmed.match(/^\{\{\s*([^{}]+?)\s*\}\}$/);
  if (single) return { value: lookup(single[1]), missing };
  const value = input.replace(TOKEN_RE, (_, expr: string) => stringify(lookup(expr)));
  return { value, missing };
}

/** Deep-resolve every string inside a config object. */
export function resolveDeep(value: unknown, scope: Scope, missing: string[] = []): unknown {
  if (typeof value === 'string') {
    if (!value.includes('{{')) return value;
    const r = resolveTemplate(value, scope);
    missing.push(...r.missing);
    return r.value;
  }
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, scope, missing));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveDeep(v, scope, missing);
    return out;
  }
  return value;
}

/** Every token expression in a string / nested config. */
export function extractTokens(value: unknown, acc: string[] = []): string[] {
  if (typeof value === 'string') {
    for (const m of value.matchAll(TOKEN_RE)) acc.push(m[1].trim());
  } else if (Array.isArray(value)) {
    value.forEach((v) => extractTokens(v, acc));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((v) => extractTokens(v, acc));
  }
  return acc;
}

/** Step ids referenced by a config (ignores $helpers). */
export function referencedStepIds(value: unknown): string[] {
  const ids = new Set<string>();
  for (const t of extractTokens(value)) {
    const head = parsePath(t)[0];
    if (typeof head === 'string' && !head.startsWith('$')) ids.add(head);
  }
  return [...ids];
}

export interface FlatField {
  path: string;
  label: string;
  preview: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
}

/** Flatten a sample output into pickable leaf paths for the data mapper. */
export function flattenSample(sample: unknown, maxDepth = 4, maxFields = 80): FlatField[] {
  const out: FlatField[] = [];
  const walk = (v: unknown, path: string, depth: number) => {
    if (out.length >= maxFields) return;
    const type: FlatField['type'] =
      v === null || v === undefined ? 'null' : Array.isArray(v) ? 'array' : (typeof v as any) === 'object' ? 'object' : (typeof v as any);
    if ((type === 'object' || type === 'array') && depth < maxDepth && v) {
      if (path) out.push({ path, label: humanize(path), preview: type === 'array' ? `${(v as unknown[]).length} items` : '{…}', type });
      const entries = Array.isArray(v) ? v.slice(0, 3).map((x, i) => [`[${i}]`, x] as const) : Object.entries(v as object);
      for (const [k, child] of entries) {
        const next = k.startsWith('[') ? `${path}${k}` : path ? `${path}.${k}` : k;
        walk(child, next, depth + 1);
      }
      return;
    }
    if (!path) return;
    const s = stringify(v);
    out.push({ path, label: humanize(path), preview: s.length > 60 ? s.slice(0, 57) + '…' : s, type });
  };
  walk(sample, '', 0);
  return out;
}

export function humanize(path: string): string {
  const last = String(parsePath(path).filter((p) => typeof p === 'string').pop() ?? path);
  return last
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (c) => c.toUpperCase());
}
