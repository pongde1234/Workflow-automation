import { useSyncExternalStore } from 'react';

/** FDS has no breakpoint tokens; these are the widths its own components switch at. */
export const BREAKPOINTS = { small: 480, medium: 768, large: 1024 } as const;

export type WidthClass = 'xs' | 'sm' | 'md' | 'lg';

function classify(w: number): WidthClass {
  if (w < BREAKPOINTS.small) return 'xs';
  if (w < BREAKPOINTS.medium) return 'sm';
  if (w < BREAKPOINTS.large) return 'md';
  return 'lg';
}

const subscribe = (cb: () => void) => {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
};

/** xs < 480 ≤ sm < 768 ≤ md < 1024 ≤ lg. */
export function useWidthClass(): WidthClass {
  return useSyncExternalStore(subscribe, () => classify(window.innerWidth), () => 'lg');
}

const COARSE = '(pointer: coarse)';
const subscribeCoarse = (cb: () => void) => {
  const mq = window.matchMedia?.(COARSE);
  mq?.addEventListener('change', cb);
  return () => mq?.removeEventListener('change', cb);
};

/** True where fingers point (touch screens). */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribeCoarse, () => window.matchMedia?.(COARSE).matches === true, () => false);
}

/** Size of the buttons on the canvas: xs for a mouse, md where fingers point (FDS Button R23: never xs on touch). */
export function useCanvasButtonSize(): 'xs' | 'md' {
  return useCoarsePointer() ? 'md' : 'xs';
}

/** An FDS motion duration token (e.g. `--global-duration-quick`) in ms for JS animation; 0 under reduced motion. */
export function motionMs(token: string): number {
  if (typeof window === 'undefined' || prefersReducedMotion()) return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  return raw.endsWith('ms') ? n : n * 1000;
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** Width of FDS's docked Drawer at this viewport (Drawer guard: 90% below 480, 375 from 480, 420 from 768). */
export function drawerWidth(cls: WidthClass): number {
  if (typeof window === 'undefined') return 0;
  if (cls === 'xs') return Math.round(window.innerWidth * 0.9);
  if (cls === 'sm') return 375;
  return 420;
}
