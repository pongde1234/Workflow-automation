import { useId, useRef, useState, type FormEvent } from 'react';
import { Button, LinkButton, Modal, ModalBody, ModalFooter, ModalHeader, TextArea, TextInput } from '@faclon-labs/fds';
import { LayoutTemplate } from 'lucide-react';

export interface WorkflowDraft { name: string; description: string }

interface WorkflowFormModalProps {
  mode: 'create' | 'edit';
  isOpen: boolean;
  /** Lives in the parent: a Modal unmounts on close, and typed text must survive Cancel. */
  draft: WorkflowDraft;
  onDraftChange: (d: WorkflowDraft) => void;
  onSubmit: (d: WorkflowDraft) => void;
  onDismiss: () => void;
  /** Create only: leave this form for the template gallery. */
  onTemplates?: () => void;
}

const MAX_NAME = 80;

/** Create a workflow, or edit one's name and description (FormGroup pattern P1 inside a Modal). */
export function WorkflowFormModal({ mode, isOpen, draft, onDraftChange, onSubmit, onDismiss, onTemplates }: WorkflowFormModalProps) {
  const formId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = draft.name.trim();
    const problem = !name ? 'Enter a name for the workflow.' : name.length > MAX_NAME ? `Use ${MAX_NAME} characters or fewer.` : undefined;
    if (problem) {
      setError(problem);
      nameRef.current?.focus();
      return;
    }
    setError(undefined);
    onSubmit({ name, description: draft.description.trim() });
  };

  const dismiss = () => {
    setError(undefined);
    onDismiss();
  };

  return (
    <Modal isOpen={isOpen} onDismiss={dismiss} size="md" initialFocusRef={nameRef}>
      <ModalHeader title={mode === 'create' ? 'Create workflow' : 'Edit workflow'} />
      <ModalBody>
        <form id={formId} className="io-form" onSubmit={submit} noValidate>
          <TextInput
            ref={nameRef}
            label="Name"
            isRequired
            necessityIndicator="required"
            placeholder="e.g. Critical breakdown alerts"
            value={draft.name}
            onChange={({ value }) => {
              onDraftChange({ ...draft, name: value ?? '' });
              if (error) setError(undefined);
            }}
            validationState={error ? 'error' : 'none'}
            errorText={error}
          />
          <TextArea
            label="Description"
            helpText="Optional. Shown under the name in the list."
            maxCharacters={200}
            numberOfLines={2}
            value={draft.description}
            onChange={({ value }) => onDraftChange({ ...draft, description: value ?? '' })}
          />
        </form>
        {mode === 'create' && onTemplates && (
          <span className="io-form__alt">
            <LinkButton label="Start from a template instead" icon={<LayoutTemplate size={12} />} onClick={() => { setError(undefined); onTemplates(); }} />
          </span>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" tone="neutral" label="Cancel" onClick={dismiss} />
        <Button type="submit" form={formId} label={mode === 'create' ? 'Create workflow' : 'Save'} />
      </ModalFooter>
    </Modal>
  );
}
