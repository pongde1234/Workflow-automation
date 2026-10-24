import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { del, get as idbGet, set as idbSet } from 'idb-keyval';
import type { Execution } from '../domain/types';

const MAX_EXECUTIONS = 500;

const idbStorage: StateStorage = {
  getItem: async (name) => (await idbGet<string>(name)) ?? null,
  setItem: async (name, value) => {
    try {
      await idbSet(name, value);
    } catch (e) {
      console.warn('iosense: could not store execution history', e);
    }
  },
  removeItem: async (name) => del(name),
};

interface ExecutionState {
  executions: Execution[];
  hydrated: boolean;
  /** Written at the start and the end of a run only; live progress stays in the session store. */
  upsert: (e: Execution) => void;
  replaceAll: (es: Execution[]) => void;
  removeForWorkflow: (workflowId: string) => void;
}

export const useIoExecutions = create<ExecutionState>()(
  persist(
    (set) => ({
      executions: [],
      hydrated: false,
      upsert: (e) => set((s) => {
        const i = s.executions.findIndex((x) => x.id === e.id);
        if (i >= 0) {
          const executions = s.executions.slice();
          executions[i] = e;
          return { executions };
        }
        return { executions: [e, ...s.executions].slice(0, MAX_EXECUTIONS) };
      }),
      replaceAll: (es) => set({ executions: [...es].sort((a, b) => b.startedAt - a.startedAt).slice(0, MAX_EXECUTIONS) }),
      removeForWorkflow: (workflowId) => set((s) => ({ executions: s.executions.filter((e) => e.workflowId !== workflowId) })),
    }),
    {
      name: 'iosense-executions',
      version: 1,
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ executions: s.executions }) as Partial<ExecutionState>,
      onRehydrateStorage: () => (state) => {
        // A run still "running" after a reload was interrupted by closing the tab.
        if (state) {
          state.executions = state.executions.map((e) => (e.status === 'running'
            ? { ...e, status: 'failed', summary: 'Interrupted: the page was closed during this run' }
            : e));
        }
        useIoExecutions.setState({ hydrated: true });
      },
    },
  ),
);
