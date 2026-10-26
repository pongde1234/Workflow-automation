import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  EmptyState, Indicator, LinkButton, NoDataOneIllustration, NoSearchResultIllustration, Table, Tag, type TableColumn,
} from '@faclon-labs/fds';
import { timeAgo } from '@/lib/util';
import type { Execution, ExecutionSource, ExecutionStatus } from '../domain/types';
import { useIoExecutions } from '../store/executionStore';
import { useIoWorkflows } from '../store/workflowStore';
import { useIoSession } from '../store/sessionStore';
import { useIosenseReady } from '../seed/useIosenseReady';
import { runPath } from '../lib/links';
import { useWidthClass } from '../lib/useViewportWidth';
import { EXECUTION_STATUS, SOURCE_LABEL } from '../ui/status';
import { formatStamp } from '../ui/format';

interface Row extends Execution {
  /** The workflow's current name (it may have been renamed since the run). */
  name: string;
}

const STATUS_OPTIONS: ExecutionStatus[] = ['success', 'failed'];
const SOURCE_OPTIONS = Object.keys(SOURCE_LABEL) as ExecutionSource[];

/**
 * Every run of every workflow, newest first: the place to look across the
 * plant ("what failed overnight?"). A row opens the run on its workflow,
 * with its logs and the node that failed.
 */
export function RunHistoryPage() {
  const ready = useIosenseReady();
  const navigate = useNavigate();
  const width = useWidthClass();
  const executions = useIoExecutions((s) => s.executions);
  const workflows = useIoWorkflows((s) => s.workflows);
  const view = useIoSession((s) => s.runsView);
  const setView = useIoSession((s) => s.setRunsView);

  const rows = useMemo<Row[]>(() => {
    const names = new Map(workflows.map((w) => [w.id, w.name]));
    // Runs of deleted workflows have nowhere to open, so they are left out.
    return executions.filter((e) => names.has(e.workflowId)).map((e) => ({ ...e, name: names.get(e.workflowId)! }));
  }, [executions, workflows]);

  const query = view.search.trim().toLowerCase();
  const data = useMemo(
    () => (query ? rows.filter((r) => r.name.toLowerCase().includes(query) || r.summary.toLowerCase().includes(query)) : rows),
    [rows, query],
  );
  const isFiltered = !!query || Object.values(view.filters).some((v) => Array.isArray(v) && v.length > 0);

  const columns = useMemo<TableColumn<Row>[]>(() => {
    const started: TableColumn<Row> = {
      key: 'started', header: 'Started', isSortable: true,
      sortFn: (a, b) => a.startedAt - b.startedAt,
      cell: (r) => formatStamp(r.startedAt),
      description: (r) => timeAgo(r.startedAt),
      measureText: (r) => formatStamp(r.startedAt),
    };
    const workflow: TableColumn<Row> = {
      key: 'name', header: 'Workflow', isRowHeader: true, emphasis: 'normal', isSortable: true,
      sortFn: (a, b) => a.name.localeCompare(b.name),
      description: (r) => (width === 'xs' ? `${EXECUTION_STATUS[r.status].label} · ${r.summary}` : r.summary),
    };
    const status: TableColumn<Row> = {
      key: 'status', header: 'Status',
      cell: (r) => <Indicator size="Small" color={EXECUTION_STATUS[r.status].color}>{EXECUTION_STATUS[r.status].label}</Indicator>,
      measureText: (r) => EXECUTION_STATUS[r.status].label,
      filter: { options: STATUS_OPTIONS.map((s) => ({ value: s, label: EXECUTION_STATUS[s].label })) },
    };
    const trigger: TableColumn<Row> = {
      key: 'source', header: 'Trigger',
      cell: (r) => SOURCE_LABEL[r.source],
      measureText: (r) => SOURCE_LABEL[r.source],
      filter: { options: SOURCE_OPTIONS.map((s) => ({ value: s, label: SOURCE_LABEL[s] })) },
    };
    if (width === 'xs') return [workflow, started];
    if (width === 'sm') return [workflow, status, started];
    return [started, workflow, status, trigger];
  }, [width]);

  // The filters in force, each a removable Tag in the table header (and Clear filters when there's more than one).
  const filterOf = (key: 'status' | 'source') => (Array.isArray(view.filters[key]) ? view.filters[key] as string[] : []);
  const statusFilter = filterOf('status') as ExecutionStatus[];
  const sourceFilter = filterOf('source') as ExecutionSource[];
  const removeFilter = (key: 'status' | 'source', value: string) =>
    setView({ filters: { ...view.filters, [key]: filterOf(key).filter((v) => v !== value) }, page: 1 });
  const chips = [
    ...statusFilter.map((s) => ({ key: 'status' as const, value: s, label: `Status: ${EXECUTION_STATUS[s].label}` })),
    ...sourceFilter.map((s) => ({ key: 'source' as const, value: s, label: `Trigger: ${SOURCE_LABEL[s]}` })),
  ];
  // What the header counts: the rows left after the search and the filters.
  const shownCount = data.filter((r) => (!statusFilter.length || statusFilter.includes(r.status)) && (!sourceFilter.length || sourceFilter.includes(r.source))).length;
  const title = statusFilter.length === 1 ? (statusFilter[0] === 'failed' ? 'Failed runs' : 'Succeeded runs') : 'All runs';

  const emptyState = isFiltered && rows.length > 0 ? (
    <EmptyState asset={<NoSearchResultIllustration />} title="No runs match" description={query ? `Nothing matches “${view.search.trim()}”.` : 'No runs match these filters.'}>
      <LinkButton label="Clear search and filters" onClick={() => setView({ search: '', filters: {}, page: 1 })} />
    </EmptyState>
  ) : (
    <EmptyState asset={<NoDataOneIllustration />} title="No runs yet" description="Runs appear here when a workflow is tested, or when a published one is triggered by a form, a schedule or a device." />
  );

  return (
    <div className="io-list">
      {/* FDS's table header (Figma "Table Header"): title and count on the left; the filters in force and the search on
          the right. The search runs here, not in the table, so it also matches each run's result text. */}
      <Table<Row>
        accessibilityLabel="Runs"
        toolbar={{
          title,
          subtitle: ready ? `${shownCount} ${shownCount === 1 ? 'run' : 'runs'}, newest first` : undefined,
          actions: chips.length > 0 ? (
            <span className="io-filters">
              {chips.map((c) => <Tag key={`${c.key}:${c.value}`} onDismiss={() => removeFilter(c.key, c.value)}>{c.label}</Tag>)}
              {chips.length > 1 && <LinkButton label="Clear filters" onClick={() => setView({ filters: {}, page: 1 })} />}
            </span>
          ) : undefined,
          search: {
            placeholder: 'Search workflows and results',
            accessibilityLabel: 'Search runs',
            value: view.search,
            onSearchChange: (q) => setView({ search: q, page: 1 }),
            mode: 'server',
          },
        }}
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        rowDensity="expanded"
        isLoading={!ready}
        emptyState={emptyState}
        onRowClick={({ row }) => navigate(runPath(row.workflowId, row.id))}
        sortState={view.sort}
        onSortChange={(sort) => setView({ sort })}
        filterState={view.filters}
        onFilterChange={(filters) => setView({ filters, page: 1 })}
        pagination={{ type: 'client', page: view.page, onPageChange: ({ page }) => setView({ page }), defaultPageSize: 25, pageSizeOptions: [25, 50, 100] }}
      />
    </div>
  );
}
