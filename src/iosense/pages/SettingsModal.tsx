import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal, ModalBody, ModalFooter, ModalHeader, TextArea, TextInput, toastStore } from '@faclon-labs/fds';
import { formatRunTime } from '../engine/schedule';
import { useIoWorkflows } from '../store/workflowStore';
import { useIoExecutions } from '../store/executionStore';
import { listPath } from '../lib/links';
import { ConfirmModal } from '../ui/ConfirmModal';
import { WORKFLOW_STATUS } from '../ui/status';
import { useWorkflow } from './WorkflowContext';

/** Workflow-level settings: name, description, read-only details, delete. */
export function SettingsModal({ isOpen, onDismiss }: { isOpen: boolean; onDismiss: () => void }) {
  const { workflow } = useWorkflow();
  const navigate = useNavigate();
  const formId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(workflow.name);
  const [description, setDescription] = useState(workflow.description);
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);

  // Start from the saved values each time it opens.
  useEffect(() => {
    if (!isOpen) return;
    setName(workflow.name);
    setDescription(workflow.description);
    setError(undefined);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Enter a name for the workflow.');
      nameRef.current?.focus();
      return;
    }
    const ok = useIoWorkflows.getState().updateMeta(workflow.id, { name, description });
    if (!ok) toastStore.show({ color: 'Negative', content: 'Couldn’t save the settings to this browser’s storage. Try again.' });
    else onDismiss();
  };

  const executions = useIoExecutions((s) => s.executions.filter((x) => x.workflowId === workflow.id).length);
  const details: [string, string][] = [
    ['Status', WORKFLOW_STATUS[workflow.status].label],
    ['Created', formatRunTime(workflow.createdAt)],
    ['Last updated', formatRunTime(workflow.updatedAt)],
    ['Last published', workflow.published ? formatRunTime(workflow.published.publishedAt) : 'Not published yet'],
  ];

  return (
    <>
      <Modal isOpen={isOpen} onDismiss={onDismiss} initialFocusRef={nameRef}>
        <ModalHeader title="Workflow settings" />
        <ModalBody>
          <form id={formId} className="io-form" onSubmit={submit} noValidate>
            <TextInput
              ref={nameRef}
              label="Name"
              isRequired
              necessityIndicator="required"
              value={name}
              onChange={({ value }) => { setName(value ?? ''); setError(undefined); }}
              validationState={error ? 'error' : 'none'}
              errorText={error}
            />
            <TextArea label="Description" maxCharacters={200} numberOfLines={2} value={description} onChange={({ value }) => setDescription(value ?? '')} />
            <dl className="io-details">
              {details.map(([k, v]) => (
                <div key={k}>
                  <dt className="BodySmallRegular">{k}</dt>
                  <dd className="BodySmallMedium">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="io-muted BodySmallRegular">
              In this prototype everything is stored in this browser. Active workflows don’t run on their own; use Test workflow to try them.
            </p>
            <div>
              <Button variant="secondary" tone="negative" label="Delete workflow" onClick={() => { onDismiss(); setConfirming(true); }} />
            </div>
          </form>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" tone="neutral" label="Cancel" onClick={onDismiss} />
          <Button type="submit" form={formId} label="Save" />
        </ModalFooter>
      </Modal>
      <ConfirmModal
        isOpen={confirming}
        title="Delete workflow?"
        message={`“${workflow.name}” and its ${executions} ${executions === 1 ? 'execution' : 'executions'} will be deleted. This can’t be undone.`}
        confirmLabel="Delete workflow"
        onDismiss={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          navigate(listPath());
          useIoWorkflows.getState().remove(workflow.id);
          useIoExecutions.getState().removeForWorkflow(workflow.id);
          toastStore.show({ color: 'Positive', content: 'Workflow deleted' });
        }}
      />
    </>
  );
}
