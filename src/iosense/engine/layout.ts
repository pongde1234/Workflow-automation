import type { Graph, WfNode, XY } from '../domain/types';
import { edgeFrom, edgeId, getNode, getTrigger, outputHandles, reachableFrom } from './graph';

/** Canvas grid step and node width, in world units (match --spacing-24 and 4 × --spacing-64 + --spacing-32). */
export const GRID = 24;
export const NODE_WIDTH = 288;
const GAP_X = 96;
const GAP_Y = 24;

export interface Size { w: number; h: number }
export type Sizes = Record<string, Size>;

/** Size before the canvas has measured a node. */
export function estimateSize(n: WfNode): Size {
  const rows = n.type === 'switch' ? n.config.conditions.length + 1 : 0;
  return { w: NODE_WIDTH, h: 144 + rows * 34 };
}

export const sizeOf = (n: WfNode, sizes: Sizes = {}) => sizes[n.id] ?? estimateSize(n);
export const snap = (v: number) => Math.round(v / GRID) * GRID;

function overlaps(g: Graph, sizes: Sizes, at: XY, size: Size, ignore?: string) {
  return g.nodes.some((n) => {
    if (n.id === ignore) return false;
    const s = sizeOf(n, sizes);
    return at.x < n.position.x + s.w + GAP_Y && at.x + size.w + GAP_Y > n.position.x
      && at.y < n.position.y + s.h + GAP_Y && at.y + size.h + GAP_Y > n.position.y;
  });
}

/** Pushes a position down the grid until it overlaps nothing. */
export function freeSpot(g: Graph, sizes: Sizes, at: XY, size: Size, ignore?: string): XY {
  const p = { x: snap(at.x), y: snap(at.y) };
  for (let i = 0; i < 200 && overlaps(g, sizes, p, size, ignore); i++) p.y += GRID;
  return p;
}

/** Where a new node goes when added after `sourceId`'s `handle`. */
export function placeAfter(g: Graph, sizes: Sizes, sourceId: string, handle: string, size: Size): XY {
  const src = getNode(g, sourceId);
  if (!src) return { x: 0, y: 0 };
  const s = sizeOf(src, sizes);
  const index = Math.max(0, outputHandles(src).indexOf(handle));
  const at = { x: src.position.x + s.w + GAP_X, y: src.position.y + index * (size.h + GAP_Y) };
  return freeSpot(g, sizes, at, size);
}

