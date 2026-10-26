import { ActionList, ActionListItem, DropdownMenu, DropdownMenuOverlay, SelectInput, Table, type TableColumn } from '@faclon-labs/fds';
import type { FormFieldType, IoFormField, IoFormsNode } from '../domain/types';
import { errorProps, type NodeFormProps } from './fields';

const TYPE_LABEL: Record<FormFieldType, string> = {
  text: 'Text', textarea: 'Long text', number: 'Number', email: 'Email', date: 'Date', select: 'Choice',
};

/** The chosen form's fields: what a submission hands on to the next nodes. */
const FIELD_COLUMNS: TableColumn<IoFormField>[] = [
  { key: 'label', header: 'Field', isRowHeader: true, emphasis: 'normal', description: (f) => (f.options ? f.options.join(', ') : undefined) },
  { key: 'type', header: 'Type', cell: (f) => TYPE_LABEL[f.type], measureText: (f) => TYPE_LABEL[f.type] },
  { key: 'required', header: 'On the form', emphasis: 'muted', cell: (f) => (f.required ? 'Required' : 'Optional'), measureText: (f) => (f.required ? 'Required' : 'Optional') },
];

export function IoFormsForm({ node, ctx, errorFor, touch, onConfig }: NodeFormProps<IoFormsNode>) {
  if (ctx.forms.length === 0) {
    return <p className="BodyMediumRegular">No forms available. Create or select a form to configure this trigger.</p>;
  }
  const form = ctx.forms.find((f) => f.id === node.config.formId);
  return (
    <>
      <div data-field="formId">
        <DropdownMenu
          selectionType="single"
          value={node.config.formId ? [node.config.formId] : []}
          onChange={({ values }) => { touch('formId'); onConfig({ formId: values[0] ?? null }); }}
        >
          <SelectInput
            label="Form"
            placeholder="Choose a form"
            isRequired
            necessityIndicator="required"
            helpText="Runs each time this form is submitted."
            {...errorProps(errorFor('formId'))}
          />
          <DropdownMenuOverlay>
            <ActionList>
              {ctx.forms.map((f) => (
                <ActionListItem key={f.id} value={f.id} title={f.name} description={`${f.fields.length} fields`} />
              ))}
            </ActionList>
          </DropdownMenuOverlay>
        </DropdownMenu>
      </div>
      {form && (
        <section className="io-preview" aria-label="Values from this form">
          <div className="io-preview__head">
            <h3 className="BodyMediumSemibold">Values from this form</h3>
            <p className="io-muted BodySmallRegular">Each submission hands these on. Insert them into later nodes with {'{ }'} or by typing /.</p>
          </div>
          <Table<IoFormField> accessibilityLabel={`Fields of ${form.name}`} data={form.fields} columns={FIELD_COLUMNS} getRowId={(f) => f.key} rowDensity="expanded" />
        </section>
      )}
    </>
  );
}
