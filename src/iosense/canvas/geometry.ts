import type { XY } from '../domain/types';
import type { Viewport } from '../store/sessionStore';

/* Pure canvas maths. World units are CSS px at 100% zoom. */

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 1.5;
/** Fit never shrinks below this, so 14px titles stay readable (≥ 11px). */
export const FIT_FLOOR = 0.8;
export const ZOOM_STEP = 1.2;

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export const toWorld = (v: Viewport, p: XY): XY => ({ x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom });

/** Zoom to `zoom` keeping the screen point `at` fixed. */
export function zoomAround(v: Viewport, at: XY, zoom: number): Viewport {
  const z = clampZoom(zoom);
  const w = toWorld(v, at);
  return { zoom: z, x: at.x - w.x * z, y: at.y - w.y * z };
}

export interface Box { x: number; y: number; w: number; h: number }

/**
 * Viewport that shows `content` inside `area` (screen px, already excluding
 * the drawer). Never zooms in past 100% or out past the legibility floor;
 * when the content doesn't fit at the floor, it starts at `start`.
 */
export function fitViewport(content: Box, area: Box, margin: number, start?: XY): Viewport {
  const w = Math.max(1, area.w - margin * 2);
  const h = Math.max(1, area.h - margin * 2);
  const ideal = Math.min(w / content.w, h / content.h, 1);
  const zoom = Math.max(FIT_FLOOR, ideal);
  if (ideal >= FIT_FLOOR || !start) {
    return {
      zoom,
      x: area.x + area.w / 2 - (content.x + content.w / 2) * zoom,
      y: area.y + area.h / 2 - (content.y + content.h / 2) * zoom,
    };
  }
  return { zoom, x: area.x + margin - start.x * zoom, y: area.y + area.h / 2 - start.y * zoom };
}

/** Smallest pan that brings `box` (world) fully inside `area` (screen). */
export function revealBox(v: Viewport, box: Box, area: Box, margin: number): Viewport {
  const left = box.x * v.zoom + v.x;
  const top = box.y * v.zoom + v.y;
  const right = left + box.w * v.zoom;
  const bottom = top + box.h * v.zoom;
  let dx = 0;
  let dy = 0;
  if (right > area.x + area.w - margin) dx = area.x + area.w - margin - right;
  if (left + dx < area.x + margin) dx = area.x + margin - left;
  if (bottom > area.y + area.h - margin) dy = area.y + area.h - margin - bottom;
  if (top + dy < area.y + margin) dy = area.y + margin - top;
  return dx || dy ? { ...v, x: v.x + dx, y: v.y + dy } : v;
}

/** How far a link runs right out of its port before turning: every output of one node turns on the same trunk. */
export const EDGE_SPLIT = 24;
/** Corner radius of a link's turns (--radius-l). */
const EDGE_RADIUS = 12;

const isBackward = (a: XY, b: XY) => b.x - a.x < EDGE_SPLIT * 2;

/**
 * Links are right-angled with rounded corners: out of the port, one vertical
 * run on a trunk just right of the node, then straight into the target. A
 * Switch's branches share the trunk and read as a tree. A link that has to go
 * backwards (target left of source) falls back to a soft curve.
 */
export function edgePath(a: XY, b: XY): string {
  if (isBackward(a, b)) {
    const dx = Math.max(Math.abs(b.x - a.x) / 2, 48);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  }
  const dy = b.y - a.y;
  // Within a port's radius: draw it straight (the port circle covers the difference).
  if (Math.abs(dy) <= 6) return `M ${a.x} ${a.y} H ${b.x}`;
  const x = a.x + EDGE_SPLIT;
  const s = Math.sign(dy);
  const r = Math.min(EDGE_RADIUS, Math.abs(dy) / 2, EDGE_SPLIT);
  return `M ${a.x} ${a.y} H ${x - r} Q ${x} ${a.y} ${x} ${a.y + s * r} V ${b.y - s * r} Q ${x} ${b.y} ${x + r} ${b.y} H ${b.x}`;
}

/**
 * Where a link's "+" sits: the middle of its last straight run into the
 * target, which belongs to this link alone (the trunk can be shared).
 */
export function edgeAnchor(a: XY, b: XY): XY {
  if (isBackward(a, b)) {
    const dx = Math.max(Math.abs(b.x - a.x) / 2, 48);
    const p1 = { x: a.x + dx, y: a.y };
    const p2 = { x: b.x - dx, y: b.y };
    return { x: 0.125 * a.x + 0.375 * p1.x + 0.375 * p2.x + 0.125 * b.x, y: 0.125 * a.y + 0.375 * p1.y + 0.375 * p2.y + 0.125 * b.y };
  }
  if (Math.abs(b.y - a.y) <= 6) return { x: (a.x + b.x) / 2, y: a.y };
  return { x: (a.x + EDGE_SPLIT + b.x) / 2, y: b.y };
}
