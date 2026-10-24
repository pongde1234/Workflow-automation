import { useRef, useState, type RefObject } from 'react';
import {
  ActionList, ActionListItem, AutoComplete, DropdownMenu, DropdownMenuOverlay, DropdownMenuTrigger, IconButton, Tooltip,
  type TextInputKeyDownMeta,
} from '@faclon-labs/fds';
import { Braces } from 'lucide-react';
import type { Graph, IoUser, TriggerVariable, WfNode } from '../domain/types';
import { tokenFor } from '../domain/variables';
import { TIME_OPTIONS, formatTime } from '../engine/schedule';
import type { SummaryContext } from '../canvas/summary';

export interface NodeFormProps<N extends WfNode> {
  node: N;
  ctx: SummaryContext;
  /** The error to show for a field (after it was touched, or after Test/Publish). */
  errorFor: (field: string) => string | undefined;
  touch: (field: string) => void;
  onConfig: (patch: Partial<N['config']>, mergeKey?: string) => void;
  onGraph: (fn: (g: Graph) => Graph, mergeKey?: string) => void;
  newId: (prefix: string) => string;
}

/** FDS input props for a field's validation state. */
export const errorProps = (error?: string) => ({ validationState: error ? ('error' as const) : ('none' as const), errorText: error });

/**
 * Time of day as a typeable list of 15-minute steps. FDS has no time input
 * yet (DatePicker guard: "nothing yet"), so this is AutoComplete per its guard.
 */
export function TimeField({ value, onChange, error }: { value: string; onChange: (t: string) => void; error?: string }) {
  return (
    <DropdownMenu selectionType="single" value={value ? [value] : []} onChange={({ values }) => values[0] && onChange(values[0])}>
      <AutoComplete label="Time" placeholder="Search a time" isRequired necessityIndicator="required" {...errorProps(error)} />
      <DropdownMenuOverlay>
        <ActionList>
          {TIME_OPTIONS.map((t) => <ActionListItem key={t} value={t} title={formatTime(t)} />)}
        </ActionList>
      </DropdownMenuOverlay>
    </DropdownMenu>
  );
}

/** People from iosense, several at once (AutoComplete in a multiple-select DropdownMenu, as Email's To). */
export function PeopleField({ label, users, value, onChange, describe, helpText, error, isRequired }: {
  label: string;
  users: IoUser[];
  /** `user:<id>` refs. */
  value: string[];
  onChange: (refs: string[]) => void;
  describe: (u: IoUser) => string;
  helpText?: string;
  error?: string;
  isRequired?: boolean;
}) {
  return (
    <DropdownMenu selectionType="multiple" value={value} onChange={({ values }) => onChange(values)}>
      <AutoComplete
        label={label}
        placeholder="Search people"
        maxRows="expandable"
        helpText={helpText}
        {...(isRequired ? { isRequired: true, necessityIndicator: 'required' as const } : {})}
        {...errorProps(error)}
      />
      <DropdownMenuOverlay>
        <ActionList>
          {users.map((u) => <ActionListItem key={u.id} value={`user:${u.id}`} title={u.name} description={describe(u)} />)}
        </ActionList>
      </DropdownMenuOverlay>
    </DropdownMenu>
  );
}

/** Inserts `{{Label}}` at the caret of a text field. */
export function insertAtCaret(el: HTMLInputElement | HTMLTextAreaElement | null, current: string, token: string): { value: string; caret: number } {
  const start = el?.selectionStart ?? current.length;
  const end = el?.selectionEnd ?? current.length;
  return { value: current.slice(0, start) + token + current.slice(end), caret: start + token.length };
}

interface InsertValueOptions {
  vars: TriggerVariable[];
  fieldRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string;
  onInsert: (next: string) => void;
  /** The field's label, for the button's accessible name. */
  label: string;
}

/** A "/" opens the menu only at the start of a word, so "24/7" and "http://" stay plain text. */
const opensMenu = (value: string, at: number) => at === 0 || /\s/.test(value[at - 1] ?? '');

/**
 * Inserts the trigger's values (`{{Machine ID}}`) into a text field: from the
 * { } icon in the label row, or by typing "/" at the start of a word, which
 * the chosen value then replaces. Escape keeps the "/" as typed.
 */
export function useInsertValue({ vars, fieldRef, value, onInsert, label }: InsertValueOptions) {
  const [isOpen, setOpen] = useState(false);
  /** Where the "/" that opened the menu sits, while the menu is up. */
  const slashAt = useRef<number | null>(null);
  /** Caret to restore in the field once the menu has closed (the menu hands focus back to its button first). */
  const returnCaret = useRef<number | null>(null);

  const focusField = (caret: number) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = fieldRef.current;
      el?.focus();
      el?.setSelectionRange(caret, caret);
    }));
  };

  const onKeyDown = ({ key, event }: TextInputKeyDownMeta) => {
    if (key !== '/' || event.ctrlKey || event.metaKey || event.altKey || vars.length === 0) return;
    const text = fieldRef.current?.value ?? value;
    const at = fieldRef.current?.selectionStart ?? text.length;
    if (!opensMenu(text, at)) return;
    slashAt.current = at;
    returnCaret.current = at + 1;
    // Let the "/" land in the field first.
    window.setTimeout(() => setOpen(true), 0);
  };

  const pick = (v: TriggerVariable) => {
    const token = tokenFor(v);
    const text = fieldRef.current?.value ?? value;
    const s = slashAt.current;
    let next: string;
    let caret: number;
    if (s !== null && text[s] === '/') {
      next = text.slice(0, s) + token + text.slice(s + 1);
      caret = s + token.length;
    } else {
      ({ value: next, caret } = insertAtCaret(fieldRef.current, text, token));
    }
    slashAt.current = null;
    returnCaret.current = caret;
    onInsert(next);
  };

  const onOpenChange = ({ isOpen: open }: { isOpen: boolean }) => {
    setOpen(open);
    if (open) return;
    if (returnCaret.current !== null) focusField(returnCaret.current);
    slashAt.current = null;
    returnCaret.current = null;
  };

  const button = vars.length === 0 ? null : (
    <DropdownMenu isOpen={isOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger>
        <Tooltip content="Insert a value (or type /)">
          <IconButton icon={Braces} size="Medium" accessibilityLabel={`Insert a value into ${label}`} onClick={() => {}} />
        </Tooltip>
      </DropdownMenuTrigger>
      <DropdownMenuOverlay>
        <ActionList>
          {vars.map((v) => <ActionListItem key={v.id} value={v.id} title={v.label} description={tokenFor(v)} onClick={() => pick(v)} />)}
        </ActionList>
      </DropdownMenuOverlay>
    </DropdownMenu>
  );

  return { onKeyDown, button, placeholder: vars.length ? 'Type / to insert a value' : undefined };
}
