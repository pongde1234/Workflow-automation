import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ActionList, ActionListItem, ActionListItemIcon, ActionListSection, Button, DropdownMenu, DropdownMenuHeader,
  DropdownMenuOverlay, DropdownMenuTrigger, Indicator, LinkButton, Switch, toastStore,
} from '@faclon-labs/fds';
import { Check, CircleAlert, Ellipsis, FlaskConical, History, RotateCcw, Settings, TriangleAlert } from 'lucide-react';
import { getNode } from '../engine/graph';
import { NODE_TYPES } from '../domain/nodeTypes';
import { hasUnpublishedChanges, useIoWorkflows } from '../store/workflowStore';
import { useIoExecutions } from '../store/executionStore';
import { historyPath, linkProps } from '../lib/links';
import { useWidthClass } from '../lib/useViewportWidth';
import { ConfirmModal } from '../ui/ConfirmModal';
import { useWorkflow } from './WorkflowContext';
import { SettingsModal } from './SettingsModal';

/**
 * Test and Publish, gated: when something must be fixed first they open the
 * issues menu headed "Fix these to continue" instead. Shared by the floating
 * controls and anything else that offers a test (the History drawer).
 */
export function useWorkflowActions(onTest: () => void) {
  const { workflow, editor, blocking, setShowAllErrors } = useWorkflow();
  const [issuesOpen, setIssuesOpenState] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const gate = () => {
    editor.flush();
    if (blocking.length === 0) return true;
    if (editor.latest.current.nodes.length === 0) {
      toastStore.show({ color: 'Negative', content: 'Add a trigger first: pick one on the canvas.' });
      return false;
    }
    setShowAllErrors(true);
    setBlocked(true);
    setIssuesOpenState(true);
    return false;
  };

  return {
    test: () => { if (gate()) onTest(); },
    publish: () => {
      if (!gate()) return;
      const ok = useIoWorkflows.getState().publish(workflow.id, editor.latest.current);
      if (ok) toastStore.show({ color: 'Positive', content: 'Workflow published. In this prototype nothing runs on a server.' });
      else toastStore.show({ color: 'Negative', content: 'Couldn’t publish: this browser’s storage didn’t accept the change. Try again.' });
    },
    issuesOpen,
    blocked,
    setIssuesOpen: (open: boolean) => { setIssuesOpenState(open); if (!open) setBlocked(false); },
  };
}

export type WorkflowActions = ReturnType<typeof useWorkflowActions>;

interface WorkflowControlsProps {
  actions: WorkflowActions;
  isTesting: boolean;
}

/** How long "Saved" stays after a save; the rest of the time a saved workflow says nothing. */
const SAVED_VISIBLE_MS = 2000;

/**
 * The workflow's bar, above the canvas. It carries no title or back button:
 * the shell's trail names the page and links back to the list. Left: whether
 * the workflow is live, and saving. Right: issues, History, Test, Publish
 * changes and ⋯, the main action last before the overflow. An empty workflow
 * shows neither Test nor History: there is nothing to test or look back on yet,
 * and the canvas says what to do first.
 */
