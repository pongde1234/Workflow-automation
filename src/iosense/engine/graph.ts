import { DEFAULT_HANDLE, OUT_HANDLE, type Graph, type TriggerVariable, type WfEdge, type WfNode } from '../domain/types';
import { hasInput, isTriggerType } from '../domain/nodeTypes';
import { conditionLabel } from './operators';

export const getTriggers = (g: Graph) => g.nodes.filter((n) => isTriggerType(n.type));
export const getTrigger = (g: Graph): WfNode | undefined => getTriggers(g)[0];
export const getNode = (g: Graph, id: string | null | undefined) => (id ? g.nodes.find((n) => n.id === id) : undefined);

/** Output handles in display order. */
export function outputHandles(n: WfNode): string[] {
  if (n.type === 'switch') return [...n.config.conditions.map((c) => c.id), DEFAULT_HANDLE];
  return [OUT_HANDLE];
}

export function handleLabel(n: WfNode, handle: string, vars: TriggerVariable[]): string {
  if (n.type !== 'switch') return n.name;
  if (handle === DEFAULT_HANDLE) return 'Default';
  const c = n.config.conditions.find((x) => x.id === handle);
  return c ? conditionLabel(c, vars) : 'Condition';
}

export const edgeFrom = (g: Graph, nodeId: string, handle: string) => g.edges.find((e) => e.source === nodeId && e.sourceHandle === handle);
export const incoming = (g: Graph, nodeId: string) => g.edges.filter((e) => e.target === nodeId);
export const outgoing = (g: Graph, nodeId: string) => g.edges.filter((e) => e.source === nodeId);

export function reachableFrom(g: Graph, startId: string): Set<string> {
  const seen = new Set<string>([startId]);
  const stack = [startId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const e of outgoing(g, id)) {
      if (!seen.has(e.target)) { seen.add(e.target); stack.push(e.target); }
    }
  }
  return seen;
}

/** Nodes reachable from the trigger (empty when there is no trigger). */
export function reachable(g: Graph): Set<string> {
  const t = getTrigger(g);
  return t ? reachableFrom(g, t.id) : new Set();
}

export const wouldCreateCycle = (g: Graph, source: string, target: string) => source === target || reachableFrom(g, target).has(source);

export type ConnectCheck = { ok: true; replaces?: string } | { ok: false; reason: string };

export function canConnect(g: Graph, source: string, handle: string, target: string): ConnectCheck {
  const from = getNode(g, source);
  const to = getNode(g, target);
  if (!from || !to) return { ok: false, reason: 'That node no longer exists.' };
  if (!outputHandles(from).includes(handle)) return { ok: false, reason: 'That output no longer exists.' };
  if (source === target) return { ok: false, reason: 'A node can’t connect to itself.' };
  if (!hasInput(to)) return { ok: false, reason: 'Triggers start the workflow and can’t receive connections.' };
  if (wouldCreateCycle(g, source, target)) return { ok: false, reason: 'That would create a loop.' };
  const existing = edgeFrom(g, source, handle);
  if (existing?.target === target) return { ok: false, reason: 'These nodes are already connected.' };
  return existing ? { ok: true, replaces: existing.id } : { ok: true };
}

export const edgeId = (source: string, handle: string) => `e_${source}_${handle}`;

/**
 * Trigger first, then depth-first along outputs in handle order; nodes that
 * aren't connected come last, top-to-bottom. Used for numbering, Tab order
 * and the screen-reader outline.
 */
export function flowOrder(g: Graph): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    order.push(id);
    const n = getNode(g, id);
    if (!n) return;
    for (const h of outputHandles(n)) {
      const e = edgeFrom(g, id, h);
      if (e) visit(e.target);
    }
  };
  for (const t of getTriggers(g)) visit(t.id);
  const rest = g.nodes.filter((n) => !seen.has(n.id)).sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  for (const n of rest) visit(n.id);
  return order;
}

/** Drops edges whose ends or handles no longer exist. */
export function normalizeEdges(g: Graph): WfEdge[] {
  return g.edges.filter((e) => {
    const s = getNode(g, e.source);
    return !!s && !!getNode(g, e.target) && outputHandles(s).includes(e.sourceHandle);
  });
}
