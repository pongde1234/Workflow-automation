import {
  ActionList, ActionListItem, ActionListItemIcon, Button, DatePicker, Divider, DropdownMenu,
  DropdownMenuOverlay, DropdownMenuTrigger, SelectInput, TextInput,
} from '@faclon-labs/fds';
import { ArrowDown, ArrowUp, Ellipsis, Plus, Trash2 } from 'lucide-react';
import type { OperatorId, SwitchCondition, SwitchNode } from '../domain/types';
import { addCondition, moveCondition, removeCondition, updateCondition } from '../engine/graphOps';
import { OPERATORS, OPERATORS_BY_TYPE, conditionLabel, isUnary, toDayKey } from '../engine/operators';
import { toYmd } from '../engine/schedule';
import { errorProps, type NodeFormProps } from './fields';

const MAX_CONDITIONS = 8;

function parseDay(v: string): Date | null {
  const k = toDayKey(v);
  if (!k) return null;
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function SwitchForm({ node, ctx, errorFor, touch, onGraph, newId }: NodeFormProps<SwitchNode>) {
  const vars = ctx.vars;
  const conditions = node.config.conditions;
  const set = (c: SwitchCondition, patch: Partial<SwitchCondition>, mergeKey?: string) =>
    onGraph((g) => updateCondition(g, node.id, c.id, patch), mergeKey);

  if (vars.length === 0) {
    return <p className="BodyMediumRegular">Set up the trigger first. Its values are what a Switch compares.</p>;
  }

  return (
    <>
      <p className="io-muted BodySmallRegular">Conditions are checked from the top. The first one that matches decides the path.</p>
      {conditions.map((c, i) => {
        const v = vars.find((x) => x.id === c.field);
        const ops = v ? OPERATORS_BY_TYPE[v.type] : [];
        const at = `conditions.${c.id}`;
        const headingId = `${node.id}-${c.id}-heading`;
        return (
          <section key={c.id} className="io-condition" aria-labelledby={headingId}>
            {i > 0 && <Divider />}
            <div className="io-condition__head">
              <h3 id={headingId} className="BodyMediumSemibold">{`${i + 1}. ${conditionLabel(c, vars)}`}</h3>
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button iconOnly variant="ghost" tone="neutral" size="sm" leadingIcon={<Ellipsis size={16} />} aria-label={`Actions for condition ${i + 1}`} />
                </DropdownMenuTrigger>
                <DropdownMenuOverlay>
                  <ActionList>
                    {i > 0 && <ActionListItem value="up" title="Move up" leading={<ActionListItemIcon icon={ArrowUp} />} onClick={() => onGraph((g) => moveCondition(g, node.id, c.id, -1))} />}
                    {i < conditions.length - 1 && <ActionListItem value="down" title="Move down" leading={<ActionListItemIcon icon={ArrowDown} />} onClick={() => onGraph((g) => moveCondition(g, node.id, c.id, 1))} />}
                    <ActionListItem value="remove" title="Remove condition" intent="negative" leading={<ActionListItemIcon icon={Trash2} />} onClick={() => onGraph((g) => removeCondition(g, node.id, c.id))} />
                  </ActionList>
                </DropdownMenuOverlay>
              </DropdownMenu>
            </div>

            {/* What to check and how, side by side; the value it's compared with under them. */}
            <div className="io-condition__pair">
            <div data-field={`${at}.field`}>
              <DropdownMenu
                selectionType="single"
                value={c.field ? [c.field] : []}
                onChange={({ values }) => {
                  touch(`${at}.field`);
                  const nv = vars.find((x) => x.id === values[0]);
                  const keepOp = nv && c.op && OPERATORS_BY_TYPE[nv.type].includes(c.op);
                  set(c, { field: values[0] ?? null, op: keepOp ? c.op : nv ? OPERATORS_BY_TYPE[nv.type][0] : null, value: keepOp ? c.value : '' });
                }}
              >
                <SelectInput label="Value to check" placeholder="Choose a value" isRequired necessityIndicator="required" {...errorProps(errorFor(`${at}.field`))} />
                <DropdownMenuOverlay>
                  <ActionList>
                    {vars.map((x) => <ActionListItem key={x.id} value={x.id} title={x.label} />)}
                  </ActionList>
                </DropdownMenuOverlay>
              </DropdownMenu>
            </div>

            {v && (
              <div data-field={`${at}.op`}>
                <DropdownMenu selectionType="single" value={c.op ? [c.op] : []} onChange={({ values }) => { touch(`${at}.op`); set(c, { op: (values[0] as OperatorId) ?? null }); }}>
                  <SelectInput label="Comparison" isRequired necessityIndicator="required" {...errorProps(errorFor(`${at}.op`))} />
                  <DropdownMenuOverlay>
                    <ActionList>
                      {ops.map((op) => <ActionListItem key={op} value={op} title={OPERATORS[op].label} />)}
                    </ActionList>
                  </DropdownMenuOverlay>
                </DropdownMenu>
              </div>
            )}
            </div>

            {v && c.op && !isUnary(c.op) && (
              <div data-field={`${at}.value`}>
                {v.type === 'choice' && v.options ? (
                  <DropdownMenu selectionType="single" value={c.value ? [c.value] : []} onChange={({ values }) => { touch(`${at}.value`); set(c, { value: values[0] ?? '' }); }}>
                    <SelectInput label="Compare with" isRequired necessityIndicator="required" {...errorProps(errorFor(`${at}.value`))} />
                    <DropdownMenuOverlay>
                      <ActionList>
                        {v.options.map((o) => <ActionListItem key={o} value={o} title={o} />)}
                      </ActionList>
                    </DropdownMenuOverlay>
                  </DropdownMenu>
                ) : v.type === 'date' ? (
                  <DatePicker
                    label="Compare with"
                    isRequired
                    necessityIndicator="required"
                    value={parseDay(c.value)}
                    onChange={(d) => { touch(`${at}.value`); set(c, { value: d ? toYmd(d) : '' }); }}
                    {...errorProps(errorFor(`${at}.value`))}
                  />
                ) : (
                  <TextInput
                    label="Compare with"
                    type={v.type === 'number' ? 'number' : 'text'}
                    isRequired
                    necessityIndicator="required"
                    value={c.value}
                    onChange={({ value }) => set(c, { value: value ?? '' }, `${node.id}:${c.id}:value`)}
                    onBlur={() => touch(`${at}.value`)}
                    {...errorProps(errorFor(`${at}.value`))}
                  />
                )}
              </div>
            )}
          </section>
        );
      })}

      {conditions.length < MAX_CONDITIONS && (
        <div>
          <Button variant="secondary" tone="neutral" size="sm" label="Add condition" leadingIcon={<Plus size={16} />} onClick={() => onGraph((g) => addCondition(g, node.id, newId('c')))} />
        </div>
      )}
      <Divider />
      <section className="io-condition" aria-label="Default">
        <h3 className="BodyMediumSemibold">Default</h3>
        <p className="io-muted BodySmallRegular">Runs when no condition matches. Leave it unconnected to do nothing.</p>
      </section>
    </>
  );
}
