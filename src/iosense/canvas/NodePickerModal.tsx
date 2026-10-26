import { useEffect, useRef, useState } from 'react';
import { ActionList, ActionListItem, ActionListSection, LinkButton, Modal, ModalBody, ModalHeader, SearchInput } from '@faclon-labs/fds';
import { NODE_TYPES, PICKER_SECTIONS, searchNodeTypes, type AddableType, type PickerSection } from '../domain/nodeTypes';
import { useWidthClass } from '../lib/useViewportWidth';
import { NodeTile } from '../ui/NodeTile';

interface NodePickerModalProps {
  isOpen: boolean;
  /** Where the new node goes, e.g. "After ‘Check severity’". */
  context?: string;
  onPick: (type: AddableType) => void;
  onDismiss: () => void;
}

/** Actions on the left (who to tell, what to raise), flow control on the right. */
const COLUMNS: PickerSection[][] = [['notify', 'operations'], ['flow']];

/**
 * "Add a node": a search and the node types under section headings, in two
 * columns (FDS Modal lg: "two panes side by side"). Enter in the search picks
 * the first match. No category sidebar: with a handful of nodes the headings
 * do that job (the same call FDS made for AppCenter).
 */
export function NodePickerModal({ isOpen, context, onPick, onDismiss }: NodePickerModalProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const width = useWidthClass();
  const narrow = width === 'xs' || width === 'sm';
  const [query, setQuery] = useState('');
  useEffect(() => { if (isOpen) setQuery(''); }, [isOpen]);

  const matches = searchNodeTypes(query) as AddableType[];
  const columns = COLUMNS.map((ids) => ids
    .map((id) => ({ ...PICKER_SECTIONS.find((s) => s.id === id)!, types: matches.filter((t) => NODE_TYPES[t].section === id) }))
    .filter((s) => s.types.length > 0))
    .filter((sections) => sections.length > 0);

  return (
    <Modal isOpen={isOpen} onDismiss={onDismiss} size="lg" initialFocusRef={searchRef}>
      <ModalHeader title="Add a node" subtitle={context} />
      <ModalBody>
        <div className="io-picker">
          <SearchInput
            ref={searchRef}
            accessibilityLabel="Search nodes"
            placeholder="Search, e.g. text, work order, wait"
            value={query}
            onChange={({ value }) => setQuery(value ?? '')}
            onSubmit={() => matches[0] && onPick(matches[0])}
          />
          {columns.length === 0 ? (
            <div className="io-picker__empty">
              <p className="BodyMediumRegular">No node matches ‘{query.trim()}’.</p>
              <LinkButton size="sm" label="Clear search" onClick={() => setQuery('')} />
            </div>
          ) : (
            <div className="io-picker__columns" data-narrow={narrow || undefined}>
              {columns.map((sections) => (
                // One list per section: ActionList draws a divider between its own sections, which would
                // run across only one column. The headings already separate the groups.
                <div key={sections[0].id} className="io-picker__column">
                  {sections.map((s) => (
                    <ActionList key={s.id} accessibilityLabel={s.title}>
                      <ActionListSection title={s.title}>
                        {s.types.map((t) => (
                          <ActionListItem
                            key={t}
                            value={t}
                            title={NODE_TYPES[t].label}
                            description={NODE_TYPES[t].description}
                            leading={<NodeTile type={t} />}
                            onClick={() => onPick(t)}
                          />
                        ))}
                      </ActionListSection>
                    </ActionList>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}
