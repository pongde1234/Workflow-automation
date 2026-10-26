import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ActionList, ActionListItem, ActionListItemIcon, Badge, Button, Card, CardBody, CardHeader, CardHeaderIconButton, CardHeaderLeading,
  CardHeaderTrailing, DropdownMenu, DropdownMenuOverlay, DropdownMenuTrigger, EmptyState, Indicator, LinkButton,
  Counter, NoDataOneIllustration, NoSearchResultIllustration, SearchInput, Spinner, TabItem, TabList, TabPanel, Table, Tabs, TechnicalHiccupIllustration, useToast,
  type TableBulkAction, type TableColumn, type TableRowAction,
} from '@faclon-labs/fds';
import { Copy, Ellipsis, History, LayoutGrid, List, Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { timeAgo } from '@/lib/util';
import type { Execution, NodeType, Workflow, WorkflowStatus } from '../domain/types';
import { getTrigger } from '../engine/graph';
import { NODE_TYPES } from '../domain/nodeTypes';
import { useIoWorkflows } from '../store/workflowStore';
import { useIoExecutions } from '../store/executionStore';
import { useIoSession, type StatusTab } from '../store/sessionStore';
import { useIosenseReady } from '../seed/useIosenseReady';
import { demoFlag } from '../lib/demo';
import { editorPath, runPath } from '../lib/links';
import { useWidthClass } from '../lib/useViewportWidth';
import { EXECUTION_STATUS, WORKFLOW_STATUS } from '../ui/status';
import { ConfirmModal } from '../ui/ConfirmModal';
import { NodeTile } from '../ui/NodeTile';
import { WorkflowFormModal, type WorkflowDraft } from './WorkflowFormModal';
import { HistoryDrawer } from './HistoryDrawer';
import { TemplatesModal } from '../templates/TemplatesModal';
import { withFreshIds } from '../engine/graphOps';
import { tidyLayout } from '../engine/layout';
import { uid } from '@/lib/util';

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

/** The status tabs above the list, in the order a workflow moves through them. */
const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: 'all', label: 'All' },
  ...(['active', 'paused', 'draft'] as WorkflowStatus[]).map((s) => ({ value: s, label: WORKFLOW_STATUS[s].label })),
];

