import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  ActionList, ActionListItem, Button, DatePicker, DropdownMenu, DropdownMenuOverlay, Modal, ModalBody, ModalFooter, ModalHeader,
  SelectInput, TextArea, TextInput,
} from '@faclon-labs/fds';
import type { DeviceAlertNode, IoFormField } from '../domain/types';
import { useIoWorkflows } from '../store/workflowStore';
import { toDayKey, toNumber } from '../engine/operators';
import { toYmd } from '../engine/schedule';
import { crossesLimit, withUnit } from '../engine/nodeText';
import { errorProps } from '../nodes/fields';
import type { TestDataRequest } from './useTestRun';

interface TestDataModalProps {
  state: TestDataRequest | null;
  onRun: (data: Record<string, unknown>) => void;
  onDismiss: () => void;
}

const asText = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/**
 * Sample data for a test run, pre-filled and editable so people can steer a
 * Switch: a form submission, or the reading a Device alert reacts to.
 */
export function TestDataModal({ state, onRun, onDismiss }: TestDataModalProps) {
  const formId = useId();
  const forms = useIoWorkflows((s) => s.forms);
  const trigger = state?.trigger;
  const form = trigger?.type === 'ioForms' ? forms.find((f) => f.id === trigger.config.formId) : undefined;
  const [values, setValues] = useState<Record<string, string>>({});
  const [readingError, setReadingError] = useState<string>();

  useEffect(() => {
    if (state) setValues(Object.fromEntries(Object.entries(state.data).map(([k, v]) => [k, asText(v)])));
    setReadingError(undefined);
  }, [state]);

  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!state) return;
    if (trigger?.type === 'deviceAlert') {
      const error = readingProblem(trigger, state.data, values.reading ?? '');
      setReadingError(error);
      if (!error) onRun({ ...state.data, reading: toNumber(values.reading) });
      return;
    }
    const data: Record<string, unknown> = {};
    for (const f of form?.fields ?? []) {
      const raw = values[f.key] ?? '';
      data[f.key] = f.type === 'number' && raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw;
    }
    onRun(data);
  };

  const field = (f: IoFormField) => {
    const value = values[f.key] ?? '';
    const common = { label: f.label, helpText: f.required ? undefined : 'Optional on the form' };
    switch (f.type) {
      case 'select':
        return (
          <DropdownMenu key={f.key} selectionType="single" value={value ? [value] : []} onChange={({ values: vs }) => set(f.key, vs[0] ?? '')}>
            <SelectInput {...common} />
            <DropdownMenuOverlay>
              <ActionList>{(f.options ?? []).map((o) => <ActionListItem key={o} value={o} title={o} />)}</ActionList>
            </DropdownMenuOverlay>
          </DropdownMenu>
        );
      case 'textarea':
        return <TextArea key={f.key} {...common} numberOfLines={2} value={value} onChange={({ value: v }) => set(f.key, v ?? '')} />;
      case 'date': {
        const k = toDayKey(value);
        const d = k ? new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10))) : null;
        return <DatePicker key={f.key} {...common} value={d} onChange={(nd) => set(f.key, nd ? toYmd(nd) : '')} />;
      }
      default:
        return (
          <TextInput
            key={f.key}
            {...common}
            type={f.type === 'number' ? 'number' : 'text'}
            value={value}
            onChange={({ value: v }) => set(f.key, v ?? '')}
          />
        );
    }
  };

  const data = state?.data ?? {};
  const unit = asText(data.unit);
  const subtitle = trigger?.type === 'deviceAlert'
    ? `A reading from ${asText(data.device)}. Change it to try another value.`
    : form ? `Sample submission of ‘${form.name}’. Change any value to try another path.` : undefined;

  return (
    <Modal isOpen={!!state} onDismiss={onDismiss}>
      <ModalHeader title="Test workflow" subtitle={subtitle} />
      <ModalBody>
        <form id={formId} className="io-form" onSubmit={submit} noValidate>
          {trigger?.type === 'deviceAlert' ? (
            <TextInput
              label={unit ? `${asText(data.parameter)} (${unit})` : asText(data.parameter)}
              type="number"
              isRequired
              necessityIndicator="required"
              value={values.reading ?? ''}
              helpText={`${trigger.config.op === 'above' ? 'Above' : 'Below'} ${withUnit(asText(data.limit), unit)} runs this workflow.`}
              onChange={({ value }) => { set('reading', value ?? ''); setReadingError(undefined); }}
              {...errorProps(readingError)}
            />
          ) : (form?.fields ?? []).map(field)}
          <p className="io-muted BodySmallRegular">This is a simulated run. Nothing is sent.</p>
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" tone="neutral" label="Cancel" onClick={onDismiss} />
        <Button type="submit" form={formId} label="Run test" />
      </ModalFooter>
    </Modal>
  );
}

/** Why a typed reading can't start the workflow, if it can't. */
function readingProblem(trigger: DeviceAlertNode, data: Record<string, unknown>, raw: string): string | undefined {
  const reading = toNumber(raw);
  if (!raw.trim()) return 'Enter a reading.';
  if (!Number.isFinite(reading)) return 'Enter a number.';
  const limit = Number(data.limit);
  if (!crossesLimit(trigger.config.op, reading, limit)) {
    return `Enter a reading ${trigger.config.op} ${withUnit(limit, asText(data.unit))}. Anything else wouldn’t start this workflow.`;
  }
  return undefined;
}
