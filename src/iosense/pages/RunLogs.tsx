import { useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ActionList, ActionListItem, Alert, Button, Indicator, LinkButton, ProgressBar, ScrollArea, Spinner, TabItem, TabList, Tabs,
} from '@faclon-labs/fds';
import { ArrowLeft, ChevronDown, ChevronUp, X } from 'lucide-react';
import { formatDuration } from '@/lib/util';
import type { Execution, NodeResult } from '../domain/types';
import { formatRunTime } from '../engine/schedule';
import { historyPath, linkProps } from '../lib/links';
import { useWidthClass } from '../lib/useViewportWidth';
import { useIoSession } from '../store/sessionStore';
import { EXECUTION_STATUS, NODE_RUN_STATUS, SOURCE_LABEL } from '../ui/status';
import { NodeTile } from '../ui/NodeTile';
import { OutputTable } from '../ui/OutputTable';
import { useWorkflow } from './WorkflowContext';

/** The panel starts this tall and is dragged between MIN_HEIGHT and half the screen; the keyboard moves it a grid step. */
const DEFAULT_HEIGHT = 320;
const MIN_HEIGHT = 160;
const KEY_STEP = 24;

const subscribeResize = (cb: () => void) => {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
};
const useViewportHeight = () => useSyncExternalStore(subscribeResize, () => window.innerHeight, () => DEFAULT_HEIGHT * 2);

/** Nodes that ran come first, in the order they ran; the rest follow. */
function inRunOrder(run: Execution): NodeResult[] {
  const byId = new Map(run.nodes.map((n) => [n.nodeId, n]));
  const ran = run.path.map((id) => byId.get(id)).filter((n): n is NodeResult => !!n);
  return [...ran, ...run.nodes.filter((n) => !run.path.includes(n.nodeId))];
}

/** What a node received: the trigger's values (every node reads them), or the raw submission for the trigger. */
function inputOf(run: Execution, n: NodeResult) {
  const trigger = run.nodes.find((x) => x.nodeId === run.path[0]);
  return n.nodeId === run.path[0] ? run.triggerData : trigger?.output;
}

/**
 * The run's logs, docked under the canvas: every node with its result on the
 * left, the chosen node's output (or input) on the right. Shows a live test as
 * it runs, and a past execution opened from the history.
 */
