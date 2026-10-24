import { useMemo, useState } from 'react';
import {
  ActionList, ActionListItem, Button, Counter, Drawer, DrawerBody, DrawerHeader, EmptyState, Indicator, NoDataOneIllustration,
  NoSearchResultIllustration, Spinner, TabItem, TabList, Tabs,
} from '@faclon-labs/fds';
import type { Execution } from '../domain/types';
import { formatRunTime } from '../engine/schedule';
import { useIoExecutions } from '../store/executionStore';
import { EXECUTION_STATUS, SOURCE_LABEL } from '../ui/status';
import { useWorkflow } from './WorkflowContext';

interface HistoryDrawerProps {
  isOpen: boolean;
  onDismiss: () => void;
  /** Shows the run on the canvas (its logs, and the failed node if it failed). */
  onPick: (e: Execution) => void;
  onTest: () => void;
}

/**
 * Every run of this workflow, newest first, in the stock FDS Drawer. Picking
 * one shows it on the canvas: the path it took, each node's result in the logs
 * panel, and the node that failed.
 */
export function HistoryDrawer({ isOpen, onDismiss, onPick, onTest }: HistoryDrawerProps) {
  const { workflow } = useWorkflow();
  const hydrated = useIoExecutions((s) => s.hydrated);
  const all = useIoExecutions((s) => s.executions);
  const [show, setShow] = useState<'all' | 'failed'>('all');
  const runs = useMemo(() => all.filter((e) => e.workflowId === workflow.id).sort((a, b) => b.startedAt - a.startedAt), [all, workflow.id]);
  const shown = show === 'failed' ? runs.filter((e) => e.status === 'failed') : runs;
  const failedCount = runs.filter((e) => e.status === 'failed').length;

  return (
    <Drawer isOpen={isOpen} onDismiss={onDismiss}>
      <DrawerHeader title="History" subtitle={runs.length ? 'Newest first' : undefined} />
      <DrawerBody>
        <div className="io-history">
          {!hydrated ? (
            <div className="io-center"><Spinner size="Large" accessibilityLabel="Loading history" delay={200} /></div>
          ) : runs.length === 0 ? (
            <EmptyState asset={<NoDataOneIllustration />} title="No runs yet" description="Test the workflow to see how a run goes. Every test is kept here.">
              <Button variant="primary" tone="neutral" label="Test workflow" onClick={() => { onDismiss(); onTest(); }} />
            </EmptyState>
          ) : (
            <>
              {/* Each tab swaps the list below (FDS: a filter that swaps its region is filled Tabs); counts go in a Counter. */}
              <Tabs variant="filled" value={show} onChange={(v) => setShow(v as 'all' | 'failed')}>
                <TabList>
                  <TabItem value="all" trailing={<Counter value={runs.length} />}>All</TabItem>
                  <TabItem value="failed" trailing={<Counter value={failedCount} />}>Failed</TabItem>
                </TabList>
              </Tabs>
              {shown.length === 0 ? (
                <EmptyState asset={<NoSearchResultIllustration />} title="No failed runs" description="Every run of this workflow succeeded." />
              ) : (
                <ActionList accessibilityLabel="Runs">
                  {shown.map((e) => {
                    const s = EXECUTION_STATUS[e.status];
                    return (
                      <ActionListItem
                        key={e.id}
                        value={e.id}
                        title={formatRunTime(e.startedAt)}
                        description={`${SOURCE_LABEL[e.source]} · ${e.summary}`}
                        leading={<Indicator color={s.color} accessibilityLabel={s.label} />}
                        onClick={() => onPick(e)}
                      />
                    );
                  })}
                </ActionList>
              )}
            </>
          )}
        </div>
      </DrawerBody>
    </Drawer>
  );
}
