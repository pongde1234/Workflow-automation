import type { Execution, NodeResult } from '../domain/types';

/** Nodes that ran come first, in the order they ran; the rest follow. */
export function inRunOrder(run: Execution): NodeResult[] {
  const byId = new Map(run.nodes.map((n) => [n.nodeId, n]));
  const ran = run.path.map((id) => byId.get(id)).filter((n): n is NodeResult => !!n);
  return [...ran, ...run.nodes.filter((n) => !run.path.includes(n.nodeId))];
}

/** What a node received: the trigger's values (every node reads them), or the raw submission for the trigger. */
export function inputOf(run: Execution, n: NodeResult) {
  const trigger = run.nodes.find((x) => x.nodeId === run.path[0]);
  return n.nodeId === run.path[0] ? run.triggerData : trigger?.output;
}

/**
 * A finished run as it stood at `step` of its path, for replay: the steps
 * before keep their results, the current one is running and the rest are
 * waiting. The canvas draws it like a live test (spinner, flowing link,
 * following the step). From `step` = path length on, it's the whole run.
 */
export function replayFrame(run: Execution, step: number): Execution {
  if (step >= run.path.length) return run;
  const done = new Set(run.path.slice(0, step));
  const current = run.path[step];
  const nodes = run.nodes.map((n): NodeResult => {
    if (done.has(n.nodeId)) return n;
    const base = { nodeId: n.nodeId, name: n.name, type: n.type };
    return n.nodeId === current ? { ...base, status: 'running' } : { ...base, status: 'not_run' };
  });
  return { ...run, status: 'running', nodes, path: run.path.slice(0, step + 1), failedNodeId: undefined, summary: 'Replaying…' };
}
