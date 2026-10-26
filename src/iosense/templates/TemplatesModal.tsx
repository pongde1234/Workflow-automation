import { Card, CardBody, CardHeader, CardHeaderLeading, Modal, ModalBody, ModalHeader } from '@faclon-labs/fds';
import { flowOrder, getNode } from '../engine/graph';
import { NodeTile } from '../ui/NodeTile';
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from './templates';

/** Each template's steps in flow order, for the row of tiles on its card. */
const STEPS = new Map(WORKFLOW_TEMPLATES.map((t) => {
  const g = t.build();
  return [t.id, flowOrder(g).map((id) => getNode(g, id)!.type)];
}));

/**
 * The template gallery (FDS Modal lg): one Card per template with its name,
 * its steps as role-coloured tiles and what it does. Picking a card uses it;
 * where it goes (this workflow or a new one) is the caller's.
 */
export function TemplatesModal({ isOpen, onPick, onDismiss }: { isOpen: boolean; onPick: (t: WorkflowTemplate) => void; onDismiss: () => void }) {
  return (
    <Modal isOpen={isOpen} onDismiss={onDismiss} size="lg">
      <ModalHeader title="Start from a template" subtitle="Ready-made plant workflows that run as they are. Change anything afterwards." />
      <ModalBody>
        <ul className="io-templates" aria-label="Templates">
          {WORKFLOW_TEMPLATES.map((t) => (
            <li key={t.id}>
              <Card size="Medium" padding={16} height="100%" onClick={() => onPick(t)} accessibilityLabel={`Use template ${t.name}: ${t.description}`}>
                <CardHeader showDivider={false}>
                  <CardHeaderLeading title={t.name} subtitle={`${STEPS.get(t.id)!.length} steps`} />
                </CardHeader>
                <CardBody>
                  <div className="io-template">
                    <span className="io-template__steps" aria-hidden="true">
                      {STEPS.get(t.id)!.map((type, i) => <NodeTile key={i} type={type} size="sm" />)}
                    </span>
                    <p className="io-muted BodySmallRegular">{t.description}</p>
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      </ModalBody>
    </Modal>
  );
}