/** What an empty status tab says (when nothing is searched). */
const EMPTY_TAB: Record<WorkflowStatus, { title: string; description: string }> = {
  active: { title: 'No active workflows', description: 'Publish a draft, or switch an inactive workflow on, and it shows here.' },
  paused: { title: 'No inactive workflows', description: 'Workflows switched off on their page wait here until they’re switched on again.' },
  draft: { title: 'No drafts', description: 'New workflows stay here as drafts until they’re published.' },
};

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
  onEdit: (r: Row) => void;
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
        <CardHeaderIconButton size="xs" icon={<Ellipsis size={16} />} aria-label={`Actions for ${row.name}`} />
      </DropdownMenuTrigger>
      <DropdownMenuOverlay>
        <ActionList>
          <ActionListItem title="Edit" value="edit" leading={<ActionListItemIcon icon={Pencil} />} onClick={() => on.onEdit(row)} />
          <ActionListItem title="Duplicate" value="duplicate" leading={<ActionListItemIcon icon={Copy} />} onClick={() => on.onDuplicate(row)} />
          <ActionListItem title="History" value="history" leading={<ActionListItemIcon icon={History} />} onClick={() => on.onHistory(row)} />
          <ActionListItem title="Delete" value="delete" intent="negative" leading={<ActionListItemIcon icon={Trash2} />} onClick={() => on.onDelete(row)} />
        </ActionList>
      </DropdownMenuOverlay>
    </DropdownMenu>
  );
  return (
    <Card
      size="Medium"
      padding={16}
      height="100%"
      onClick={() => on.onOpen(row)}
      accessibilityLabel={`${row.name}, ${status.label}, ${lastRunText(row)}`}
    >
      <CardHeader showDivider={false}>
        <CardHeaderLeading title={row.name} subtitle={row.trigger} prefix={row.triggerType ? <NodeTile type={row.triggerType} size="xs" /> : undefined} />
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
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<WorkflowDraft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<{ id: string; draft: WorkflowDraft } | null>(null);
  /** The workflows a Delete is asking about: one from its row, or every selected one. */
  const [deleting, setDeleting] = useState<Workflow[]>([]);
  /** The workflow whose History is open over the list (kept while the drawer animates out). */
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [lastHistory, setLastHistory] = useState<string | null>(null);
  /** Rows ticked in the table, for the bulk actions in its Action column header. */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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
  // Each tab counts what the search leaves, so the counts say where the matches are.
  const counts = useMemo(() => {
    const c: Record<StatusTab, number> = { all: data.length, active: 0, paused: 0, draft: 0 };
    for (const r of data) c[r.status] += 1;
    return c;
  }, [data]);
  const shown = useMemo(() => (view.status === 'all' ? data : data.filter((r) => r.status === view.status)), [data, view.status]);

  // Cards follow the table's sort, so switching views keeps the same set in the same order.
  const cards = useMemo(() => {
    const cmp = view.sort ? SORTS[view.sort.columnKey] : undefined;
    if (!cmp || !view.sort) return shown;
    const dir = view.sort.direction === 'asc' ? 1 : -1;
    return [...shown].sort((a, b) => dir * cmp(a, b));
  }, [shown, view.sort]);

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
    onEdit: (r) => setEditing({ id: r.id, draft: { name: r.name, description: r.description } }),
    onDuplicate: (r) => useIoWorkflows.getState().duplicate(r.id),
    // History opens over the list; only Open in workflow (from a run) goes inside.
    onHistory: (r) => { setHistoryFor(r.id); setLastHistory(r.id); },
    onDelete: (r) => setDeleting(workflows.filter((w) => w.id === r.id)),
  };

  const rowActions = (r: Row): TableRowAction[] => [
    { label: 'Edit', accessibilityLabel: `Edit ${r.name}`, icon: Pencil, onClick: () => handlers.onEdit(r) },
    { label: 'Duplicate', accessibilityLabel: `Duplicate ${r.name}`, icon: Copy, onClick: () => handlers.onDuplicate(r) },
    { label: 'History', accessibilityLabel: `View execution history of ${r.name}`, icon: History, onClick: () => handlers.onHistory(r) },
    { label: 'Delete', accessibilityLabel: `Delete ${r.name}`, icon: Trash2, intent: 'negative', onClick: () => handlers.onDelete(r) },
  ];

  const emptyState = loadFailed ? (
    <EmptyState asset={<TechnicalHiccupIllustration />} title="Couldn’t load workflows" description="This browser’s storage didn’t respond. Your workflows are still saved; try again.">
      <Button variant="primary" tone="neutral" label="Retry" onClick={() => setLoadFailed(false)} />
    </EmptyState>
  ) : query && rows.length > 0 ? (
    <EmptyState
      asset={<NoSearchResultIllustration />}
      title="No workflows match"
      description={view.status === 'all'
        ? `Nothing matches “${view.search.trim()}”.`
        : `No ${WORKFLOW_STATUS[view.status].label.toLowerCase()} workflow matches “${view.search.trim()}”.`}
    >
      <LinkButton label="Clear search" onClick={() => setView({ search: '', page: 1 })} />
    </EmptyState>
  ) : view.status !== 'all' && rows.length > 0 ? (
    <EmptyState asset={<NoDataOneIllustration />} title={EMPTY_TAB[view.status].title} description={EMPTY_TAB[view.status].description}>
      <LinkButton label="Show all workflows" onClick={() => setView({ status: 'all', page: 1 })} />
    </EmptyState>
  ) : (
    <EmptyState asset={<NoDataOneIllustration />} title="No workflows yet" description="Automate plant routines with workflows that react to IO Forms or run on a schedule. Use Create workflow to start." />
  );

  // A selection belongs to the rows on screen: switching tab, view or search starts again.
  useEffect(() => setSelectedIds([]), [view.status, query, view.layout]);

  const selected = workflows.filter((w) => selectedIds.includes(w.id));
  /** Switches the selected workflows on or off. Drafts have no published version to run, so they stay drafts. */
  const setSelectedStatus = (status: 'active' | 'paused') => {
    const from = status === 'active' ? 'paused' : 'active';
    selected.filter((w) => w.status === from).forEach((w) => useIoWorkflows.getState().setStatus(w.id, status));
    const drafts = selected.filter((w) => w.status === 'draft').length;
    if (status === 'active' && drafts > 0) {
      toast.show({ color: 'Neutral', content: `${drafts === 1 ? '1 draft stays a draft' : `${drafts} drafts stay drafts`}: publish ${drafts === 1 ? 'it' : 'each'} from its page.` });
    }
    setSelectedIds([]);
  };
  // Common to the whole selection, in the Action column's header while rows are ticked (Table bulkActions).
  const bulkActions: TableBulkAction[] = [
    {
      label: 'Activate', accessibilityLabel: 'Activate the selected workflows', icon: Power,
      isDisabled: !selected.some((w) => w.status === 'paused' || w.status === 'draft'),
      onClick: () => setSelectedStatus('active'),
    },
    {
      label: 'Deactivate', accessibilityLabel: 'Deactivate the selected workflows', icon: PowerOff,
      isDisabled: !selected.some((w) => w.status === 'active'),
      onClick: () => setSelectedStatus('paused'),
    },
    { label: 'Delete', accessibilityLabel: 'Delete the selected workflows', icon: Trash2, intent: 'negative', onClick: () => setDeleting(selected) },
  ];

  const deletingIds = new Set(deleting.map((w) => w.id));
  const executionCount = executions.filter((e) => deletingIds.has(e.workflowId)).length;
  const runsText = `${executionCount} ${executionCount === 1 ? 'execution' : 'executions'}`;

  const loading = !ready || demo === 'loading';
  // Phones show cards: a table row there is mostly action icons, with the name cut short.
  const narrow = width === 'xs' || width === 'sm';
  const layout = narrow ? 'cards' : view.layout;

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
        <div className="io-list__end">
          {/* Swaps the region below, so FDS makes it Tabs (filled, no panels), not a ButtonGroup: a group has no selected state. */}
          {/* A tab strip can't be named itself (Tabs A8), so its wrapper carries the name. */}
          {!narrow && (
          <div className="io-list__layout" role="group" aria-label="Show workflows as">
            <Tabs variant="filled" value={view.layout} onChange={(layout) => setView({ layout: layout as 'table' | 'cards' })}>
              <TabList>
                <TabItem value="table" leading={List} aria-label="Table" />
                <TabItem value="cards" leading={LayoutGrid} aria-label="Cards" />
              </TabList>
            </Tabs>
          </div>
          )}
          <Button label="Create workflow" leadingIcon={<Plus size={16} />} onClick={() => setCreateOpen(true)} />
        </div>
      </div>

      {/* Status folders with counts (Tabs guard: "Inbox folders with counts", bordered with a Counter). Each tab's panel
          is the list filtered to it; only the open one is mounted. A tab strip can't be named itself (Tabs A8), so its
          wrapper carries the name. */}
      <div role="group" aria-label="Workflows by status">
        <Tabs className="io-list__tabs" value={view.status} onChange={(status) => setView({ status: status as StatusTab, page: 1 })} isLazy>
          <TabList>
            {STATUS_TABS.map((t) => (
              <TabItem key={t.value} value={t.value} trailing={<Counter value={loading ? 0 : counts[t.value]} />}>{t.label}</TabItem>
            ))}
          </TabList>
          {STATUS_TABS.map((t) => (
            <TabPanel key={t.value} value={t.value}>
              {layout === 'cards' ? (
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
                  data={loadFailed ? [] : shown}
                  columns={columns}
                  getRowId={(r) => r.id}
                  rowDensity="expanded"
                  isLoading={loading}
                  emptyState={emptyState}
                  onRowClick={({ row }) => navigate(editorPath(row.id))}
                  rowActions={rowActions}
                  selectionType="multiple"
                  selectedIds={selectedIds}
                  onSelectionChange={({ selectedIds: ids }) => setSelectedIds(ids.map(String))}
                  getSelectionAccessibilityLabel={(r) => `Select ${r.name}`}
                  bulkActions={bulkActions}
                  sortState={view.sort}
                  onSortChange={(sort) => setView({ sort })}
                  pagination={{ type: 'client', page: view.page, onPageChange: ({ page }) => setView({ page }), defaultPageSize: 25, pageSizeOptions: [25, 50] }}
                />
              )}
            </TabPanel>
          ))}
        </Tabs>
      </div>

      <HistoryDrawer
        workflowId={lastHistory ?? ''}
        workflowName={workflows.find((w) => w.id === lastHistory)?.name}
        isOpen={!!historyFor}
        onDismiss={() => setHistoryFor(null)}
        onOpenInWorkflow={(e, replay) => navigate(`${runPath(e.workflowId, e.id)}${replay ? '&replay=1' : ''}`)}
      />
      <WorkflowFormModal
        mode="create"
        isOpen={createOpen}
        draft={createDraft}
        onDraftChange={setCreateDraft}
        onDismiss={() => setCreateOpen(false)}
        onTemplates={() => { setCreateOpen(false); setTemplatesOpen(true); }}
        onSubmit={(d) => {
          const wf = useIoWorkflows.getState().createWorkflow(d);
          setCreateOpen(false);
          setCreateDraft(EMPTY_DRAFT);
          navigate(editorPath(wf.id));
        }}
      />
      {/* A new workflow from a template: the typed name wins if there is one, else the template's. */}
      <TemplatesModal
        isOpen={templatesOpen}
        onDismiss={() => setTemplatesOpen(false)}
        onPick={(t) => {
          const store = useIoWorkflows.getState();
          const name = createDraft.name.trim() || t.name;
          const wf = store.createWorkflow({ name, description: createDraft.description.trim() || t.description });
          store.saveGraph(wf.id, tidyLayout(withFreshIds(t.build(), uid), {}));
          setTemplatesOpen(false);
          setCreateDraft(EMPTY_DRAFT);
          navigate(editorPath(wf.id));
        }}
      />
      <WorkflowFormModal
        mode="edit"
        isOpen={!!editing}
        draft={editing?.draft ?? EMPTY_DRAFT}
        onDraftChange={(draft) => setEditing((r) => (r ? { ...r, draft } : r))}
        onDismiss={() => setEditing(null)}
        onSubmit={(d) => {
          if (editing) useIoWorkflows.getState().updateMeta(editing.id, { name: d.name, description: d.description });
          setEditing(null);
        }}
      />
      <ConfirmModal
        isOpen={deleting.length > 0}
        title={deleting.length > 1 ? `Delete ${deleting.length} workflows?` : 'Delete workflow?'}
        message={deleting.length > 1
          ? `${deleting.map((w) => `“${w.name}”`).join(', ')} and their ${runsText} will be deleted. This can’t be undone.`
          : deleting.length === 1 ? `“${deleting[0].name}” and its ${runsText} will be deleted. This can’t be undone.` : ''}
        confirmLabel={deleting.length > 1 ? `Delete ${deleting.length} workflows` : 'Delete workflow'}
        onDismiss={() => setDeleting([])}
        onConfirm={() => {
          for (const w of deleting) {
            useIoWorkflows.getState().remove(w.id);
            useIoExecutions.getState().removeForWorkflow(w.id);
          }
          toast.show({ color: 'Positive', content: deleting.length > 1 ? `${deleting.length} workflows deleted` : 'Workflow deleted' });
          setDeleting([]);
          setSelectedIds([]);
        }}
      />
    </div>
  );
}
