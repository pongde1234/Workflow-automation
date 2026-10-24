import { useCallback, useEffect, useRef, useState } from 'react';
import { toastStore } from '@faclon-labs/fds';
import type { Graph } from '../domain/types';
import { useIoWorkflows } from '../store/workflowStore';

export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';

const HISTORY_LIMIT = 100;
const MERGE_MS = 800;
const SAVE_DELAY_MS = 800;
const EMPTY: Graph = { nodes: [], edges: [] };
const SAVE_TOAST_ID = 'iosense-save-error';

/**
 * Editing state for one workflow's draft graph: undo/redo (typing in one field
 * merges into one step) and autosave to browser storage.
 */
export function useWorkflowEditor(workflowId: string) {
  const initial = useIoWorkflows.getState().workflows.find((w) => w.id === workflowId)?.graph ?? EMPTY;
  const [graph, setGraph] = useState<Graph>(initial);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [historySize, setHistorySize] = useState({ past: 0, future: 0 });

  const latest = useRef(graph);
  const past = useRef<Graph[]>([]);
  const future = useRef<Graph[]>([]);
  const lastMerge = useRef<{ key: string; at: number } | null>(null);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const flush = useCallback((): boolean => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return true;
    setSaveState('saving');
    const ok = useIoWorkflows.getState().saveGraph(workflowId, latest.current);
    dirty.current = !ok;
    setSaveState(ok ? 'saved' : 'error');
    if (ok) toastStore.dismiss(SAVE_TOAST_ID);
    else {
      toastStore.show({
        id: SAVE_TOAST_ID, color: 'Negative', autoDismiss: false,
        content: 'Couldn’t save your changes to this browser’s storage. They’re kept in this tab; use Retry in the header.',
      });
    }
    return ok;
  }, [workflowId]);

  const schedule = useCallback(() => {
    dirty.current = true;
    setSaveState('unsaved');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
  }, [flush]);

  const show = useCallback((next: Graph) => {
    latest.current = next;
    setGraph(next);
    setHistorySize({ past: past.current.length, future: future.current.length });
    schedule();
  }, [schedule]);

  /** Apply an edit. Edits sharing `mergeKey` within 800 ms become one undo step. */
  const update = useCallback((next: Graph | ((g: Graph) => Graph), mergeKey?: string) => {
    const value = typeof next === 'function' ? next(latest.current) : next;
    if (value === latest.current) return;
    const now = Date.now();
    const merge = !!mergeKey && lastMerge.current?.key === mergeKey && now - lastMerge.current.at < MERGE_MS;
    if (!merge) {
      past.current.push(latest.current);
      if (past.current.length > HISTORY_LIMIT) past.current.shift();
    }
    future.current = [];
    lastMerge.current = mergeKey ? { key: mergeKey, at: now } : null;
    show(value);
  }, [show]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(latest.current);
    lastMerge.current = null;
    show(prev);
  }, [show]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(latest.current);
    lastMerge.current = null;
    show(next);
  }, [show]);

  // Save before leaving the editor or the page.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    const onUnload = () => { flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onUnload);
      flush();
    };
  }, [flush]);

  return {
    graph,
    /** Always the newest graph, for event handlers. */
    latest,
    update,
    undo,
    redo,
    canUndo: historySize.past > 0,
    canRedo: historySize.future > 0,
    saveState,
    flush,
  };
}

export type WorkflowEditor = ReturnType<typeof useWorkflowEditor>;
