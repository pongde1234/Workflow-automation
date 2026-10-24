import type { ReactNode } from 'react';
import type { NavItem } from '@faclon-labs/fds';

/** A breadcrumb for a record page: its title and the nav id of the list page above it. */
export interface ModuleRecord { title: string; parent: string }

/**
 * A feature area that plugs itself into the shell. Each module describes its
 * nav, routes and breadcrumbs in its own folder; App.tsx only lists modules
 * (src/modules.ts), so parallel work on different modules never edits the
 * same lines.
 */
export interface AppModule {
  id: string;
  /** First URL segment the module owns, e.g. 'iosense' for /iosense/…. */
  segment: string;
  /** Sidebar entries, placed after the core items and before the core sections. */
  nav?: NavItem[];
  /** Each nav id's page title (used by the breadcrumb) and path. */
  pages: Record<string, { title: string; path: string }>;
  /** Accordion id → the child page opened when the accordion itself is chosen. */
  landing?: Record<string, string>;
  /** The nav id to highlight for a path under `segment` (default: the first page). */
  activeId?: (pathname: string) => string;
  /**
   * The breadcrumb for a record page, or null. A hook, so the trail follows
   * renames; the shell calls every module's hook on every render.
   */
  useRecord?: (pathname: string) => ModuleRecord | null;
  /** Shell layout for a path under `segment`; canvas pages fill the screen without padding. */
  layout?: (pathname: string) => { pageHeight?: 'auto' | 'fill'; pagePadding?: 'default' | 'none' } | undefined;
  /** Routes inside the shell; lazy-load their pages. */
  routes: { path: string; element: ReactNode }[];
  /** Runs once after the workspace has hydrated and been seeded. */
  init?: () => void;
}
