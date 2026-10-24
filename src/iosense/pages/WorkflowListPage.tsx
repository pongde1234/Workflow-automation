import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ActionList, ActionListItem, ActionListItemIcon, Badge, Button, Card, CardBody, CardHeader, CardHeaderIconButton, CardHeaderLeading,
  CardHeaderTrailing, DropdownMenu, DropdownMenuOverlay, DropdownMenuTrigger, EmptyState, Indicator, LinkButton,
  NoDataOneIllustration, NoSearchResultIllustration, SearchInput, Spinner, TabItem, TabList, Table, Tabs, Tag, TechnicalHiccupIllustration, useToast,
  type TableColumn, type TableRowAction,
} from '@faclon-labs/fds';
import { Copy, Ellipsis, History, LayoutGrid, List, Pencil, Plus, Trash2 } from 'lucide-react';
import { timeAgo } from '@/lib/util';
import type { Execution, NodeType, Workflow, WorkflowStatus } from '../domain/types';
import { getTrigger } from '../engine/graph';
import { NODE_TYPES } from '../domain/nodeTypes';
import { useIoWorkflows } from '../store/workflowStore';
import { useIoExecutions } from '../store/executionStore';
import { useIoSession } from '../store/sessionStore';
import { useIosenseReady } from '../seed/useIosenseReady';
import { demoFlag } from '../lib/demo';
import { editorPath, historyPath } from '../lib/links';
import { useWidthClass } from '../lib/useViewportWidth';
import { EXECUTION_STATUS, WORKFLOW_STATUS } from '../ui/status';
import { ConfirmModal } from '../ui/ConfirmModal';
import { NodeTile } from '../ui/NodeTile';
import { WorkflowFormModal, type WorkflowDraft } from './WorkflowFormModal';

interface Row {
  id: string;
  name: string;
  description: string;
  trigger: string;
  triggerType?: NodeType;
  status: WorkflowStatus;
  lastRun?: Execution;
  updatedAt: number;
}

const EMPTY_DRAFT: WorkflowDraft = { name: '', description: '' };

function lastRunText(r: Row) {
  return r.lastRun ? `${EXECUTION_STATUS[r.lastRun.status].label} ${timeAgo(r.lastRun.startedAt)}` : 'Never run';
}

/** The table's sortable columns, so the card view orders the same way. */
const SORTS: Record<string, (a: Row, b: Row) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  lastRun: (a, b) => (a.lastRun?.startedAt ?? 0) - (b.lastRun?.startedAt ?? 0),
  updated: (a, b) => a.updatedAt - b.updatedAt,
};

interface RowHandlers {
  onOpen: (r: Row) => void;
  onRename: (r: Row) => void;
  onDuplicate: (r: Row) => void;
  onHistory: (r: Row) => void;
  onDelete: (r: Row) => void;
}

