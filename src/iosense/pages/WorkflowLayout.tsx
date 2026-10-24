import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, NotFound404Illustration, Spinner } from '@faclon-labs/fds';
import { getNode } from '../engine/graph';
import { useIoWorkflows } from '../store/workflowStore';
import { useIosenseReady } from '../seed/useIosenseReady';
import { drawerWidth, useWidthClass } from '../lib/useViewportWidth';
import { linkProps, listPath } from '../lib/links';
import { WorkflowProvider, useWorkflow } from './WorkflowContext';
import { EditorView } from './EditorView';
import { useTestRun } from './useTestRun';
import { TestDataModal } from './TestDataModal';

/** A workflow: one page, the canvas. Its runs open in a History drawer (…/executions). */
export function WorkflowLayout() {
  const ready = useIosenseReady();
  const navigate = useNavigate();
  const { id } = useParams();
  const workflow = useIoWorkflows((s) => s.workflows.find((w) => w.id === id));

  if (!ready) {
    return (
      <div className="io-center">
        <Spinner size="Large" label="Loading workflow…" delay={300} />
      </div>
    );
  }
  if (!workflow) {
    return (
      <div className="io-center">
        <EmptyState asset={<NotFound404Illustration />} title="Workflow not found" description="It may have been deleted, or the link is wrong.">
          <Button label="Back to workflows" {...linkProps(navigate, listPath())} />
        </EmptyState>
      </div>
    );
  }
  return (
    <WorkflowProvider key={workflow.id} workflow={workflow}>
      <WorkflowFrame />
    </WorkflowProvider>
  );
}

function WorkflowFrame() {
  const { pathname } = useLocation();
  const { selection, editor, announcement } = useWorkflow();
  const width = useWidthClass();
  const test = useTestRun();
  const historyOpen = /\/executions\/?$/.test(pathname);
  const drawerOpen = selection?.kind === 'node' && !!getNode(editor.graph, selection.id);
  const rightInset = drawerOpen && width !== 'xs' ? drawerWidth(width) : 0;

  return (
    <div className="io-workflow">
      <EditorView rightInset={rightInset} onRetest={test.retest} onTest={test.start} isTesting={test.isRunning} historyOpen={historyOpen} />
      <TestDataModal state={test.dataRequest} onRun={test.runWith} onDismiss={test.cancel} />
      <div className="r-sr-only" role="status" aria-live="polite">{announcement}</div>
    </div>
  );
}
