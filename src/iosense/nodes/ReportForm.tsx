import { ActionList, ActionListItem, DropdownMenu, DropdownMenuOverlay, Radio, RadioGroup, SelectInput } from '@faclon-labs/fds';
import type { ReportNode, ReportPeriod } from '../domain/types';
import { PERIOD_LABEL } from '../engine/nodeText';
import { PeopleField, errorProps, type NodeFormProps } from './fields';

const PERIOD_HELP: Record<ReportPeriod, string> = {
  yesterday: 'The day before each run.',
  last_7_days: 'The 7 days before each run.',
  last_month: 'The calendar month before each run.',
};
const PERIODS = Object.keys(PERIOD_LABEL) as ReportPeriod[];

export function ReportForm({ node, ctx, errorFor, touch, onConfig }: NodeFormProps<ReportNode>) {
  const c = node.config;
  return (
    <>
      <div data-field="reportId">
        <DropdownMenu selectionType="single" value={c.reportId ? [c.reportId] : []} onChange={({ values }) => { touch('reportId'); onConfig({ reportId: values[0] ?? null }); }}>
          <SelectInput label="Report" placeholder="Choose a report" isRequired necessityIndicator="required" {...errorProps(errorFor('reportId'))} />
          <DropdownMenuOverlay>
            <ActionList>
              {ctx.reports.map((r) => <ActionListItem key={r.id} value={r.id} title={r.name} description={r.description} />)}
            </ActionList>
          </DropdownMenuOverlay>
        </DropdownMenu>
      </div>

      <DropdownMenu selectionType="single" value={[c.period]} onChange={({ values }) => values[0] && onConfig({ period: values[0] as ReportPeriod })}>
        <SelectInput label="Period" helpText={PERIOD_HELP[c.period]} />
        <DropdownMenuOverlay>
          <ActionList>
            {PERIODS.map((p) => <ActionListItem key={p} value={p} title={PERIOD_LABEL[p]} />)}
          </ActionList>
        </DropdownMenuOverlay>
      </DropdownMenu>

      <RadioGroup label="Format" orientation="horizontal" value={c.format} onChange={({ value }) => onConfig({ format: value as ReportNode['config']['format'] })}>
        <Radio value="pdf">PDF</Radio>
        <Radio value="xlsx">Excel</Radio>
      </RadioGroup>

      <div data-field="to">
        <PeopleField
          label="Send to"
          users={ctx.users}
          value={c.to}
          onChange={(to) => { touch('to'); onConfig({ to }); }}
          describe={(u) => `${u.role} · ${u.email}`}
          isRequired
          error={errorFor('to')}
        />
      </div>

      <p className="io-muted BodySmallRegular">Reports are simulated in this prototype. Nothing is generated or sent.</p>
    </>
  );
}