/** Bounding box of all nodes, or null for an empty graph. */
export function bounds(g: Graph, sizes: Sizes): { x: number; y: number; w: number; h: number } | null {
  if (g.nodes.length === 0) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const n of g.nodes) {
    const s = sizeOf(n, sizes);
    x1 = Math.min(x1, n.position.x);
    y1 = Math.min(y1, n.position.y);
    x2 = Math.max(x2, n.position.x + s.w);
    y2 = Math.max(y2, n.position.y + s.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * Puts `node` on an existing connection A → B: A now leads to `node`, and the
 * node's first output leads to B. If there isn't a free column between them,
 * B and everything after it (to its right) slides one column right, so
 * nothing overlaps. One graph change, so one undo step.
 */
export function insertOnEdge(g: Graph, sizes: Sizes, id: string, node: WfNode): Graph {
  const edge = g.edges.find((e) => e.id === id);
  const a = getNode(g, edge?.source);
  const b = getNode(g, edge?.target);
  if (!edge || !a || !b) return g;
  const size = sizeOf(node, sizes);
  const left = a.position.x + sizeOf(a, sizes).w;
  const room = b.position.x - left;
  let nodes = g.nodes;
  let position: XY;
  if (room >= size.w + GAP_X * 2) {
    position = freeSpot(g, sizes, { x: left + (room - size.w) / 2, y: b.position.y }, size);
  } else {
    position = { x: b.position.x, y: b.position.y };
    const after = reachableFrom(g, b.id);
    const step = NODE_WIDTH + GAP_X;
    nodes = nodes.map((n) => (after.has(n.id) && n.position.x >= b.position.x ? { ...n, position: { ...n.position, x: n.position.x + step } } : n));
  }
  const placed = { ...node, position } as WfNode;
  const out = outputHandles(placed)[0];
  return {
    nodes: [...nodes, placed],
    edges: [
      ...g.edges.filter((e) => e.id !== edge.id),
      { id: edgeId(a.id, edge.sourceHandle), source: a.id, sourceHandle: edge.sourceHandle, target: placed.id },
      { id: edgeId(placed.id, out), source: placed.id, sourceHandle: out, target: b.id },
    ],
  };
}

/** Room between stacked nodes when tidying, and between separate groups of nodes. */
const TIDY_GAP = 48;
/** The height a free Switch output's "+" needs when tidying (a small canvas button). */
const FREE_OUTPUT = 24;

/**
 * Tidy up: lays the flow out left to right again. Each node sits one column
 * after the furthest node that leads to it, so no link runs backwards. Each
 * branch gets its own band below the one before (a Switch's in condition
 * order), and a node sits level with the middle of what follows it. Nodes the
 * trigger doesn't reach go underneath, laid out the same way. The trigger
 * stays where it was, so the canvas doesn't jump. One graph change: one undo.
 */
export function tidyLayout(g: Graph, sizes: Sizes): Graph {
  const height = (id: string) => sizeOf(getNode(g, id)!, sizes).h;
  const next = (id: string) => {
    const n = getNode(g, id);
    return n ? outputHandles(n).map((h) => edgeFrom(g, id, h)?.target).filter((t): t is string => !!t && !!getNode(g, t)) : [];
  };
  const trigger = getTrigger(g);
  const fed = new Set(g.edges.map((e) => e.target));
  const roots = [...(trigger ? [trigger.id] : []), ...g.nodes.filter((n) => n.id !== trigger?.id && !fed.has(n.id)).map((n) => n.id)];

  // Columns: the longest path from a root (links never loop).
  const col = new Map<string, number>();
  const toColumn = (id: string, c: number) => {
    if ((col.get(id) ?? -1) >= c) return;
    col.set(id, c);
    for (const t of next(id)) toColumn(t, c + 1);
  };
  for (const r of roots) toColumn(r, r === trigger?.id ? 0 : 1);

  // Rows: each node belongs to the first node that reaches it; leaves stack down the page, a node centres on its own.
  const kids = new Map<string, string[]>();
  const owned = new Set<string>(roots);
  const own = (id: string) => {
    const mine = next(id).filter((t) => !owned.has(t));
    mine.forEach((t) => owned.add(t));
    kids.set(id, mine);
    mine.forEach(own);
  };
  roots.forEach(own);
  const top = new Map<string, number>();
  let cursor = 0;
  const place = (id: string) => {
    const n = getNode(g, id)!;
    const mine = kids.get(id) ?? [];
    if (mine.length === 0) {
      top.set(id, cursor);
      cursor += height(id) + TIDY_GAP;
      return;
    }
    // A Switch's outputs go in condition order; an output with nothing on it keeps a row of its own, so its "+"
    // never lands on a neighbouring link's "+".
    const middles: number[] = [];
    const handles = n.type === 'switch' ? outputHandles(n) : [];
    if (handles.length > 0) {
      for (const h of handles) {
        const target = edgeFrom(g, id, h)?.target;
        if (target && mine.includes(target)) {
          place(target);
          middles.push(top.get(target)! + height(target) / 2);
        } else if (!target) {
          middles.push(cursor + FREE_OUTPUT / 2);
          cursor += FREE_OUTPUT + TIDY_GAP;
        }
      }
    } else {
      for (const k of mine) {
        place(k);
        middles.push(top.get(k)! + height(k) / 2);
      }
    }
    top.set(id, (middles[0] + middles[middles.length - 1]) / 2 - height(id) / 2);
  };
  for (const r of roots) {
    place(r);
    cursor += TIDY_GAP;
  }

  // A tall node centred on short ones can reach into the band above: push down whatever would overlap in its column.
  const columns = new Map<number, string[]>();
  for (const [id, c] of col) if (top.has(id)) columns.set(c, [...(columns.get(c) ?? []), id]);
  for (const ids of columns.values()) {
    ids.sort((a, b) => top.get(a)! - top.get(b)!);
    let bottom = -Infinity;
    for (const id of ids) {
      const y = Math.max(top.get(id)!, bottom + TIDY_GAP);
      top.set(id, y);
      bottom = y + height(id);
    }
  }

  const anchor = getNode(g, roots[0]);
  if (!anchor || !top.has(anchor.id)) return g;
  const dx = snap(anchor.position.x - col.get(anchor.id)! * (NODE_WIDTH + GAP_X));
  const dy = snap(anchor.position.y - top.get(anchor.id)!);
  return {
    ...g,
    nodes: g.nodes.map((n) => (top.has(n.id) && col.has(n.id)
      ? { ...n, position: { x: col.get(n.id)! * (NODE_WIDTH + GAP_X) + dx, y: Math.round(top.get(n.id)!) + dy } }
      : n)),
  };
}
