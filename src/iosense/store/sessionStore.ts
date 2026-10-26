import { create } from 'zustand';
import type { TableFilterState, TableSortState } from '@faclon-labs/fds';
import type { Execution, Graph, WorkflowStatus } from '../domain/types';

export interface Viewport { x: number; y: number; zoom: number }

/** The workflow list's status tab: every workflow, or one status. */
export type StatusTab = 'all' | WorkflowStatus;

interface ListingView { search: string; sort: TableSortState | null; status: StatusTab; page: number; layout: 'table' | 'cards' }

/** The Run history page's table: kept for the session so coming back from a run lands where you were. */
export interface RunsView { search: string; sort: TableSortState | null; filters: TableFilterState; page: number }

/** Session-only UI state (not persisted): listing view, canvas positions, live test runs. */
interface SessionState {
  listing: ListingView;
  runsView: RunsView;
  setRunsView: (patch: Partial<RunsView>) => void;
  /** When the notifications panel was last closed: anything newer is unread. */
  notificationsSeenAt: number;
  markNotificationsSeen: () => void;
  /** Live mode: active workflows fire sample events every few seconds (off by default; this session only). */
  live: boolean;
  setLive: (on: boolean) => void;
  /** The assistant panel (AppShell's Bruce button, or Build with AI on an empty canvas). */
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
  /** A draft the assistant was told to add to an open, empty workflow; that workflow's canvas takes it in. */
  pendingDraft: { workflowId: string; graph: Graph } | null;
  setPendingDraft: (d: { workflowId: string; graph: Graph } | null) => void;
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
  listing: { search: '', sort: { columnKey: 'updated', direction: 'desc' }, status: 'all', page: 1, layout: 'table' },
  runsView: { search: '', sort: { columnKey: 'started', direction: 'desc' }, filters: {}, page: 1 },
  setRunsView: (patch) => set((s) => ({ runsView: { ...s.runsView, ...patch } })),
  notificationsSeenAt: 0,
  markNotificationsSeen: () => set({ notificationsSeenAt: Date.now() }),
  live: false,
  setLive: (live) => set({ live }),
  assistantOpen: false,
  setAssistantOpen: (assistantOpen) => set({ assistantOpen }),
  pendingDraft: null,
  setPendingDraft: (pendingDraft) => set({ pendingDraft }),
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
