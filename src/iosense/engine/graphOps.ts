import type { Graph, SwitchCondition, WfNode, XY } from '../domain/types';
import { canConnect, edgeId, normalizeEdges } from './graph';

/* Pure, immutable graph edits. Untouched nodes keep their identity. */

export const addNode = (g: Graph, node: WfNode): Graph => ({ ...g, nodes: [...g.nodes, node] });

export function updateNode<N extends WfNode>(g: Graph, id: string, fn: (n: N) => N): Graph {
  return { ...g, nodes: g.nodes.map((n) => (n.id === id ? fn(n as N) : n)) };
}

export const renameNode = (g: Graph, id: string, name: string) => updateNode(g, id, (n) => ({ ...n, name }));

export function updateConfig<N extends WfNode>(g: Graph, id: string, patch: Partial<N['config']>): Graph {
  return updateNode<N>(g, id, (n) => ({ ...n, config: { ...n.config, ...patch } }) as N);
}

export const moveNode = (g: Graph, id: string, position: XY) => updateNode(g, id, (n) => ({ ...n, position }));

export function removeNode(g: Graph, id: string): Graph {
  return { nodes: g.nodes.filter((n) => n.id !== id), edges: g.edges.filter((e) => e.source !== id && e.target !== id) };
}

/** Connects, replacing whatever that output was connected to. Returns the graph unchanged when refused. */
export function connect(g: Graph, source: string, handle: string, target: string): Graph {
  const check = canConnect(g, source, handle, target);
  if (!check.ok) return g;
  const edges = g.edges.filter((e) => e.id !== check.replaces);
  return { ...g, edges: [...edges, { id: edgeId(source, handle), source, sourceHandle: handle, target }] };
}

export const disconnect = (g: Graph, id: string): Graph => ({ ...g, edges: g.edges.filter((e) => e.id !== id) });

/* ── Switch conditions ── */

function withConditions(g: Graph, switchId: string, fn: (cs: SwitchCondition[]) => SwitchCondition[]): Graph {
  const next = updateNode(g, switchId, (n) => (n.type === 'switch' ? { ...n, config: { conditions: fn(n.config.conditions) } } : n));
  return { ...next, edges: normalizeEdges(next) };
}

export const addCondition = (g: Graph, switchId: string, id: string) =>
  withConditions(g, switchId, (cs) => [...cs, { id, field: null, op: null, value: '' }]);

export const updateCondition = (g: Graph, switchId: string, id: string, patch: Partial<SwitchCondition>) =>
  withConditions(g, switchId, (cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

export const removeCondition = (g: Graph, switchId: string, id: string) =>
  withConditions(g, switchId, (cs) => cs.filter((c) => c.id !== id));

export function moveCondition(g: Graph, switchId: string, id: string, delta: -1 | 1): Graph {
  return withConditions(g, switchId, (cs) => {
    const i = cs.findIndex((c) => c.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= cs.length) return cs;
    const next = cs.slice();
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
}
