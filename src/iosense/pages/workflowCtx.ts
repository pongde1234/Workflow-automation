import { createContext } from 'react';
import type { Execution, Issue, Workflow } from '../domain/types';
import type { Selection } from '../canvas/Canvas';
import type { SummaryContext } from '../canvas/summary';
import type { WorkflowEditor } from './useWorkflowEditor';

/*
 * The workflow page's context object, on its own so it is created once.
 * When WorkflowContext.tsx is hot-reloaded in development, a context created
 * there would be replaced while the page stays open, and the parts of the page
 * still holding the old one would throw "useWorkflow must be used inside
 * WorkflowProvider". This module only imports types, so it never reloads.
 */

export interface WorkflowContextValue {
  workflow: Workflow;
  editor: WorkflowEditor;
  ctx: SummaryContext;
  issues: Issue[];
  blocking: Issue[];
  selection: Selection;
  setSelection: (s: Selection) => void;
  /** Field to focus in the node drawer after "Go to node". */
  focusField: string | null;
  setFocusField: (f: string | null) => void;
  /** Once Test or Publish is attempted, every field shows its error, touched or not. */
  showAllErrors: boolean;
  setShowAllErrors: (v: boolean) => void;
  /** The run drawn on the canvas: a past run opened from History, else the live/last test. */
  run: Execution | undefined;
  /** `inspecting` opens a past run from History over the test run; `undefined` closes both. */
  setRun: (e: Execution | undefined, inspecting?: boolean) => void;
  /** A past run is shown (the test run, if any, waits behind it). */
  inspecting: boolean;
  /** The live/last test run, kept while a past run is shown. */
  testRun: Execution | undefined;
  /** Leaves the past run and shows the test run again. */
  showTestRun: () => void;
  /** Replaying the shown run step by step (null: not replaying). `step` = total means it reached the end. */
  replay: { step: number; total: number; playing: boolean } | null;
  /** Replays the shown run (or the given run once it's shown) from its first step. */
  startReplay: (runId?: string) => void;
  /** One step back or on; pauses. */
  stepReplay: (delta: -1 | 1) => void;
  /** Plays or pauses; playing at the end starts again. */
  toggleReplay: () => void;
  stopReplay: () => void;
  /** Node shown in the run logs (null: follow the run). */
  logNodeId: string | null;
  setLogNodeId: (id: string | null) => void;
  /** Go to a node (and optionally a field): select it and open its configuration. */
  goToNode: (nodeId: string, field?: string) => void;
  /** Says something to screen readers through the page's polite live region. */
  announce: (message: string) => void;
  announcement: string;
}

export const Ctx = createContext<WorkflowContextValue | null>(null);
