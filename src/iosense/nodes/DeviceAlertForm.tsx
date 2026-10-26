import { ActionList, ActionListItem, CounterInput, DropdownMenu, DropdownMenuOverlay, Radio, RadioGroup, SelectInput, TextInput } from '@faclon-labs/fds';
import type { DeviceAlertNode } from '../domain/types';
import { errorProps, type NodeFormProps } from './fields';
import { ReadingsChart } from './ReadingsChart';

export function DeviceAlertForm({ node, ctx, errorFor, touch, onConfig }: NodeFormProps<DeviceAlertNode>) {
  const c = node.config;
  const device = ctx.devices.find((d) => d.id === c.deviceId);
  const reading = device?.parameters.find((p) => p.key === c.parameter);
  const unit = reading?.unit;

  return (
    <>
      <div data-field="deviceId">
        <DropdownMenu
          selectionType="single"
          value={c.deviceId ? [c.deviceId] : []}
          onChange={({ values }) => {
            touch('deviceId');
            const next = ctx.devices.find((d) => d.id === values[0]);
            // Keep the reading if the new device reports it too; otherwise start from its first one.
            const parameter = next?.parameters.some((p) => p.key === c.parameter) ? c.parameter : next?.parameters[0]?.key ?? null;
            onConfig({ deviceId: next?.id ?? null, parameter });
          }}
        >
          <SelectInput label="Device" placeholder="Choose a device" isRequired necessityIndicator="required" {...errorProps(errorFor('deviceId'))} />
          <DropdownMenuOverlay>
            <ActionList>
              {ctx.devices.map((d) => <ActionListItem key={d.id} value={d.id} title={d.name} description={d.location} />)}
            </ActionList>
          </DropdownMenuOverlay>
        </DropdownMenu>
      </div>

      <div data-field="parameter">
        <DropdownMenu selectionType="single" value={c.parameter ? [c.parameter] : []} onChange={({ values }) => { touch('parameter'); onConfig({ parameter: values[0] ?? null }); }}>
          <SelectInput
            label="Reading"
            placeholder={device ? 'Choose a reading' : 'Choose a device first'}
            isDisabled={!device}
            isRequired
            necessityIndicator="required"
            {...errorProps(errorFor('parameter'))}
          />
          <DropdownMenuOverlay>
            <ActionList>
              {(device?.parameters ?? []).map((p) => <ActionListItem key={p.key} value={p.key} title={p.label} description={p.unit || undefined} />)}
            </ActionList>
          </DropdownMenuOverlay>
        </DropdownMenu>
      </div>

      <RadioGroup label="Runs when the reading goes" orientation="horizontal" value={c.op} onChange={({ value }) => onConfig({ op: value as DeviceAlertNode['config']['op'] })}>
        <Radio value="above">Above the limit</Radio>
        <Radio value="below">Below the limit</Radio>
      </RadioGroup>

      <div data-field="limit">
        <TextInput
          label={unit ? `Limit (${unit})` : 'Limit'}
          type="number"
          isRequired
          necessityIndicator="required"
          value={c.limit}
          onChange={({ value }) => onConfig({ limit: value ?? '' }, `${node.id}:limit`)}
          onBlur={() => touch('limit')}
          {...errorProps(errorFor('limit'))}
        />
      </div>

      <CounterInput
        label="For at least (minutes)"
        min={0}
        max={60}
        value={c.forMinutes}
        helpText="0 runs as soon as the reading crosses the limit. A few minutes ignores brief spikes."
        onChange={({ value }) => onConfig({ forMinutes: value }, `${node.id}:for`)}
      />
      {/* How this reading has behaved, so the limit can be set where it means something. */}
      {device && reading && <ReadingsChart deviceId={device.id} parameter={reading} config={c} />}
      <p className="io-muted BodySmallRegular">Readings are simulated in this prototype. Test the workflow to try one.</p>
    </>
  );
}