/** A workflow as a card: its trigger and name, what it does, whether it's live and how its last run went. */
function WorkflowCard({ row, on }: { row: Row; on: RowHandlers }) {
  const status = WORKFLOW_STATUS[row.status];
  const run = row.lastRun ? EXECUTION_STATUS[row.lastRun.status] : undefined;
  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <CardHeaderIconButton icon={<Ellipsis size={16} />} aria-label={`Actions for ${row.name}`} />
      </DropdownMenuTrigger>
      <DropdownMenuOverlay>
        <ActionList>
          <ActionListItem title="Rename" value="rename" leading={<ActionListItemIcon icon={Pencil} />} onClick={() => on.onRename(row)} />
          <ActionListItem title="Duplicate" value="duplicate" leading={<ActionListItemIcon icon={Copy} />} onClick={() => on.onDuplicate(row)} />
          <ActionListItem title="History" value="history" leading={<ActionListItemIcon icon={History} />} onClick={() => on.onHistory(row)} />
          <ActionListItem title="Delete" value="delete" intent="negative" leading={<ActionListItemIcon icon={Trash2} />} onClick={() => on.onDelete(row)} />
        </ActionList>
      </DropdownMenuOverlay>
    </DropdownMenu>
  );
  return (
    <Card size="Medium" padding={16} height="100%" onClick={() => on.onOpen(row)} accessibilityLabel={`${row.name}, ${status.label}, ${lastRunText(row)}`}>
      <CardHeader showDivider={false}>
        <CardHeaderLeading title={row.name} subtitle={row.trigger} prefix={row.triggerType ? <NodeTile type={row.triggerType} /> : undefined} />
        <CardHeaderTrailing visual={menu} />
      </CardHeader>
      {/* The body fills the card, so every card's status row sits on its bottom edge. */}
      <CardBody className="io-wf-card__body">
        <div className="io-wf-card">
          {row.description && <p className="io-wf-card__desc io-muted BodySmallRegular">{row.description}</p>}
          <div className="io-wf-card__meta">
            <Badge label={status.label} color={status.color} />
            <span className="io-wf-card__run">
              {run ? <Indicator size="Small" color={run.color}>{run.label}</Indicator> : <Indicator size="Small" color="Neutral">Never run</Indicator>}
              {row.lastRun && <span className="io-muted BodySmallRegular">{timeAgo(row.lastRun.startedAt)}</span>}
            </span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export function WorkflowListPage() {
  const ready = useIosenseReady();
  const navigate = useNavigate();
  const toast = useToast();
  const width = useWidthClass();
  const demo = demoFlag();

  const workflows = useIoWorkflows((s) => s.workflows);
  const executions = useIoExecutions((s) => s.executions);
  const view = useIoSession((s) => s.listing);
  const setView = useIoSession((s) => s.setListing);

  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<WorkflowDraft>(EMPTY_DRAFT);
  const [renaming, setRenaming] = useState<{ id: string; draft: WorkflowDraft } | null>(null);
  const [deleting, setDeleting] = useState<Workflow | null>(null);
  const [loadFailed, setLoadFailed] = useState(demo === 'error');

  const rows = useMemo<Row[]>(() => {
    if (demo === 'empty') return [];
    const latest = new Map<string, Execution>();
    for (const e of executions) {
      const prev = latest.get(e.workflowId);
      if (!prev || e.startedAt > prev.startedAt) latest.set(e.workflowId, e);
    }
    return workflows.map((w) => {
      const t = getTrigger(w.graph);
      return {
        id: w.id, name: w.name, description: w.description, status: w.status, updatedAt: w.updatedAt,
        trigger: t ? NODE_TYPES[t.type].label : 'Not set', triggerType: t?.type, lastRun: latest.get(w.id),
      };
    });
  }, [workflows, executions, demo]);

  const query = view.search.trim().toLowerCase();
  const data = useMemo(
    () => (query ? rows.filter((r) => r.name.toLowerCase().includes(query) || r.description.toLowerCase().includes(query)) : rows),
    [rows, query],
  );
  const isFiltered = !!query || Object.values(view.filters).some((v) => Array.isArray(v) && v.length > 0);
  const statusFilter = (Array.isArray(view.filters.status) ? view.filters.status : []) as WorkflowStatus[];

  // Cards follow the table's status filter and sort, so switching views keeps the same set in the same order.
  const cards = useMemo(() => {
    const kept = statusFilter.length ? data.filter((r) => statusFilter.includes(r.status)) : data;
    const cmp = view.sort ? SORTS[view.sort.columnKey] : undefined;
    if (!cmp || !view.sort) return kept;
    const dir = view.sort.direction === 'asc' ? 1 : -1;
    return [...kept].sort((a, b) => dir * cmp(a, b));
  }, [data, statusFilter, view.sort]);

  const columns = useMemo<TableColumn<Row>[]>(() => {
    const name: TableColumn<Row> = {
      key: 'name', header: 'Name', emphasis: 'normal', isRowHeader: true, isSortable: true,
      sortFn: (a, b) => a.name.localeCompare(b.name),
      description: (r) => (width === 'xs' ? `${WORKFLOW_STATUS[r.status].label} · ${lastRunText(r)}` : r.description || undefined),
    };
    const trigger: TableColumn<Row> = {
      key: 'trigger', header: 'Trigger', measureText: (r) => r.trigger,
      cell: (r) => <span className="io-trigger-cell">{r.triggerType && <NodeTile type={r.triggerType} size="sm" />}{r.trigger}</span>,
    };
    const status: TableColumn<Row> = {
      key: 'status', header: 'Status',
      cell: (r) => <Badge label={WORKFLOW_STATUS[r.status].label} color={WORKFLOW_STATUS[r.status].color} />,
      measureText: (r) => WORKFLOW_STATUS[r.status].label,
      filter: { options: (Object.keys(WORKFLOW_STATUS) as WorkflowStatus[]).map((s) => ({ value: s, label: WORKFLOW_STATUS[s].label })) },
    };
    const lastRun: TableColumn<Row> = {
      key: 'lastRun', header: 'Last run', isSortable: true,
      sortFn: (a, b) => (a.lastRun?.startedAt ?? 0) - (b.lastRun?.startedAt ?? 0),
      cell: (r) => (r.lastRun
        ? <Indicator size="Small" color={EXECUTION_STATUS[r.lastRun.status].color}>{EXECUTION_STATUS[r.lastRun.status].label}</Indicator>
        : <Indicator size="Small" color="Neutral">Never run</Indicator>),
      description: (r) => (r.lastRun ? timeAgo(r.lastRun.startedAt) : undefined),
      measureText: lastRunText,
    };
    const updated: TableColumn<Row> = {
      key: 'updated', header: 'Updated', emphasis: 'muted', isSortable: true,
      sortFn: (a, b) => a.updatedAt - b.updatedAt,
      cell: (r) => <span title={new Date(r.updatedAt).toLocaleString()}>{timeAgo(r.updatedAt)}</span>,
      measureText: (r) => timeAgo(r.updatedAt),
    };
    if (width === 'xs') return [name];
    if (width === 'sm') return [name, status, lastRun];
    if (width === 'md') return [name, trigger, status, lastRun];
    return [name, trigger, status, lastRun, updated];
  }, [width]);

  const handlers: RowHandlers = {
    onOpen: (r) => navigate(editorPath(r.id)),
    onRename: (r) => setRenaming({ id: r.id, draft: { name: r.name, description: r.description } }),
    onDuplicate: (r) => useIoWorkflows.getState().duplicate(r.id),
    onHistory: (r) => navigate(historyPath(r.id)),
    onDelete: (r) => setDeleting(workflows.find((w) => w.id === r.id) ?? null),
  };

  const rowActions = (r: Row): TableRowAction[] => [
    { label: 'Rename', accessibilityLabel: `Rename ${r.name}`, icon: Pencil, onClick: () => handlers.onRename(r) },
    { label: 'Duplicate', accessibilityLabel: `Duplicate ${r.name}`, icon: Copy, onClick: () => handlers.onDuplicate(r) },
    { label: 'History', accessibilityLabel: `View execution history of ${r.name}`, icon: History, onClick: () => handlers.onHistory(r) },
    { label: 'Delete', accessibilityLabel: `Delete ${r.name}`, icon: Trash2, intent: 'negative', onClick: () => handlers.onDelete(r) },
  ];

  const emptyState = loadFailed ? (
    <EmptyState asset={<TechnicalHiccupIllustration />} title="Couldn’t load workflows" description="This browser’s storage didn’t respond. Your workflows are still saved; try again.">
      <Button variant="primary" tone="neutral" label="Retry" onClick={() => setLoadFailed(false)} />
    </EmptyState>
  ) : isFiltered && rows.length > 0 ? (
    <EmptyState asset={<NoSearchResultIllustration />} title="No workflows match" description={query ? `Nothing matches “${view.search.trim()}”.` : 'Nothing matches these filters.'}>
      <LinkButton label="Clear search and filters" onClick={() => setView({ search: '', filters: {}, page: 1 })} />
    </EmptyState>
  ) : (
    <EmptyState asset={<NoDataOneIllustration />} title="No workflows yet" description="Automate plant routines with workflows that react to IO Forms or run on a schedule. Use Create workflow to start." />
  );

  const executionCount = deleting ? executions.filter((e) => e.workflowId === deleting.id).length : 0;

  const loading = !ready || demo === 'loading';

  return (
    <div className="io-list">
      {/* Search on the left, over the names it searches; the view switch and the one primary action on the right. */}
      <div className="io-list__toolbar">
        <div className="io-list__search">
          <SearchInput
            accessibilityLabel="Search workflows"
            placeholder="Search workflows"
            value={view.search}
            onChange={({ value }) => setView({ search: value ?? '', page: 1 })}
          />
        </div>
        {view.layout === 'cards' && statusFilter.length > 0 && (
          <span className="io-list__filters">
            {statusFilter.map((s) => (
              <Tag key={s} onDismiss={() => setView({ filters: { ...view.filters, status: statusFilter.filter((x) => x !== s) }, page: 1 })}>
                {`Status: ${WORKFLOW_STATUS[s].label}`}
              </Tag>
            ))}
          </span>
        )}
        <div className="io-list__end">
          {/* Swaps the region below, so FDS makes it Tabs (filled, no panels), not a ButtonGroup: a group has no selected state. */}
          {/* A tab strip can't be named itself (Tabs A8), so its wrapper carries the name. */}
          <div className="io-list__layout" role="group" aria-label="Show workflows as">
            <Tabs variant="filled" value={view.layout} onChange={(layout) => setView({ layout: layout as 'table' | 'cards' })}>
              <TabList>
                <TabItem value="table" leading={List} aria-label="Table" />
                <TabItem value="cards" leading={LayoutGrid} aria-label="Cards" />
              </TabList>
            </Tabs>
          </div>
          <Button label="Create workflow" leadingIcon={<Plus size={16} />} onClick={() => setCreateOpen(true)} />
        </div>
      </div>

      {view.layout === 'cards' ? (
        loading ? (
          <div className="io-center"><Spinner size="Large" accessibilityLabel="Loading workflows" delay={200} /></div>
        ) : loadFailed || cards.length === 0 ? (
          <div className="io-center">{emptyState}</div>
        ) : (
          <ul className="io-wf-cards" aria-label="Workflows">
            {cards.map((r) => <li key={r.id}><WorkflowCard row={r} on={handlers} /></li>)}
          </ul>
        )
      ) : (
      <Table<Row>
        accessibilityLabel="Workflows"
        data={loadFailed ? [] : data}
        columns={columns}
        getRowId={(r) => r.id}
        rowDensity="expanded"
        isLoading={loading}
        emptyState={emptyState}
        onRowClick={({ row }) => navigate(editorPath(row.id))}
        rowActions={rowActions}
        sortState={view.sort}
        onSortChange={(sort) => setView({ sort })}
        filterState={view.filters}
        onFilterChange={(filters) => setView({ filters, page: 1 })}
        pagination={{ type: 'client', page: view.page, onPageChange: ({ page }) => setView({ page }), defaultPageSize: 25, pageSizeOptions: [25, 50] }}
      />
      )}

      <WorkflowFormModal
        mode="create"
        isOpen={createOpen}
        draft={createDraft}
        onDraftChange={setCreateDraft}
        onDismiss={() => setCreateOpen(false)}
        onSubmit={(d) => {
          const wf = useIoWorkflows.getState().createWorkflow(d);
          setCreateOpen(false);
          setCreateDraft(EMPTY_DRAFT);
          navigate(editorPath(wf.id));
        }}
      />
      <WorkflowFormModal
        mode="rename"
        isOpen={!!renaming}
        draft={renaming?.draft ?? EMPTY_DRAFT}
        onDraftChange={(draft) => setRenaming((r) => (r ? { ...r, draft } : r))}
        onDismiss={() => setRenaming(null)}
        onSubmit={(d) => {
          if (renaming) useIoWorkflows.getState().updateMeta(renaming.id, { name: d.name });
          setRenaming(null);
        }}
      />
      <ConfirmModal
        isOpen={!!deleting}
        title="Delete workflow?"
        message={deleting ? `“${deleting.name}” and its ${executionCount} ${executionCount === 1 ? 'execution' : 'executions'} will be deleted. This can’t be undone.` : ''}
        confirmLabel="Delete workflow"
        onDismiss={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          useIoWorkflows.getState().remove(deleting.id);
          useIoExecutions.getState().removeForWorkflow(deleting.id);
          setDeleting(null);
          toast.show({ color: 'Positive', content: 'Workflow deleted' });
        }}
      />
    </div>
  );
}
