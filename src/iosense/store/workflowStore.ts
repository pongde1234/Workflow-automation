import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { uid } from '@/lib/util';
import type { Directory, Graph, IoDevice, IoForm, IoReport, IoUser, Workflow } from '../domain/types';
import { demoFlag } from '../lib/demo';
import { CURRENT_USER_ID } from '../seed/seed';
import { changesText, graphChanges } from '../engine/diff';

/**
 * localStorage that reports failed writes instead of swallowing them, so the
 * editor can say "Couldn't save". zustand's persist calls `setItem`
 * synchronously inside `set`, so the result is known straight away.
 */
const lastWrite = { seq: 0, ok: true };
const reportingStorage: StateStorage = {
  getItem: (k) => localStorage.getItem(k),
  removeItem: (k) => localStorage.removeItem(k),
  setItem: (k, v) => {
    lastWrite.seq++;
    try {
      if (demoFlag() === 'save-error') throw new Error('Simulated save failure');
      localStorage.setItem(k, v);
      lastWrite.ok = true;
    } catch {
      lastWrite.ok = false;
    }
  },
};

/** Runs a store update and reports whether it reached storage. */
function persisted(update: () => void): boolean {
  const before = lastWrite.seq;
  update();
  return lastWrite.seq === before ? true : lastWrite.ok;
}

const copyGraph = (g: Graph): Graph => structuredClone(g);

interface WorkflowState {
  workflows: Workflow[];
  forms: IoForm[];
  users: IoUser[];
  devices: IoDevice[];
  reports: IoReport[];
  seeded: boolean;
  createWorkflow: (input: { name: string; description: string }) => Workflow;
  updateMeta: (id: string, patch: { name?: string; description?: string }) => boolean;
  saveGraph: (id: string, graph: Graph) => boolean;
  publish: (id: string, graph: Graph) => boolean;
  setStatus: (id: string, status: 'active' | 'paused') => void;
  discardChanges: (id: string) => Graph | null;
  duplicate: (id: string) => Workflow | null;
  remove: (id: string) => void;
  load: (data: Directory & { workflows: Workflow[] }) => void;
  restoreForms: (forms: IoForm[]) => void;
}

export const useIoWorkflows = create<WorkflowState>()(
  persist(
    (set, get) => {
      const patch = (id: string, fn: (w: Workflow) => Workflow) =>
        set((s) => ({ workflows: s.workflows.map((w) => (w.id === id ? fn(w) : w)) }));
      return {
        workflows: [],
        forms: [],
        users: [],
        devices: [],
        reports: [],
        seeded: false,
        createWorkflow: ({ name, description }) => {
          const now = Date.now();
          const wf: Workflow = {
            id: uid('wf'), name: name.trim(), description: description.trim(), status: 'draft',
            graph: { nodes: [], edges: [] }, published: null, ownerId: CURRENT_USER_ID, versions: [], createdAt: now, updatedAt: now,
          };
          set((s) => ({ workflows: [wf, ...s.workflows] }));
          return wf;
        },
        updateMeta: (id, p) => persisted(() => patch(id, (w) => ({
          ...w,
          ...(p.name !== undefined ? { name: p.name.trim() } : {}),
          ...(p.description !== undefined ? { description: p.description.trim() } : {}),
          updatedAt: Date.now(),
        }))),
        saveGraph: (id, graph) => persisted(() => patch(id, (w) => ({ ...w, graph: copyGraph(graph), updatedAt: Date.now() }))),
        // Each publish is kept as a version: who published it, and what changed from the one before.
        publish: (id, graph) => persisted(() => patch(id, (w) => {
          const now = Date.now();
          const versions = w.versions ?? [];
          const prev = versions[versions.length - 1];
          const version = {
            id: uid('v'), number: (prev?.number ?? 0) + 1, graph: copyGraph(graph), publishedAt: now, publishedBy: CURRENT_USER_ID,
            changes: prev ? changesText(graphChanges(graph, prev.graph)) ?? 'No step changes' : null,
          };
          return {
            ...w,
            graph: copyGraph(graph),
            published: { graph: copyGraph(graph), publishedAt: now },
            status: w.status === 'paused' ? 'paused' : 'active',
            versions: [...versions, version],
            updatedAt: now,
          };
        })),
        setStatus: (id, status) => patch(id, (w) => (w.published ? { ...w, status } : w)),
        discardChanges: (id) => {
          const w = get().workflows.find((x) => x.id === id);
          if (!w?.published) return null;
          const graph = copyGraph(w.published.graph);
          patch(id, (x) => ({ ...x, graph, updatedAt: Date.now() }));
          return graph;
        },
        duplicate: (id) => {
          const w = get().workflows.find((x) => x.id === id);
          if (!w) return null;
          const now = Date.now();
          const copy: Workflow = { ...w, id: uid('wf'), name: `${w.name} (copy)`, status: 'draft', graph: copyGraph(w.graph), published: null, ownerId: CURRENT_USER_ID, versions: [], createdAt: now, updatedAt: now };
          set((s) => {
            const i = s.workflows.findIndex((x) => x.id === id);
            const workflows = s.workflows.slice();
            workflows.splice(i + 1, 0, copy);
            return { workflows };
          });
          return copy;
        },
        remove: (id) => set((s) => ({ workflows: s.workflows.filter((w) => w.id !== id) })),
        load: (data) => set({ ...data, seeded: true }),
        restoreForms: (forms) => set({ forms }),
      };
    },
    {
      name: 'iosense-workflows',
      // v5: the fuller sample workspace (15 workflows, a month of history); older data is re-seeded.
      version: 8,
      migrate: () => ({ workflows: [], forms: [], users: [], devices: [], reports: [], seeded: false }) as unknown as WorkflowState,
      storage: createJSONStorage(() => reportingStorage),
    },
  ),
);

/** True when the draft differs from what is Active/Paused. Positions count as changes only if something else changed too. */
export function hasUnpublishedChanges(w: Workflow): boolean {
  if (!w.published) return false;
  const strip = (g: Graph) => JSON.stringify({ nodes: g.nodes.map(({ position: _p, ...n }) => n), edges: [...g.edges].sort((a, b) => a.id.localeCompare(b.id)) });
  return strip(w.graph) !== strip(w.published.graph);
}
