import { useId } from 'react';
import { Checkbox, CounterInput, Divider, Radio, RadioGroup } from '@faclon-labs/fds';
import type { NodeSettings, NodeType, WfNode } from '../domain/types';
import { isTriggerType } from '../domain/nodeTypes';

/** Only these steps can fail in a run (simulate.ts): an empty or invalid recipient, a missing report. */
const CAN_FAIL = new Set<NodeType>(['email', 'sms', 'report']);

/**
 * How the node behaves in a run, apart from what it does: switch it off, and
 * for steps that can fail, what a failure does. Saved with the rest of the
 * drawer on Submit, so the on/off is a Checkbox (Switch guard R3), not a Switch.
 */
export function NodeSettingsSection({ node, onChange }: { node: WfNode; onChange: (patch: NodeSettings) => void }) {
  const headingId = useId();
  if (isTriggerType(node.type)) return null;
  const s = node.settings ?? {};
  const onFailure = s.onFailure ?? 'stop';
  return (
    <section className="io-settings" aria-labelledby={headingId}>
      <Divider />
      <h3 id={headingId} className="BodyMediumSemibold">Settings</h3>
      <Checkbox
        isChecked={!!s.disabled}
        onChange={({ isChecked }) => onChange({ disabled: isChecked })}
        helpText="Runs pass straight through it without doing anything. Turn it back on any time."
      >
        Disable this node
      </Checkbox>
      {CAN_FAIL.has(node.type) && (
        <>
          <RadioGroup label="If this node fails" value={onFailure} onChange={({ value }) => onChange({ onFailure: value as NodeSettings['onFailure'] })}>
            <Radio value="stop" helpText="The run ends here and is marked failed.">Stop the workflow</Radio>
            <Radio value="continue" helpText="The failure is logged and the next step runs.">Continue with the next step</Radio>
            <Radio value="retry" helpText="Tries again before stopping.">Retry, then stop</Radio>
          </RadioGroup>
          {onFailure === 'retry' && (
            <CounterInput
              label="Retries"
              min={1}
              max={3}
              value={s.retries ?? 2}
              onChange={({ value }) => onChange({ retries: Math.min(3, Math.max(1, value)) as 1 | 2 | 3 })}
              helpText="Extra attempts, from 1 to 3."
            />
          )}
        </>
      )}
    </section>
  );
}
