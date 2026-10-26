import {
  ActionList, ActionListItem, Checkbox, CheckboxGroup, CounterInput, DatePicker, DropdownMenu, DropdownMenuOverlay, Radio, RadioGroup,
  SelectInput,
} from '@faclon-labs/fds';
import type { Frequency, MinuteInterval, SchedulerNode } from '../domain/types';
import { WEEKDAYS } from '../domain/variables';
import { MINUTE_INTERVALS, formatRunTime, nextRun, summarizeSchedule, toYmd } from '../engine/schedule';
import { TimeField, errorProps, type NodeFormProps } from './fields';

const FREQUENCIES: { value: Frequency; title: string }[] = [
  { value: 'minutes', title: 'Every few minutes' },
  { value: 'hourly', title: 'Hourly' },
  { value: 'daily', title: 'Daily' },
  { value: 'weekly', title: 'Weekly' },
  { value: 'monthly', title: 'Monthly' },
];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function parseYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export function SchedulerForm({ node, errorFor, touch, onConfig }: NodeFormProps<SchedulerNode>) {
  const c = node.config;
  const next = nextRun(c, Date.now());
  const tz = new Intl.DateTimeFormat(undefined, { timeZoneName: 'long' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value
    ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const time = <TimeField value={c.time} onChange={(time) => { touch('time'); onConfig({ time }); }} error={errorFor('time')} />;

  return (
    <>
      <RadioGroup label="Repeat" orientation="horizontal" value={c.mode} onChange={({ value }) => onConfig({ mode: value as SchedulerNode['config']['mode'] })}>
        <Radio value="once">Once</Radio>
        <Radio value="recurring">Recurring</Radio>
      </RadioGroup>

      {c.mode === 'once' ? (
        <>
          <div data-field="date">
            <DatePicker
              label="Date"
              isRequired
              necessityIndicator="required"
              minDate={today}
              value={parseYmd(c.date)}
              onChange={(d) => { touch('date'); onConfig({ date: d ? toYmd(d) : '' }); }}
              {...errorProps(errorFor('date'))}
            />
          </div>
          <div data-field="time">{time}</div>
        </>
      ) : (
        <>
          <DropdownMenu selectionType="single" value={[c.frequency]} onChange={({ values }) => values[0] && onConfig({ frequency: values[0] as Frequency })}>
            <SelectInput label="Frequency" />
            <DropdownMenuOverlay>
              <ActionList>
                {FREQUENCIES.map((f) => <ActionListItem key={f.value} value={f.value} title={f.title} />)}
              </ActionList>
            </DropdownMenuOverlay>
          </DropdownMenu>

          {c.frequency === 'minutes' && (
            <DropdownMenu selectionType="single" value={[String(c.everyMinutes)]} onChange={({ values }) => values[0] && onConfig({ everyMinutes: Number(values[0]) as MinuteInterval })}>
              <SelectInput label="Every" helpText="Intervals that divide the hour evenly, so runs stay on the clock." />
              <DropdownMenuOverlay>
                <ActionList>
                  {MINUTE_INTERVALS.map((m) => <ActionListItem key={m} value={String(m)} title={`${m} minutes`} />)}
                </ActionList>
              </DropdownMenuOverlay>
            </DropdownMenu>
          )}
          {c.frequency === 'hourly' && (
            <CounterInput label="Minutes past the hour" min={0} max={59} value={c.minute} onChange={({ value }) => onConfig({ minute: value }, `${node.id}:minute`)} />
          )}
          {c.frequency === 'weekly' && (
            <div data-field="days">
              <CheckboxGroup
                label="Days"
                orientation="horizontal"
                isRequired
                necessityIndicator="required"
                value={c.days.map(String)}
                onChange={({ values }) => { touch('days'); onConfig({ days: values.map(Number) }); }}
                {...errorProps(errorFor('days'))}
              >
                {WEEK_ORDER.map((d) => <Checkbox key={d} value={String(d)}>{WEEKDAYS[d].slice(0, 3)}</Checkbox>)}
              </CheckboxGroup>
            </div>
          )}
          {c.frequency === 'monthly' && (
            <CounterInput
              label="Day of the month"
              min={1}
              max={28}
              value={c.dayOfMonth}
              helpText="Up to the 28th, so it runs every month."
              onChange={({ value }) => onConfig({ dayOfMonth: value }, `${node.id}:day`)}
            />
          )}
          {(c.frequency === 'daily' || c.frequency === 'weekly' || c.frequency === 'monthly') && <div data-field="time">{time}</div>}
          {c.frequency === 'daily' && (
            <Checkbox isChecked={c.weekdaysOnly} onChange={({ isChecked }) => onConfig({ weekdaysOnly: isChecked })}>Weekdays only</Checkbox>
          )}
        </>
      )}

      <div className="io-schedule-summary">
        <p className="BodyMediumSemibold">{summarizeSchedule(c)}</p>
        <p className="io-muted BodySmallRegular">
          {next ? `Next run would be ${formatRunTime(next)}` : 'No upcoming run'}. Times are in {tz}.
        </p>
      </div>
    </>
  );
}
