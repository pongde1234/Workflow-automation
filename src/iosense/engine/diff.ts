import type { Graph } from '../domain/types';

/** How a node differs from the published version: added since, or changed (its name, settings or where it leads). */
export type NodeChange = 'new' | 'edited';

export interface GraphChanges {
  byNode: Map<string, NodeChange>;
  /** Published nodes that no longer exist. */
  removed: number;
}

const outgoing = (g: Graph, id: string) => g.edges.filter((e) => e.source === id).map((e) => `${e.sourceHandle}>${e.target}`).sort().join('|');

/** What publishing would change, node by node. Moving a node around the canvas isn't a change. */
export function graphChanges(current: Graph, published: Graph): GraphChanges {
  const before = new Map(published.nodes.map((n) => [n.id, n]));
  const byNode = new Map<string, NodeChange>();
  for (const n of current.nodes) {
    const p = before.get(n.id);
    if (!p) byNode.set(n.id, 'new');
    else if (
      p.name !== n.name || JSON.stringify(p.config) !== JSON.stringify(n.config) || JSON.stringify(p.settings ?? {}) !== JSON.stringify(n.settings ?? {})
      || outgoing(current, n.id) !== outgoing(published, n.id)
    ) {
      byNode.set(n.id, 'edited');
    }
  }
  const now = new Set(current.nodes.map((n) => n.id));
  return { byNode, removed: published.nodes.filter((n) => !now.has(n.id)).length };
}

/** "2 edited · 1 new · 1 removed", or null when nothing changed. */
export function changesText(c: GraphChanges): string | null {
  const counts = { edited: 0, new: 0 };
  for (const v of c.byNode.values()) counts[v]++;
  const parts = [
    counts.edited && `${counts.edited} edited`,
    counts.new && `${counts.new} new`,
    c.removed && `${c.removed} removed`,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
