import { create } from 'zustand';
import type { TableFilterState, TableSortState } from '@faclon-labs/fds';
import type { Execution } from '../domain/types';

export interface Viewport { x: number; y: number; zoom: number }

interface ListingView { search: string; sort: TableSortState | null; filters: TableFilterState; page: number; layout: 'table' | 'cards' }

/** Session-only UI state (not persisted): listing view, canvas positions, live test runs. */
interface SessionState {
  listing: ListingView;
  viewports: Record<string, Viewport>;
  /** Current or last test run per workflow, shown on its canvas until dismissed. */
  runs: Record<string, Execution | undefined>;
  /** A past run opened from History, shown over the test run (which stays, to go back to) until closed or a new test starts. */
  pastRuns: Record<string, Execution | undefined>;
  setPastRun: (workflowId: string, e: Execution | undefined) => void;
  /** Height the logs panel was dragged to (null: its default). */
  logsHeight: number | null;
  setLogsHeight: (h: number) => void;
  setListing: (patch: Partial<ListingView>) => void;
  setViewport: (workflowId: string, v: Viewport) => void;
  setRun: (workflowId: string, e: Execution | undefined) => void;
}

export const useIoSession = create<SessionState>()((set) => ({
  listing: { search: '', sort: { columnKey: 'updated', direction: 'desc' }, filters: {}, page: 1, layout: 'table' },
  viewports: {},
  runs: {},
  pastRuns: {},
  setPastRun: (id, e) => set((s) => ({ pastRuns: { ...s.pastRuns, [id]: e } })),
  logsHeight: null,
  setLogsHeight: (h) => set({ logsHeight: h }),
  setListing: (patch) => set((s) => ({ listing: { ...s.listing, ...patch } })),
  setViewport: (id, v) => set((s) => ({ viewports: { ...s.viewports, [id]: v } })),
  setRun: (id, e) => set((s) => ({ runs: { ...s.runs, [id]: e } })),
}));
