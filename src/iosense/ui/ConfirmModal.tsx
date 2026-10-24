import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@faclon-labs/fds';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

/**
 * A destructive confirmation (Modal R9, R20, R23): small, Cancel paired as a
 * neutral primary, and focus left on the close button, never on the action.
 */
export function ConfirmModal({ isOpen, title, message, confirmLabel, onConfirm, onDismiss }: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onDismiss={onDismiss} size="sm">
      <ModalHeader title={title} />
      <ModalBody>
        <p className="BodyMediumRegular">{message}</p>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" tone="neutral" label="Cancel" onClick={onDismiss} />
        <Button variant="primary" tone="negative" label={confirmLabel} onClick={onConfirm} />
      </ModalFooter>
    </Modal>
  );
}
