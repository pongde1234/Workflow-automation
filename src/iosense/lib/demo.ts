/**
 * Prototype-only URL flags that show states without adding UI:
 * `?demo=empty | loading | error | save-error`. Documented in the README.
 */
export type DemoFlag = 'empty' | 'loading' | 'error' | 'save-error';

export function demoFlag(): DemoFlag | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('demo');
  return v === 'empty' || v === 'loading' || v === 'error' || v === 'save-error' ? v : null;
}
