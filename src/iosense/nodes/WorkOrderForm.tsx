import { useRef } from 'react';
import { ActionList, ActionListItem, DropdownMenu, DropdownMenuOverlay, SelectInput, TextArea, TextInput } from '@faclon-labs/fds';
import type { WorkOrderNode, WorkOrderPriority } from '../domain/types';
import { PRIORITY_LABEL } from '../engine/nodeText';
import { errorProps, useInsertValue, type NodeFormProps } from './fields';

const QUEUE = 'queue';
const PRIORITIES = Object.keys(PRIORITY_LABEL) as WorkOrderPriority[];

export function WorkOrderForm({ node, ctx, errorFor, touch, onConfig }: NodeFormProps<WorkOrderNode>) {
  const c = node.config;
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const titleValues = useInsertValue({ vars: ctx.vars, fieldRef: titleRef, value: c.title, label: 'Title', onInsert: (title) => { touch('title'); onConfig({ title }); } });
  const descriptionValues = useInsertValue({ vars: ctx.vars, fieldRef: descriptionRef, value: c.description, label: 'Description', onInsert: (description) => { touch('description'); onConfig({ description }); } });

  return (
    <>
      <div data-field="title">
        <TextInput
          ref={titleRef}
          label="Title"
          isRequired
          necessityIndicator="required"
          value={c.title}
          onChange={({ value }) => onConfig({ title: value ?? '' }, `${node.id}:title`)}
          onBlur={() => touch('title')}
          placeholder={titleValues.placeholder}
          onKeyDown={titleValues.onKeyDown}
          labelTrailing={titleValues.button}
          {...errorProps(errorFor('title'))}
        />
      </div>

      <DropdownMenu selectionType="single" value={[c.priority]} onChange={({ values }) => values[0] && onConfig({ priority: values[0] as WorkOrderPriority })}>
        <SelectInput label="Priority" />
        <DropdownMenuOverlay>
          <ActionList>
            {PRIORITIES.map((p) => <ActionListItem key={p} value={p} title={PRIORITY_LABEL[p]} />)}
          </ActionList>
        </DropdownMenuOverlay>
      </DropdownMenu>

      <div data-field="assignee">
        <DropdownMenu
          selectionType="single"
          value={[c.assignee ?? QUEUE]}
          onChange={({ values }) => { touch('assignee'); onConfig({ assignee: !values[0] || values[0] === QUEUE ? null : values[0] }); }}
        >
          <SelectInput label="Assign to" helpText="The maintenance queue goes to the next free technician." {...errorProps(errorFor('assignee'))} />
          <DropdownMenuOverlay>
            <ActionList>
              <ActionListItem value={QUEUE} title="Maintenance queue" description="Not assigned to anyone yet" />
              {ctx.users.map((u) => <ActionListItem key={u.id} value={u.id} title={u.name} description={u.role} />)}
            </ActionList>
          </DropdownMenuOverlay>
        </DropdownMenu>
      </div>

      <div data-field="description">
        <TextArea
          ref={descriptionRef}
          label="Description"
          numberOfLines={4}
          value={c.description}
          onChange={({ value }) => onConfig({ description: value ?? '' }, `${node.id}:description`)}
          onBlur={() => touch('description')}
          placeholder={descriptionValues.placeholder}
          onKeyDown={descriptionValues.onKeyDown}
          labelTrailing={descriptionValues.button}
          {...errorProps(errorFor('description'))}
        />
      </div>

      <p className="io-muted BodySmallRegular">Work orders are simulated in this prototype. Nothing is created.</p>
    </>
  );
}
