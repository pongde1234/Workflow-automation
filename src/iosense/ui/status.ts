import type { BadgeColor, IndicatorColor } from '@faclon-labs/fds';
import type { ExecutionStatus, NodeRunStatus, WorkflowStatus } from '../domain/types';

/* One place for status words and colours (FDS Badge/Indicator R6–R11). */

export const WORKFLOW_STATUS: Record<WorkflowStatus, { label: string; color: BadgeColor }> = {
  draft: { label: 'Draft', color: 'Neutral' },
  active: { label: 'Active', color: 'Positive' },
  paused: { label: 'Paused', color: 'Notice' },
};

export const EXECUTION_STATUS: Record<ExecutionStatus, { label: string; color: BadgeColor & IndicatorColor }> = {
  running: { label: 'Running', color: 'Information' },
  success: { label: 'Succeeded', color: 'Positive' },
  failed: { label: 'Failed', color: 'Negative' },
};

export const NODE_RUN_STATUS: Record<NodeRunStatus, { label: string; color: BadgeColor & IndicatorColor }> = {
  queued: { label: 'Queued', color: 'Neutral' },
  running: { label: 'Running', color: 'Information' },
  success: { label: 'Succeeded', color: 'Positive' },
  failed: { label: 'Failed', color: 'Negative' },
  skipped: { label: 'Skipped', color: 'Neutral' },
  not_run: { label: 'Not run', color: 'Neutral' },
};

export const SOURCE_LABEL = { test: 'Test run', schedule: 'Schedule', form: 'Form submission', device: 'Device alert' } as const;
