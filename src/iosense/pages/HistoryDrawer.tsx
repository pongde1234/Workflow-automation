import { useEffect, useMemo, useState } from 'react';
import {
  Accordion, AccordionItem, AccordionItemBody, AccordionItemHeader, ActionList, ActionListItem, ActionListSection, Alert, Badge, Button,
  Counter, Drawer, DrawerBody, DrawerFooter, DrawerHeader, EmptyState, Indicator, LinkButton, NoDataOneIllustration,
  NoSearchResultIllustration, Spinner, TabItem, TabList, Tabs,
} from '@faclon-labs/fds';
import { ArrowLeft } from 'lucide-react';
import type { Execution } from '../domain/types';
import { formatDateTime, formatTime, groupByDay } from '../ui/format';
import { useIoExecutions } from '../store/executionStore';
import { EXECUTION_STATUS, NODE_RUN_STATUS, SOURCE_LABEL } from '../ui/status';
import { NODE_ICON } from '../ui/nodeIcons';
import { OutputTable } from '../ui/OutputTable';
import { inRunOrder, inputOf } from '../ui/runs';

interface HistoryDrawerProps {
  workflowId: string;
  /** Opened from the workflow list: the drawer names the workflow, since the page behind doesn't. */
  workflowName?: string;
  isOpen: boolean;
  onDismiss: () => void;
  /** Inside the workflow: shows the picked run on the canvas. Without it (from the list), the run opens in the drawer. */
  onPick?: (e: Execution) => void;
  /** From a run shown in the drawer: go into the workflow with that run on the canvas (replaying it, if asked). */
  onOpenInWorkflow?: (e: Execution, replay?: boolean) => void;
  /** Inside the workflow: the empty state's way forward. */
  onTest?: () => void;
}

/** One run in the drawer: how it ended, then each step with its result; a step opens to its output (or, if it failed, what it received). */
function RunDetail({ run, onBack }: { run: Execution; onBack: () => void }) {
  const steps = inRunOrder(run);
  const failedAt = steps.findIndex((n) => n.status === 'failed');
  const reason = failedAt >= 0 ? steps[failedAt].message : undefined;
  return (
    <div className="io-history">
      <span className="io-history__back"><LinkButton label="All runs" icon={<ArrowLeft size={12} />} onClick={onBack} /></span>
      {reason && <Alert color="Negative" isDismissible={false} isFullWidth title={`Failed at ${steps[failedAt].name}`} description={reason} />}
      <Accordion selectionType="multiple" variant="filled" defaultExpandedIndex={failedAt >= 0 ? [failedAt] : []}>
        {steps.map((n) => {
          const s = NODE_RUN_STATUS[n.status];
          return (
            <AccordionItem key={n.nodeId}>
              <AccordionItemHeader
                title={n.name}
                subtitle={n.message}
                leading={NODE_ICON[n.type]}
                trailing={<Indicator size="Small" color={s.color}>{s.label}</Indicator>}
              />
              <AccordionItemBody>
                {n.status === 'failed'
                  ? <OutputTable data={inputOf(run, n)} label={`What ${n.name} received`} />
                  : <OutputTable data={n.output} label={`Output of ${n.name}`} />}
              </AccordionItemBody>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

/**
 * Every run of a workflow, newest first, in the stock FDS Drawer. Inside the
 * workflow, picking one shows it on the canvas (the path it took, each node's
 * result in the logs panel). From the workflow list, a run opens in the drawer
 * itself, so you stay on the list, with Open in workflow to see it on the canvas.
 */
export function HistoryDrawer({ workflowId, workflowName, isOpen, onDismiss, onPick, onOpenInWorkflow, onTest }: HistoryDrawerProps) {
  const hydrated = useIoExecutions((s) => s.hydrated);
  const all = useIoExecutions((s) => s.executions);
  const [show, setShow] = useState<'all' | 'failed'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => { if (isOpen) { setOpenId(null); setShow('all'); } }, [isOpen, workflowId]);
  const runs = useMemo(() => all.filter((e) => e.workflowId === workflowId).sort((a, b) => b.startedAt - a.startedAt), [all, workflowId]);
  const shown = show === 'failed' ? runs.filter((e) => e.status === 'failed') : runs;
  const failedCount = runs.filter((e) => e.status === 'failed').length;
  const open = openId ? runs.find((e) => e.id === openId) : undefined;
  const pick = (e: Execution) => (onPick ? onPick(e) : setOpenId(e.id));

  if (open) {
    const s = EXECUTION_STATUS[open.status];
    return (
      <Drawer isOpen={isOpen} onDismiss={onDismiss}>
        <DrawerHeader
          title={formatDateTime(open.startedAt)}
          subtitle={[SOURCE_LABEL[open.source], workflowName].filter(Boolean).join(' · ')}
          titleSuffix={<Badge label={s.label} color={s.color} />}
        />
        <DrawerBody><RunDetail run={open} onBack={() => setOpenId(null)} /></DrawerBody>
        {onOpenInWorkflow && (
          <DrawerFooter>
            <Button variant="primary" tone="neutral" label="Replay in workflow" onClick={() => onOpenInWorkflow(open, true)} />
            <Button label="Open in workflow" onClick={() => onOpenInWorkflow(open)} />
          </DrawerFooter>
        )}
      </Drawer>
    );
  }

  return (
    <Drawer isOpen={isOpen} onDismiss={onDismiss}>
      <DrawerHeader title="History" subtitle={workflowName ?? (runs.length ? 'Newest first' : undefined)} />
      <DrawerBody>
        <div className="io-history">
          {!hydrated ? (
            <div className="io-center"><Spinner size="Large" accessibilityLabel="Loading history" delay={200} /></div>
          ) : runs.length === 0 ? (
            <EmptyState
              asset={<NoDataOneIllustration />}
              title="No runs yet"
              description={onTest ? 'Test the workflow to see how a run goes. Every test is kept here.' : 'Runs show here once the workflow is tested or triggered.'}
            >
              {onTest && <Button variant="primary" tone="neutral" label="Test workflow" onClick={() => { onDismiss(); onTest(); }} />}
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
                // Under Today / Yesterday / a date, so a row only needs its time and what happened.
                <ActionList accessibilityLabel="Runs">
                  {groupByDay(shown, Date.now()).map((g) => (
                    <ActionListSection key={g.key} title={g.title}>
                      {g.items.map((e) => {
                        const s = EXECUTION_STATUS[e.status];
                        return (
                          <ActionListItem
                            key={e.id}
                            value={e.id}
                            title={formatTime(e.startedAt)}
                            description={`${SOURCE_LABEL[e.source]} · ${e.summary}`}
                            leading={<Indicator color={s.color} accessibilityLabel={s.label} />}
                            onClick={() => pick(e)}
                          />
                        );
                      })}
                    </ActionListSection>
                  ))}
                </ActionList>
              )}
            </>
          )}
        </div>
      </DrawerBody>
    </Drawer>
  );
}