export function RunLogs({ onRetest }: { onRetest: (e: Execution) => void }) {
  const { run, setRun, inspecting, testRun, showTestRun, workflow, logNodeId, setLogNodeId } = useWorkflow();
  const navigate = useNavigate();
  const width = useWidthClass();
  const [collapsed, setCollapsed] = useState(false);
  const [view, setView] = useState('output');

  // Resizing: drag the top edge (or use the arrow keys on it), from MIN_HEIGHT up to half the screen.
  const stored = useIoSession((s) => s.logsHeight);
  const setStored = useIoSession((s) => s.setLogsHeight);
  const maxHeight = Math.max(MIN_HEIGHT, Math.round(useViewportHeight() / 2));
  const clamp = (h: number) => Math.min(maxHeight, Math.max(MIN_HEIGHT, Math.round(h)));
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ pointer: number; startY: number; startHeight: number } | null>(null);
  const height = clamp(dragHeight ?? stored ?? DEFAULT_HEIGHT);

  const startResize = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointer: e.pointerId, startY: e.clientY, startHeight: height };
    setDragHeight(height);
  };
  const moveResize = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d && d.pointer === e.pointerId) setDragHeight(clamp(d.startHeight + d.startY - e.clientY));
  };
  const endResize = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    drag.current = null;
    setStored(clamp(d.startHeight + d.startY - e.clientY));
    setDragHeight(null);
  };
  const keyResize = (e: KeyboardEvent<HTMLDivElement>) => {
    const to: Record<string, number> = { ArrowUp: height + KEY_STEP, ArrowDown: height - KEY_STEP, Home: MIN_HEIGHT, End: maxHeight };
    if (!(e.key in to)) return;
    e.preventDefault();
    setStored(clamp(to[e.key]));
  };

  if (!run) return null;

  const running = run.status === 'running';
  const narrow = width === 'xs' || width === 'sm';
  // A past run opened from History sits over this session's test run: offer the way back to it.
  const canGoBack = inspecting && !!testRun && testRun.id !== run.id;
  const ordered = inRunOrder(run);
  const selected = ordered.find((n) => n.nodeId === logNodeId)
    ?? ordered.find((n) => n.status === 'running')
    ?? ordered.find((n) => n.nodeId === run.failedNodeId)
    ?? ordered.find((n) => n.nodeId === run.path[run.path.length - 1])
    ?? ordered[0];
  const status = EXECUTION_STATUS[run.status];
  const summary = running
    ? 'Simulating the run…'
    : `${SOURCE_LABEL[run.source]} · ${formatRunTime(run.startedAt)} · ${formatDuration(run.durationMs)} (simulated)`;

  return (
    <section
      className="io-logs"
      aria-label={inspecting ? 'Past run logs' : 'Test run logs'}
      data-collapsed={collapsed || undefined}
      data-narrow={narrow || undefined}
      data-resizing={dragHeight !== null || undefined}
      style={collapsed ? undefined : { height }}
    >
      {!collapsed && (
        <div
          className="io-logs__resize"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize logs"
          aria-valuemin={MIN_HEIGHT}
          aria-valuemax={maxHeight}
          aria-valuenow={height}
          tabIndex={0}
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onKeyDown={keyResize}
        />
      )}
      <div className="io-logs__head">
        {canGoBack && (narrow
          ? <Button iconOnly size="sm" variant="ghost" tone="neutral" aria-label="Back to current run" leadingIcon={<ArrowLeft size={16} />} onClick={showTestRun} />
          : <Button size="sm" variant="ghost" tone="neutral" label="Back to current run" leadingIcon={<ArrowLeft size={16} />} onClick={showTestRun} />)}
        <h2 className="BodyMediumSemibold">{inspecting ? 'Past run' : 'Test run'}</h2>
        <div className="io-logs__state" aria-live="polite">
          {running
            ? <ProgressBar isIndeterminate accessibilityLabel="Test in progress" />
            : <Indicator color={status.color}>{status.label}</Indicator>}
          <span className="io-muted BodySmallRegular">{summary}</span>
        </div>
        <div className="io-logs__actions">
          {inspecting && !running && <Button size="sm" variant="secondary" tone="neutral" label="Re-run test" onClick={() => onRetest(run)} />}
          {!running && <LinkButton size="sm" label="History" {...linkProps(navigate, historyPath(workflow.id))} />}
          <Button
            iconOnly
            size="sm"
            variant="ghost"
            tone="neutral"
            aria-label={collapsed ? 'Expand logs' : 'Collapse logs'}
            aria-expanded={!collapsed}
            leadingIcon={collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            onClick={() => setCollapsed((c) => !c)}
          />
          {!running && <Button iconOnly size="sm" variant="ghost" tone="neutral" aria-label="Close logs" leadingIcon={<X size={16} />} onClick={() => setRun(undefined)} />}
        </div>
      </div>

      {!collapsed && (
        <div className="io-logs__body">
          {/* The list is its own scroller (FDS: give it a height and it scrolls); wrapping it in a ScrollArea trapped the wheel. */}
          <div className="io-logs__list">
            <ActionList
              className="io-logs__nodes"
              accessibilityLabel="Nodes in this run"
              selectionType="single"
              value={selected ? [selected.nodeId] : []}
              onChange={({ values }) => values[0] && setLogNodeId(values[0])}
            >
              {ordered.map((n) => {
                const s = NODE_RUN_STATUS[n.status];
                return (
                  <ActionListItem
                    key={n.nodeId}
                    value={n.nodeId}
                    title={n.name}
                    description={n.durationMs !== undefined ? `${s.label} · ${formatDuration(n.durationMs)}` : s.label}
                    leading={<NodeTile type={n.type} size="sm" />}
                    trailing={n.status === 'running' ? <Spinner size="Medium" accessibilityLabel="Running" /> : <Indicator color={s.color} accessibilityLabel={s.label} />}
                  />
                );
              })}
            </ActionList>
          </div>

          {selected && (
            <ScrollArea className="io-logs__detail" viewportClassName="io-logs__scroll" axis="y">
              <div className="io-logs__detail-inner">
                <div className="io-logs__detail-head">
                  {/* What the node did reads as its subtitle; a failure gets the Alert below instead. */}
                  <div className="io-logs__detail-title">
                    <h3 className="BodyMediumSemibold">{selected.name}</h3>
                    {selected.status !== 'failed' && selected.message && <p className="io-muted BodySmallRegular">{selected.message}</p>}
                  </div>
                  <div className="io-logs__switch">
                    <Tabs variant="filled" size="Small" value={view} onChange={setView}>
                      <TabList>
                        <TabItem value="output">Output</TabItem>
                        <TabItem value="input">Input</TabItem>
                      </TabList>
                    </Tabs>
                  </div>
                </div>
                {selected.status === 'failed' && selected.message && (
                  <Alert color="Negative" isDismissible={false} isFullWidth description={selected.message} />
                )}
                {view === 'output'
                  ? <OutputTable data={selected.output} label={`Output of ${selected.name}`} />
                  : <OutputTable data={inputOf(run, selected)} label={`Input of ${selected.name}`} />}
              </div>
            </ScrollArea>
          )}
        </div>
      )}
    </section>
  );
}
