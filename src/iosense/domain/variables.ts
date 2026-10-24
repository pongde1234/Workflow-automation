import type { DataType, FormFieldType, IoForm, TriggerNode, TriggerVariable, WfNode } from './types';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const FIELD_TYPE: Record<FormFieldType, DataType> = {
  text: 'text', textarea: 'text', email: 'text', number: 'number', date: 'date', select: 'choice',
};

const plain = (id: string, label: string, type: DataType = 'text'): TriggerVariable => ({ id, label, type, isEmail: false, required: true });

/** What a Device alert hands on: the reading and the limit it crossed. */
export const DEVICE_VARIABLES: TriggerVariable[] = [
  plain('device.name', 'Device'),
  plain('device.location', 'Location'),
  plain('device.parameter', 'Parameter'),
  plain('device.reading', 'Reading', 'number'),
  plain('device.limit', 'Limit', 'number'),
  plain('device.unit', 'Unit'),
  plain('device.time', 'Alert time'),
];

/** The values a trigger hands to the nodes after it. */
export function triggerVariables(trigger: WfNode | undefined, forms: IoForm[]): TriggerVariable[] {
  if (!trigger) return [];
  if (trigger.type === 'ioForms') {
    const form = forms.find((f) => f.id === trigger.config.formId);
    return (form?.fields ?? []).map((f) => ({
      id: `form.${f.key}`,
      label: f.label,
      type: FIELD_TYPE[f.type],
      isEmail: f.type === 'email',
      required: f.required,
      ...(f.options ? { options: f.options } : {}),
    }));
  }
  if (trigger.type === 'scheduler') {
    return [
      plain('run.date', 'Run date', 'date'),
      { ...plain('run.weekday', 'Run weekday', 'choice'), options: WEEKDAYS },
      plain('run.time', 'Run time'),
    ];
  }
  if (trigger.type === 'deviceAlert') return DEVICE_VARIABLES;
  return [];
}

export const isTriggerNode = (n: WfNode | undefined): n is TriggerNode => n?.type === 'ioForms' || n?.type === 'scheduler' || n?.type === 'deviceAlert';

/** `{{Label}}` token text for a variable. */
export const tokenFor = (v: TriggerVariable) => `{{${v.label}}}`;
