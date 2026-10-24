import { useRef } from 'react';
import {
  ActionList, ActionListItem, ActionListSection, AutoComplete, DropdownMenu, DropdownMenuOverlay, TextArea, TextInput,
} from '@faclon-labs/fds';
import type { EmailNode } from '../domain/types';
import { errorProps, useInsertValue, type NodeFormProps } from './fields';

export function EmailForm({ node, ctx, errorFor, touch, onConfig }: NodeFormProps<EmailNode>) {
  const c = node.config;
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const emailFields = ctx.vars.filter((v) => v.isEmail);
  const subjectValues = useInsertValue({ vars: ctx.vars, fieldRef: subjectRef, value: c.subject, label: 'Subject', onInsert: (subject) => { touch('subject'); onConfig({ subject }); } });
  const bodyValues = useInsertValue({ vars: ctx.vars, fieldRef: bodyRef, value: c.body, label: 'Message', onInsert: (body) => { touch('body'); onConfig({ body }); } });

  return (
    <>
      <div data-field="to">
        <DropdownMenu selectionType="multiple" value={c.to} onChange={({ values }) => { touch('to'); onConfig({ to: values }); }}>
          <AutoComplete
            label="To"
            placeholder="Search people or form fields"
            maxRows="expandable"
            helpText="Pick people from iosense, or an email field from the form."
            {...errorProps(errorFor('to'))}
          />
          <DropdownMenuOverlay>
            <ActionList>
              <ActionListSection title="People">
                {ctx.users.map((u) => (
                  <ActionListItem key={u.id} value={`user:${u.id}`} title={u.name} description={`${u.role} · ${u.email}`} />
                ))}
              </ActionListSection>
              {emailFields.length > 0 && (
                <ActionListSection title="From the form">
                  {emailFields.map((v) => (
                    <ActionListItem key={v.id} value={`field:${v.id}`} title={v.label} description={v.required ? 'Form field' : 'Form field, optional on the form'} />
                  ))}
                </ActionListSection>
              )}
            </ActionList>
          </DropdownMenuOverlay>
        </DropdownMenu>
      </div>

      <div data-field="other">
        <TextInput
          label="Other addresses"
          placeholder="name@example.com, name@example.com"
          helpText="Separate addresses with commas."
          value={c.other}
          onChange={({ value }) => onConfig({ other: value ?? '' }, `${node.id}:other`)}
          onBlur={() => touch('other')}
          {...errorProps(errorFor('other'))}
        />
      </div>

      <div data-field="subject">
        <TextInput
          ref={subjectRef}
          label="Subject"
          isRequired
          necessityIndicator="required"
          value={c.subject}
          onChange={({ value }) => onConfig({ subject: value ?? '' }, `${node.id}:subject`)}
          onBlur={() => touch('subject')}
          placeholder={subjectValues.placeholder}
          onKeyDown={subjectValues.onKeyDown}
          labelTrailing={subjectValues.button}
          {...errorProps(errorFor('subject'))}
        />
      </div>

      <div data-field="body">
        <TextArea
          ref={bodyRef}
          label="Message"
          isRequired
          necessityIndicator="required"
          numberOfLines={5}
          value={c.body}
          onChange={({ value }) => onConfig({ body: value ?? '' }, `${node.id}:body`)}
          onBlur={() => touch('body')}
          placeholder={bodyValues.placeholder}
          onKeyDown={bodyValues.onKeyDown}
          labelTrailing={bodyValues.button}
          {...errorProps(errorFor('body'))}
        />
      </div>

      <p className="io-muted BodySmallRegular">Emails are simulated in this prototype. Nothing is sent.</p>
    </>
  );
}
