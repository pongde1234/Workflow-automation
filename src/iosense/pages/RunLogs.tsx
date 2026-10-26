import { useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ActionList, ActionListItem, ActionListItemIcon, Alert, Button, ButtonGroup, Indicator, LinkButton, ProgressBar, ScrollArea, Spinner, TabItem, TabList, Tabs,
} from '@faclon-labs/fds';
import { ArrowLeft, ChevronDown, ChevronUp, CircleStop, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import type { Execution } from '../domain/types';
import { formatRunTime } from '../engine/schedule';
import { historyPath, linkProps } from '../lib/links';
import { useWidthClass } from '../lib/useViewportWidth';
import { useIoSession } from '../store/sessionStore';
import { EXECUTION_STATUS, NODE_RUN_STATUS, SOURCE_LABEL } from '../ui/status';
import { NODE_ICON } from '../ui/nodeIcons';
import { OutputTable } from '../ui/OutputTable';
import { inRunOrder, inputOf } from '../ui/runs';
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


/**
 * The run's logs, docked under the canvas: every node with its result on the
 * left, the chosen node's output (or input) on the right. Shows a live test as
 * it runs, and a past execution opened from the history.
 */
export function RunLogs({ onRetest }: { onRetest: (e: Execution) => void }) {
  const { run, setRun, inspecting, testRun, showTestRun, workflow, logNodeId, setLogNodeId, replay, startReplay, stepReplay, toggleReplay, stopReplay } = useWorkflow();
  const navigate = useNavigate();
  const width = useWidthClass();
  const [collapsed, setCollapsed] = useState(false);
  // The Output/Input tab picked for a node; a node nobody picked for opens on its default (see `view` below).
  const [picked, setPicked] = useState<{ nodeId: string; view: string } | null>(null);

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

  // A replay draws a finished run as if it were running; it isn't a live test, so the live-only rules don't apply.
  const running = run.status === 'running' && !replay;
  const replayAt = replay && replay.step < replay.total ? run.nodes.find((n) => n.nodeId === run.path[replay.step])?.name : undefined;
  const narrow = width === 'xs' || width === 'sm';
  // A past run opened from History sits over this session's test run: offer the way back to it.
  const canGoBack = inspecting && !!testRun && testRun.id !== run.id;
  const ordered = inRunOrder(run);
  const selected = ordered.find((n) => n.nodeId === logNodeId)
    ?? ordered.find((n) => n.status === 'running')
    ?? ordered.find((n) => n.nodeId === run.failedNodeId)
    ?? ordered.find((n) => n.nodeId === run.path[run.path.length - 1])
    ?? ordered[0];
  // A failed node opens on Input: what it received is what explains the failure (its Output is empty).
  const view = selected && picked?.nodeId === selected.nodeId ? picked.view : selected?.status === 'failed' ? 'input' : 'output';
  const status = EXECUTION_STATUS[run.status];
  // A failed run names the node it stopped at, right after "Failed".
  const failedAt = run.status === 'failed' ? run.nodes.find((n) => n.nodeId === run.failedNodeId)?.name : undefined;
  const summary = running
    ? 'Simulating the run…'
    : `${SOURCE_LABEL[run.source]} · ${formatRunTime(run.startedAt)}`;

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
        <h2 className="BodyMediumSemibold">{replay ? 'Replay' : inspecting ? 'Past run' : run.source === 'test' ? 'Test run' : 'Live run'}</h2>
        <div className="io-logs__state" aria-live="polite">
          {replay && replay.step < replay.total
            ? <span className="io-logs__status BodyMediumMedium">{`Step ${replay.step + 1} of ${replay.total}`}<span className="io-muted BodySmallRegular">{replayAt}</span></span>
            : running
            ? <span className="io-logs__progress"><ProgressBar isIndeterminate accessibilityLabel="Test in progress" /></span>
            : (
              // "Failed at <node>" reads as one phrase: the node name in the Indicator label's own type, close beside it.
              <span className="io-logs__status">
                <Indicator color={status.color}>{status.label}</Indicator>
                {failedAt && <span className="io-logs__where BodyMediumMedium">at {failedAt}</span>}
              </span>
            )}
          <span className="io-logs__summary io-muted BodySmallRegular">{summary}</span>
        </div>
        <div className="io-logs__actions">
          {/* Replay: step through a finished run on the canvas. The three controls are one FDS ButtonGroup (actions). */}
          {replay ? (
            <>
              <ButtonGroup variant="Tertiary" size="sm" aria-label="Replay controls">
                <Button iconOnly aria-label="Previous step" leadingIcon={<SkipBack size={16} />} onClick={() => stepReplay(-1)} isDisabled={replay.step === 0} />
                <Button
                  iconOnly
                  aria-label={replay.playing ? 'Pause replay' : replay.step >= replay.total ? 'Replay again' : 'Play replay'}
                  leadingIcon={replay.playing ? <Pause size={16} /> : <Play size={16} />}
                  onClick={toggleReplay}
                />
                <Button iconOnly aria-label="Next step" leadingIcon={<SkipForward size={16} />} onClick={() => stepReplay(1)} isDisabled={replay.step >= replay.total} />
              </ButtonGroup>
              {/* Icon-only on phones, so the replay controls fit beside collapse and close. */}
              {narrow
                ? <Button iconOnly size="sm" variant="ghost" tone="neutral" aria-label="Exit replay" leadingIcon={<CircleStop size={16} />} onClick={stopReplay} />
                : <Button size="sm" variant="ghost" tone="neutral" label="Exit replay" onClick={stopReplay} />}
            </>
          ) : !running && run.path.length > 1 && (
            narrow
              ? <Button iconOnly size="sm" variant="secondary" tone="neutral" aria-label="Replay" leadingIcon={<Play size={16} />} onClick={() => startReplay()} />
              : <Button size="sm" variant="secondary" tone="neutral" label="Replay" leadingIcon={<Play size={16} />} onClick={() => startReplay()} />
          )}
          {inspecting && !running && !replay && <Button size="sm" variant="secondary" tone="neutral" label="Re-run test" onClick={() => onRetest(run)} />}
          {!running && !replay && <LinkButton size="sm" label="History" {...linkProps(navigate, historyPath(workflow.id))} />}
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
          {!running && <Button iconOnly size="sm" variant="ghost" tone="neutral" aria-label="Close logs" leadingIcon={<X size={16} />} onClick={() => { stopReplay(); setRun(undefined); }} />}
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
                    description={run.status === 'running' && n.status === 'not_run' ? 'Waiting' : s.label}
                    leading={<ActionListItemIcon icon={NODE_ICON[n.type]} />}
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
                    <Tabs variant="filled" size="Small" value={view} onChange={(v) => setPicked({ nodeId: selected.nodeId, view: v })}>
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
