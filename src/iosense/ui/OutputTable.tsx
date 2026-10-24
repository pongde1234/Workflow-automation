import { Table, type TableColumn } from '@faclon-labs/fds';

interface Row { id: string; field: string; value: string }

/** Readable names for the output keys the simulation writes; trigger values already use their labels. */
const FIELD_LABEL: Record<string, string> = {
  to: 'To', subject: 'Subject', body: 'Message', message: 'Message', wait: 'Waited', workOrder: 'Work order', title: 'Title',
  priority: 'Priority', assignee: 'Assigned to', description: 'Description', report: 'Report', period: 'Period', format: 'Format', file: 'File',
};

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.map(show).join(', ');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/** A node's data as field/value rows. A Switch's checks read as "condition → result". */
export function toRows(data: unknown): Row[] {
  if (!data || typeof data !== 'object') return [];
  const o = data as Record<string, unknown>;
  if (Array.isArray(o.checked)) {
    return (o.checked as { condition: string; matched: boolean; note?: string }[]).map((c, i) => ({
      id: `c${i}`, field: c.condition, value: c.matched ? 'Matched' : `Not matched${c.note ? ` (${c.note})` : ''}`,
    }));
  }
  return Object.entries(o)
    .filter(([k]) => k !== 'simulated')
    .map(([k, v]) => ({ id: k, field: FIELD_LABEL[k] ?? k, value: show(v) }));
}

const COLUMNS: TableColumn<Row>[] = [
  { key: 'field', header: 'Field', emphasis: 'normal', isRowHeader: true },
  { key: 'value', header: 'Value' },
];

export function OutputTable({ data, label }: { data: unknown; label: string }) {
  const rows = toRows(data);
  if (rows.length === 0) return <p className="io-muted BodySmallRegular">Nothing to show for this node.</p>;
  return <Table<Row> accessibilityLabel={label} data={rows} columns={COLUMNS} getRowId={(r) => r.id} />;
}