export function WorkflowControls({ actions, isTesting }: WorkflowControlsProps) {
  const { workflow, editor, issues, goToNode } = useWorkflow();
  const navigate = useNavigate();
  const width = useWidthClass();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  // "Saved" shows briefly after each save; while typing (unsaved or saving) it reads "Saving…".
  const [justSaved, setJustSaved] = useState(false);
  const lastSaveState = useRef(editor.saveState);
  useEffect(() => {
    const was = lastSaveState.current;
    lastSaveState.current = editor.saveState;
    if (editor.saveState !== 'saved' || was === 'saved') return undefined;
    setJustSaved(true);
    const t = window.setTimeout(() => setJustSaved(false), SAVED_VISIBLE_MS);
    return () => window.clearTimeout(t);
  }, [editor.saveState]);

  const changed = hasUnpublishedChanges({ ...workflow, graph: editor.graph });
  // A draft goes live from the Active switch; afterwards edits wait for Publish changes.
  const canPublish = workflow.status !== 'draft' && changed;
  const isEmpty = editor.graph.nodes.length === 0;
  const hasRuns = useIoExecutions((s) => s.executions.some((e) => e.workflowId === workflow.id));
  const showHistory = !isEmpty || hasRuns;
  // Phones: icon-only History and Test, and a bare issue count.
  const narrow = width === 'xs' || width === 'sm';

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const onlyWarnings = errors.length === 0;
  const issueWord = onlyWarnings ? (warnings.length === 1 ? 'warning' : 'warnings') : (issues.length === 1 ? 'issue' : 'issues');
  const issueCount = onlyWarnings ? warnings.length : issues.length;

  const issueRow = (i: (typeof issues)[number]) => {
    const node = getNode(editor.graph, i.nodeId);
    return (
      <ActionListItem
        key={i.id}
        value={i.id}
        title={i.message}
        description={node ? `${NODE_TYPES[node.type].label} · ${node.name}` : 'Workflow'}
        leading={<ActionListItemIcon icon={i.severity === 'error' ? CircleAlert : TriangleAlert} />}
        onClick={() => { if (node) goToNode(node.id, i.field); }}
      />
    );
  };

  const saveStatus = editor.saveState === 'error'
    ? (
      <span className="io-controls__save">
        <Indicator color="Negative">Couldn’t save</Indicator>
        <LinkButton size="sm" label="Retry" onClick={() => editor.flush()} />
      </span>
    )
    : editor.saveState !== 'saved' || justSaved
      ? (
        <span className="io-controls__save BodySmallRegular" data-state={editor.saveState}>
          {editor.saveState === 'saved' && <Check size={16} aria-hidden="true" />}
          {editor.saveState === 'saved' ? 'Saved' : 'Saving…'}
        </span>
      )
      : null;

  return (
    <div className="io-controls" role="toolbar" aria-label="Workflow">
      <div className="io-controls__group io-controls__group--status">
        {/* Every workflow switches between Active and Inactive here. A draft has nothing live to run, so switching it on
            publishes it (through the same checks as Publish); a published one just switches (instant, no toast). */}
        <span className="io-controls__active">
          <Switch
            size="Small"
            accessibilityLabel="Workflow active"
            isChecked={workflow.status === 'active'}
            onChange={({ isChecked }) => {
              if (workflow.status === 'draft') { if (isChecked) actions.publish(); return; }
              useIoWorkflows.getState().setStatus(workflow.id, isChecked ? 'active' : 'paused');
            }}
          />
          <span className="BodySmallMedium">{workflow.status === 'active' ? 'Active' : 'Inactive'}</span>
        </span>
        <div aria-live="polite">{saveStatus}</div>
      </div>

      <div className="io-controls__group">
        {issues.length > 0 && editor.graph.nodes.length > 0 && (
          <DropdownMenu isOpen={actions.issuesOpen} onOpenChange={({ isOpen }) => actions.setIssuesOpen(isOpen)}>
            <DropdownMenuTrigger>
              <Button
                variant="ghost"
                tone="notice"
                label={narrow ? String(issueCount) : `${issueCount} ${issueWord}`}
                aria-label={`${issueCount} ${issueWord}`}
                leadingIcon={<TriangleAlert size={16} />}
              />
            </DropdownMenuTrigger>
            <DropdownMenuOverlay maxWidth="calc(var(--spacing-64) * 6)">
              <DropdownMenuHeader title={actions.blocked ? 'Fix these to continue' : 'Issues'} subtitle={actions.blocked ? 'Errors stop the test and publishing. Warnings don’t.' : undefined} />
              <ActionList>
                {errors.length > 0 && <ActionListSection title="Errors">{errors.map(issueRow)}</ActionListSection>}
                {warnings.length > 0 && <ActionListSection title="Warnings">{warnings.map(issueRow)}</ActionListSection>}
              </ActionList>
            </DropdownMenuOverlay>
          </DropdownMenu>
        )}
        {/* On phones History moves into ⋯ so the bar stays one row. */}
        {!narrow && showHistory && <Button variant="ghost" tone="neutral" label="History" leadingIcon={<History size={16} />} {...linkProps(navigate, historyPath(workflow.id))} />}
        {!isEmpty && (narrow
          ? <Button iconOnly variant="primary" tone="neutral" aria-label="Test workflow" leadingIcon={<FlaskConical size={16} />} isLoading={isTesting} onClick={actions.test} />
          : <Button variant="primary" tone="neutral" label="Test workflow" leadingIcon={<FlaskConical size={16} />} isLoading={isTesting} onClick={actions.test} />)}
        {canPublish && <Button label="Publish changes" onClick={actions.publish} />}
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button iconOnly variant="ghost" tone="neutral" aria-label="More workflow actions" leadingIcon={<Ellipsis size={20} />} />
          </DropdownMenuTrigger>
          <DropdownMenuOverlay>
            <ActionList>
              {narrow && showHistory && <ActionListItem title="History" value="history" leading={<ActionListItemIcon icon={History} />} onClick={() => navigate(historyPath(workflow.id))} />}
              <ActionListItem title="Workflow settings" value="settings" leading={<ActionListItemIcon icon={Settings} />} onClick={() => setSettingsOpen(true)} />
              {changed && (
                <ActionListItem title="Discard unpublished changes" value="discard" intent="negative" leading={<ActionListItemIcon icon={RotateCcw} />} onClick={() => setDiscardOpen(true)} />
              )}
            </ActionList>
          </DropdownMenuOverlay>
        </DropdownMenu>
      </div>

      <SettingsModal isOpen={settingsOpen} onDismiss={() => setSettingsOpen(false)} />
      <ConfirmModal
        isOpen={discardOpen}
        title="Discard unpublished changes?"
        message="The editor goes back to the published version. Your unpublished edits can’t be recovered."
        confirmLabel="Discard changes"
        onDismiss={() => setDiscardOpen(false)}
        onConfirm={() => {
          const graph = useIoWorkflows.getState().discardChanges(workflow.id);
          if (graph) editor.update(graph);
          setDiscardOpen(false);
        }}
      />
    </div>
  );
}
