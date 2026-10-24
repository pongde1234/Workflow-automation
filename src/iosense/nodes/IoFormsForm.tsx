import { ActionList, ActionListItem, DropdownMenu, DropdownMenuOverlay, SelectInput } from '@faclon-labs/fds';
import type { IoFormsNode } from '../domain/types';
import { errorProps, type NodeFormProps } from './fields';

export function IoFormsForm({ node, ctx, errorFor, touch, onConfig }: NodeFormProps<IoFormsNode>) {
  if (ctx.forms.length === 0) {
    return <p className="BodyMediumRegular">No forms available. Create or select a form to configure this trigger.</p>;
  }
  return (
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
          helpText="Runs each time this form is submitted. Its fields become values the next nodes can use."
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
  );
}
