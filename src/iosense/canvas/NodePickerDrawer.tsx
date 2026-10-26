import { useEffect, useRef, useState } from 'react';
import { ActionList, ActionListItem, ActionListItemIcon, ActionListSection, Drawer, DrawerBody, DrawerHeader, LinkButton, SearchInput } from '@faclon-labs/fds';
import type { NodeType } from '../domain/types';
import { NODE_TYPES, PICKER_SECTIONS, TRIGGER_TYPES, searchNodeTypes } from '../domain/nodeTypes';
import { NODE_ICON } from '../ui/nodeIcons';

/** The triggers, for a workflow's first step; or everything that can follow a node. */
export type PickerKind = 'trigger' | 'next';

const COPY: Record<PickerKind, { title: string; subtitle: string; search: string }> = {
  trigger: { title: 'What triggers this workflow?', subtitle: 'A trigger is the step that starts your workflow.', search: 'Search triggers' },
  next: { title: 'What happens next?', subtitle: 'Pick the step that runs after this one.', search: 'Search, e.g. text, work order, wait' },
};

/**
 * Adding a step, in a drawer beside the canvas rather than a window over it: a
 * search, then the steps that fit here, each with its icon and what it does.
 * Like the node's settings it has no scrim (Drawer R8), so the canvas stays
 * in view. Enter in the search picks the first match.
 */
export function NodePickerDrawer({ kind, context, onPick, onDismiss }: {
  /** Which list to show; null keeps the drawer closed. */
  kind: PickerKind | null;
  /** Where the new step goes, e.g. "After ‘Check severity’"; shown in place of the subtitle. */
  context?: string;
  onPick: (type: NodeType) => void;
  onDismiss: () => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  useEffect(() => { if (kind) setQuery(''); }, [kind]);
  // Keep the last list while the drawer animates out.
  const last = useRef<PickerKind>('next');
  if (kind) last.current = kind;
  const shown = last.current;
  const copy = COPY[shown];

  const matches = searchNodeTypes(query, shown === 'trigger' ? TRIGGER_TYPES : undefined);
  const item = (t: NodeType) => (
    <ActionListItem
      key={t}
      value={t}
      title={NODE_TYPES[t].label}
      description={NODE_TYPES[t].description}
      // The row's own icon slot (ActionList guard: leading takes its slot components, at their locked size, so rows line up).
      leading={<ActionListItemIcon icon={NODE_ICON[t]} />}
      onClick={() => onPick(t)}
    />
  );

  return (
    <Drawer isOpen={!!kind} onDismiss={onDismiss} showOverlay={false} isModal={false} initialFocusRef={searchRef}>
      <DrawerHeader title={copy.title} subtitle={context ?? copy.subtitle} />
      <DrawerBody>
        <div className="io-picker">
          <SearchInput
            ref={searchRef}
            accessibilityLabel={copy.search}
            placeholder={copy.search}
            value={query}
            onChange={({ value }) => setQuery(value ?? '')}
            onSubmit={() => matches[0] && onPick(matches[0])}
          />
          {matches.length === 0 ? (
            <div className="io-picker__empty">
              <p className="BodyMediumRegular">Nothing matches ‘{query.trim()}’.</p>
              <LinkButton size="sm" label="Clear search" onClick={() => setQuery('')} />
            </div>
          ) : shown === 'trigger' ? (
            <ActionList accessibilityLabel="Triggers">{matches.map(item)}</ActionList>
          ) : (
            <ActionList accessibilityLabel="Steps">
              {PICKER_SECTIONS.map((s) => {
                const types = matches.filter((t) => NODE_TYPES[t].section === s.id);
                return types.length > 0 && <ActionListSection key={s.id} title={s.title}>{types.map(item)}</ActionListSection>;
              })}
            </ActionList>
          )}
        </div>
      </DrawerBody>
    </Drawer>
  );
}
