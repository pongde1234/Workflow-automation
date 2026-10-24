import { CounterInput, Radio, RadioGroup } from '@faclon-labs/fds';
import type { DelayNode } from '../domain/types';
import type { NodeFormProps } from './fields';

const MAX = { minutes: 1440, hours: 72 } as const;

export function DelayForm({ node, onConfig }: NodeFormProps<DelayNode>) {
  const c = node.config;
  return (
    <>
      <div data-field="amount">
        <CounterInput label="Wait" min={1} max={MAX[c.unit]} value={c.amount} onChange={({ value }) => onConfig({ amount: value }, `${node.id}:amount`)} />
      </div>
      <RadioGroup
        label="Unit"
        orientation="horizontal"
        value={c.unit}
        onChange={({ value }) => {
          const unit = value as DelayNode['config']['unit'];
          onConfig({ unit, amount: Math.min(c.amount, MAX[unit]) });
        }}
      >
        <Radio value="minutes">Minutes</Radio>
        <Radio value="hours">Hours</Radio>
      </RadioGroup>
      <p className="io-muted BodySmallRegular">The next node runs after this wait. Test runs don’t really wait.</p>
    </>
  );
}
