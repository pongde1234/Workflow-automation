import { useRef } from 'react';
import { TextArea, TextInput } from '@faclon-labs/fds';
import type { SmsNode } from '../domain/types';
import { SMS_LENGTH } from '../engine/validate';
import { PeopleField, errorProps, useInsertValue, type NodeFormProps } from './fields';

export function SmsForm({ node, ctx, errorFor, touch, onConfig }: NodeFormProps<SmsNode>) {
  const c = node.config;
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const messageValues = useInsertValue({ vars: ctx.vars, fieldRef: messageRef, value: c.message, label: 'Message', onInsert: (message) => { touch('message'); onConfig({ message }); } });

  return (
    <>
      <div data-field="to">
        <PeopleField
          label="To"
          users={ctx.users}
          value={c.to}
          onChange={(to) => { touch('to'); onConfig({ to }); }}
          describe={(u) => `${u.role} · ${u.phone}`}
          helpText="Pick people from iosense; their mobile numbers are used."
          error={errorFor('to')}
        />
      </div>

      <div data-field="other">
        <TextInput
          label="Other numbers"
          placeholder="+91 90000 00000, +91 90000 00001"
          helpText="Separate numbers with commas."
          value={c.other}
          onChange={({ value }) => onConfig({ other: value ?? '' }, `${node.id}:other`)}
          onBlur={() => touch('other')}
          {...errorProps(errorFor('other'))}
        />
      </div>

      <div data-field="message">
        <TextArea
          ref={messageRef}
          label="Message"
          isRequired
          necessityIndicator="required"
          numberOfLines={3}
          value={c.message}
          helpText={`${c.message.length} of ${SMS_LENGTH} characters fit in one text.`}
          onChange={({ value }) => onConfig({ message: value ?? '' }, `${node.id}:message`)}
          onBlur={() => touch('message')}
          placeholder={messageValues.placeholder}
          onKeyDown={messageValues.onKeyDown}
          labelTrailing={messageValues.button}
          {...errorProps(errorFor('message'))}
        />
      </div>

      <p className="io-muted BodySmallRegular">Texts are simulated in this prototype. Nothing is sent.</p>
    </>
  );
}
