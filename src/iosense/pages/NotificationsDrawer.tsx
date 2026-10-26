import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ActionList, ActionListItem, Button, Drawer, DrawerBody, DrawerFooter, DrawerHeader, EmptyState, Indicator, NoNotificationIllustration,
} from '@faclon-labs/fds';
import { timeAgo } from '@/lib/util';
import { DAY, failuresSince } from '../engine/stats';
import { useIoExecutions } from '../store/executionStore';
import { useIoWorkflows } from '../store/workflowStore';
import { useIoSession } from '../store/sessionStore';
import { runPath } from '../lib/links';

/** The bell reports failed runs from the last week. */
const NOTIFY_DAYS = 7;
/** A preview, not a list (AppShell R10): the rest are in Run history. */
const PREVIEW = 5;

/** Failed runs of existing workflows from the last week, newest first, and how many arrived since the panel was last closed. */
export function useNotifications() {
  const executions = useIoExecutions((s) => s.executions);
  const workflows = useIoWorkflows((s) => s.workflows);
  const seenAt = useIoSession((s) => s.notificationsSeenAt);
  return useMemo(() => {
    const names = new Map(workflows.map((w) => [w.id, w.name]));
    const items = failuresSince(executions, Date.now() - NOTIFY_DAYS * DAY)
      .filter((e) => names.has(e.workflowId))
      .map((e) => ({ ...e, name: names.get(e.workflowId)! }));
    return { items, unread: items.filter((e) => e.startedAt > seenAt).length, seenAt };
  }, [executions, workflows, seenAt]);
}

/**
 * The bell's panel (FDS Drawer guard: a popup without an overlay, since it
 * commits nothing). Each row opens its run on the workflow; unread rows carry
 * the Intense indicator. Closing the panel marks everything read.
 */
export function NotificationsDrawer({ isOpen, onDismiss }: { isOpen: boolean; onDismiss: () => void }) {
  const navigate = useNavigate();
  const setRunsView = useIoSession((s) => s.setRunsView);
  const { items, seenAt } = useNotifications();

  const showAll = () => {
    onDismiss();
    setRunsView({ search: '', filters: { status: ['failed'] }, page: 1 });
    navigate('/iosense/runs');
  };

  return (
    <Drawer isOpen={isOpen} onDismiss={onDismiss} variant="popup" showOverlay={false} isModal={false} accessibilityLabel="Notifications">
      <DrawerHeader title="Notifications" subtitle={`Failed runs in the last ${NOTIFY_DAYS} days`} />
      <DrawerBody>
        {items.length === 0 ? (
          <EmptyState asset={<NoNotificationIllustration />} size="Medium" title="You’re all caught up" description={`No runs failed in the last ${NOTIFY_DAYS} days.`} />
        ) : (
          <ActionList accessibilityLabel="Recent failed runs">
            {items.slice(0, PREVIEW).map((e) => {
              const isUnread = e.startedAt > seenAt;
              return (
                <ActionListItem
                  key={e.id}
                  value={e.id}
                  title={`${e.name} failed`}
                  description={`${e.summary.replace(/^Failed at /, 'At ')} · ${timeAgo(e.startedAt)}`}
                  leading={<Indicator color="Negative" emphasis={isUnread ? 'Intense' : 'Subtle'} accessibilityLabel={isUnread ? 'Unread' : 'Read'} />}
                  onClick={() => { onDismiss(); navigate(runPath(e.workflowId, e.id)); }}
                />
              );
            })}
          </ActionList>
        )}
      </DrawerBody>
      {items.length > 0 && (
        <DrawerFooter>
          <Button variant="secondary" tone="neutral" label={items.length > PREVIEW ? `View all ${items.length} in Run history` : 'Open Run history'} onClick={showAll} />
        </DrawerFooter>
      )}
    </Drawer>
  );
}
