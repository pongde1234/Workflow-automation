import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  Background, BackgroundVariant, MiniMap, ReactFlow, ReactFlowProvider, ViewportPortal, useConnection, useReactFlow, useViewport,
  type NodeChange, type OnConnectEnd, type XYPosition,
} from '@xyflow/react';
import { Button, ButtonGroup, toastStore } from '@faclon-labs/fds';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BrushCleaning, Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import type { Execution, Graph, Issue, NodeType, TriggerType, WfNode, XY } from '../domain/types';
import { NODE_TYPES, type AddableType } from '../domain/nodeTypes';
import { canConnect, edgeFrom, flowOrder, getNode, getTrigger, handleLabel, incoming, outgoing, outputHandles } from '../engine/graph';
import { addNode, connect, disconnect, moveNode, updateNode, withFreshIds } from '../engine/graphOps';
import { uid } from '@/lib/util';
import { TemplatesModal } from '../templates/TemplatesModal';
import type { WorkflowTemplate } from '../templates/templates';
import { GRID, NODE_WIDTH, bounds, estimateSize, insertOnEdge, placeAfter, snap, tidyLayout, type Sizes } from '../engine/layout';
import { useIoSession, type Viewport } from '../store/sessionStore';
import { AiMark } from '@faclon-labs/fds/ai';
import { motionMs, useCoarsePointer, useWidthClass } from '../lib/useViewportWidth';
import { categoryOf } from '../ui/NodeTile';
import { NodePickerDrawer } from './NodePickerDrawer';
import { FirstStep } from './FirstStep';
import type { NodeChange as GraphNodeChange } from '../engine/diff';
import { CanvasActionsCtx, type CanvasActions, type NodeMenuAction } from './canvasActions';
import { FlowNode, type FlowNodeType } from './FlowNode';
import { EdgeArrowDefs, FlowConnectionLine, FlowEdge, takenEdgeIds, type FlowEdgeType } from './FlowEdge';
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, clampZoom, fitViewport, revealBox, toWorld } from './geometry';
import { CanvasOutline } from './CanvasOutline';
import type { SummaryContext } from './summary';

export type Selection = { kind: 'node'; id: string } | { kind: 'edge'; id: string } | null;

interface CanvasProps {
  workflowId: string;
  graph: Graph;
  ctx: SummaryContext;
  issues: Issue[];
  run?: Execution;
  selection: Selection;
  /** Screen px on the right covered by a docked panel. */
  rightInset: number;
  onSelect: (s: Selection) => void;
  onEdit: (next: Graph | ((g: Graph) => Graph), mergeKey?: string) => void;
  onCreateNode: (type: NodeType, at: XY) => WfNode;
  onDeleteNode: (id: string) => void;
  onConnectRequest: (id: string) => void;
  onAnnounce?: (message: string) => void;
  /** Nodes new or edited since the last publish. */
  changes?: Map<string, GraphNodeChange>;
}

/** Where the "Add a node" window will put the node: after an output, or on a connection. */
/** Minimap size in px: 3 × 2 of --spacing-64; node corners as --radius-l, in world units. */
const MINIMAP = { width: 192, height: 128, radius: 12 };
/** Fewer nodes than this fit on screen anyway: no minimap. */
const MINIMAP_FROM = 4;

type PickerTarget = { kind: 'trigger' } | { kind: 'after'; nodeId: string; handle: string } | { kind: 'insert'; edgeId: string };

/** Breathing room around the workflow when fitting it to the view (--spacing-32). */
const MARGIN = 32;
/** Grace period for moving the pointer from a connection onto its "+". */
const HOVER_GRACE_MS = 250;
/** How close (screen px) a dragged connection snaps to an input port. */
const CONNECT_RADIUS = 24;

const FLOW_NODE_TYPES = { wf: FlowNode };
const FLOW_EDGE_TYPES = { wf: FlowEdge };

const noop = () => {};

const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/**
 * The workflow canvas, on React Flow: it pans, zooms, drags nodes and draws
 * connections. Everything on it is FDS: nodes are Cards, controls are FDS
 * buttons, colours are tokens. React Flow's own keyboard handling and
 * selection are off; the canvas keeps its own (flow-order Tab, arrows along
 * connections, Shift+F10 for a node's menu, Move mode).
 */
export function Canvas(p: CanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvas {...p} />
    </ReactFlowProvider>
  );
}

function FlowCanvas(p: CanvasProps) {
  const { graph, ctx } = p;
  const rf = useReactFlow<FlowNodeType, FlowEdgeType>();
  const containerRef = useRef<HTMLDivElement>(null);
  const outlineId = useId();
  const saved = useIoSession((s) => s.viewports[p.workflowId]);
  const saveViewport = useIoSession((s) => s.setViewport);
  const viewRef = useRef<Viewport>(saved ?? { x: 0, y: 0, zoom: 1 });
  const fitted = useRef(!!saved);

  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});
  const [dragging, setDragging] = useState<Record<string, XYPosition>>({});
  const [menuNode, setMenuNode] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ id: string; origin: XY } | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const widthClass = useWidthClass();
  // Phones have no room for it; small workflows don't need it; and while a run's logs take the lower half, the
  // canvas is too short for it to sit clear of the cards.
  const showMinimap = graph.nodes.length >= MINIMAP_FROM && widthClass !== 'xs' && widthClass !== 'sm' && !p.run;
  const hoverTimer = useRef<number | undefined>(undefined);
  const cards = useRef(new Map<string, HTMLDivElement>());
  /** A click that ends a drag shouldn't also select the node. */
  const justDragged = useRef(false);
  const graphRef = useRef(graph);
  graphRef.current = graph;

  const sizes: Sizes = useMemo(() => Object.fromEntries(Object.entries(measured).map(([id, m]) => [id, { w: m.width, h: m.height }])), [measured]);
  const order = useMemo(() => flowOrder(graph), [graph]);
  const nodesInOrder = useMemo(() => order.map((id) => getNode(graph, id)!).filter(Boolean), [order, graph]);
  const trigger = getTrigger(graph);

  /* ── Viewport ── */

  const area = useCallback(() => {
    const el = containerRef.current;
    return { x: 0, y: 0, w: Math.max(0, (el?.clientWidth ?? 0) - p.rightInset), h: el?.clientHeight ?? 0 };
  }, [p.rightInset]);

  const moveView = useCallback((next: Viewport, smooth = false) => {
    void rf.setViewport(next, { duration: smooth ? motionMs('--global-duration-quick') : 0 });
  }, [rf]);

  const fit = useCallback((smooth = true) => {
    const box = bounds(graph, sizes);
    if (!box) return;
    moveView(fitViewport(box, area(), MARGIN, getTrigger(graph)?.position), smooth);
  }, [graph, sizes, area, moveView]);

  /** A template fills the workflow (beside anything already on it), laid out and fitted once its cards are measured. One undo step. */
  const applyTemplate = (t: WorkflowTemplate) => {
    setTemplatesOpen(false);
    const fresh = withFreshIds(t.build(), uid);
    p.onEdit((gr) => tidyLayout({ nodes: [...gr.nodes, ...fresh.nodes], edges: [...gr.edges, ...fresh.edges] }, sizes));
    fitted.current = false;
    p.onAnnounce?.(`Added the ${t.name} template.`);
  };

  // A draft the assistant was told to add here: placed beside anything already on the canvas, laid out, then fitted.
  const pendingDraft = useIoSession((s) => s.pendingDraft);
  useEffect(() => {
    if (!pendingDraft || pendingDraft.workflowId !== p.workflowId) return;
    const { graph: draft } = pendingDraft;
    useIoSession.getState().setPendingDraft(null);
    p.onEdit((gr) => tidyLayout({ nodes: [...gr.nodes, ...draft.nodes], edges: [...gr.edges, ...draft.edges] }, sizes));
    fitted.current = false;
    p.onAnnounce?.('Added the assistant’s draft.');
  }, [pendingDraft]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Tidy up: lays the flow out again and fits it in view. One edit, so Ctrl/⌘+Z puts the old layout back. */
  const tidy = () => {
    const next = tidyLayout(graph, sizes);
    p.onEdit(next);
    const box = bounds(next, sizes);
    if (box) moveView(fitViewport(box, area(), MARGIN, getTrigger(next)?.position), true);
    p.onAnnounce?.('Tidied up the layout. Undo puts it back.');
  };

  const zoomBy = (factor: number) => {
    void rf.zoomTo(clampZoom(rf.getViewport().zoom * factor), { duration: motionMs('--global-duration-quick') });
  };

  const reveal = useCallback((id: string) => {
    const n = getNode(graph, id);
    const m = sizes[id];
    // On phones the open drawer covers 90% of the screen: nothing useful to reveal around.
    if (!n || !m || (window.innerWidth < 480 && p.selection?.kind === 'node')) return;
    const now = rf.getViewport();
    const next = revealBox(now, { x: n.position.x, y: n.position.y, w: m.w, h: m.h }, area(), MARGIN / 2);
    if (next !== now) moveView(next, true);
  }, [graph, sizes, area, moveView, rf, p.selection]);

  // Remember where the person was, per workflow, for the session.
  useEffect(() => () => saveViewport(p.workflowId, viewRef.current), [p.workflowId, saveViewport]);

  // First visit: fit once every node has been measured.
  useEffect(() => {
    if (fitted.current || graph.nodes.length === 0) return;
    if (graph.nodes.every((n) => sizes[n.id])) {
      fitted.current = true;
      fit(false);
    }
  }, [sizes, graph.nodes, fit]);

  // Opening a node's drawer leaves the canvas where it is (the person asked for no movement); a node under the drawer
  // can be panned into view by hand. Keyboard moves between nodes still bring the focused one into view.
  const selectedNodeId = p.selection?.kind === 'node' ? p.selection.id : null;

  // During a test the canvas follows the node being worked on, so the run stays in view.
  const runningNodeId = p.run?.status === 'running' ? p.run.nodes.find((n) => n.status === 'running')?.nodeId : undefined;
  useEffect(() => {
    if (runningNodeId) reveal(runningNodeId);
  }, [runningNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Node changes from React Flow: sizes it measured, positions while dragging ── */

  const onNodesChange = useCallback((changes: NodeChange<FlowNodeType>[]) => {
    const dims = changes.filter((c) => c.type === 'dimensions' && c.dimensions);
    if (dims.length) {
      setMeasured((prev) => {
        let next = prev;
        for (const c of dims) {
          if (c.type !== 'dimensions' || !c.dimensions) continue;
          const old = prev[c.id];
          if (old && old.width === c.dimensions.width && old.height === c.dimensions.height) continue;
          next = { ...next, [c.id]: c.dimensions };
        }
        return next;
      });
    }
    const moves = changes.filter((c) => c.type === 'position' && c.position && c.dragging);
    if (moves.length) {
      justDragged.current = true;
      setDragging((prev) => {
        const next = { ...prev };
        for (const c of moves) if (c.type === 'position' && c.position) next[c.id] = c.position;
        return next;
      });
    }
  }, []);

  /** One undo step per drag: the graph only changes when the node is let go. */
  const onNodeDragStop = useCallback((_: unknown, node: FlowNodeType) => {
    const at = { x: snap(node.position.x), y: snap(node.position.y) };
    p.onEdit((g) => moveNode(g, node.id, at));
    setDragging({});
    window.setTimeout(() => { justDragged.current = false; }, 0);
  }, [p]);

  // Forget sizes of nodes that are gone.
  useEffect(() => {
    setMeasured((prev) => {
      const ids = new Set(graph.nodes.map((n) => n.id));
      return Object.keys(prev).every((id) => ids.has(id)) ? prev : Object.fromEntries(Object.entries(prev).filter(([id]) => ids.has(id)));
    });
  }, [graph.nodes]);

  /* ── Connecting ── */

  /** The node under a point given in the canvas's screen pixels (as React Flow reports a dragged connection's end). */
  const nodeAt = useCallback((screen: XYPosition) => {
    const at = toWorld(rf.getViewport(), screen);
    const pad = GRID / 2;
    return graphRef.current.nodes.find((n) => {
      const m = sizes[n.id];
      return m && at.x >= n.position.x - pad && at.x <= n.position.x + m.w + pad && at.y >= n.position.y - pad && at.y <= n.position.y + m.h + pad;
    });
  }, [sizes, rf]);

  const doConnect = useCallback((source: string, handle: string, target: string) => {
    const g = graphRef.current;
    const check = canConnect(g, source, handle, target);
    if (!check.ok) {
      toastStore.show({ color: 'Negative', content: `Can’t connect: ${check.reason}` });
      return;
    }
    p.onEdit((gr) => connect(gr, source, handle, target));
    p.onAnnounce?.(`Connected ‘${getNode(g, source)?.name}’ to ‘${getNode(g, target)?.name}’.`);
  }, [p]);

  /**
   * The output a drop would connect from when a connection is dragged out of an input: the port it
   * landed on, else the node's only output. A Switch has several, so it needs the row's own port.
   */
  const outputFor = useCallback((nodeId: string, handle?: string | null) => {
    const n = getNode(graphRef.current, nodeId);
    if (!n) return undefined;
    if (handle) return handle;
    const outs = outputHandles(n);
    return outs.length === 1 ? outs[0] : undefined;
  }, []);

  // Connections can be dragged from either end, and dropped on a node's body as well as on its port.
  const onConnectEnd: OnConnectEnd = useCallback((_e, state) => {
    if (!state.fromNode || !state.fromHandle) return;
    if (state.toHandle) {
      if (state.isValid !== false || !state.toNode) return; // a valid drop on a port already went through onConnect
      if (state.fromHandle.type === 'source') doConnect(state.fromNode.id, state.fromHandle.id ?? 'out', state.toNode.id);
      else doConnect(state.toNode.id, state.toHandle.id ?? 'out', state.fromNode.id);
      return;
    }
    const over = state.pointer ? nodeAt(state.pointer) : undefined;
    if (!over || over.id === state.fromNode.id) return;
    if (state.fromHandle.type === 'source') {
      doConnect(state.fromNode.id, state.fromHandle.id ?? 'out', over.id);
      return;
    }
    const handle = outputFor(over.id);
    if (handle) doConnect(over.id, handle, state.fromNode.id);
    else toastStore.show({ color: 'Notice', content: `Drop on the output of ‘${over.name}’ you want to connect from.` });
  }, [doConnect, nodeAt, outputFor]);

  // Subscribe to plain values only: React Flow's connection state is a new object on every pointer move,
  // and rebuilding the nodes from it each time would loop.
  const nodeAtRef = useRef(nodeAt);
  nodeAtRef.current = nodeAt;
  const connecting = useConnection((c) => c.inProgress);
  const connectFrom = useConnection((c) => (c.inProgress ? `${c.fromNode.id}|${c.fromHandle.id ?? 'out'}|${c.fromHandle.type}` : null));
  const connectOver = useConnection((c) => (c.inProgress ? `${c.toNode?.id ?? nodeAtRef.current(c.pointer)?.id ?? ''}|${c.toHandle?.id ?? ''}` : null));
  /** The node under a dragged connection, whether it may be dropped there, and which of its ports would take it. */
  const connectHover = useMemo(() => {
    if (!connectFrom || !connectOver) return undefined;
    const [from, fromHandle, fromType] = connectFrom.split('|');
    const [over, overHandle] = connectOver.split('|');
    if (!over || over === from) return undefined;
    if (fromType === 'source') return { id: over, side: 'in' as const, ok: canConnect(graph, from, fromHandle, over).ok };
    const handle = outputFor(over, overHandle || undefined);
    return { id: over, side: 'out' as const, handle, ok: !!handle && canConnect(graph, over, handle, from).ok };
  }, [connectFrom, connectOver, graph, outputFor]);
  const connectSide = connectFrom?.endsWith('|target') ? 'from-input' : connectFrom ? 'from-output' : undefined;

  /* ── Adding nodes ── */

  const addAfter = useCallback((sourceId: string, handle: string, type: NodeType) => {
    const draft = p.onCreateNode(type, { x: 0, y: 0 });
    const position = placeAfter(graph, sizes, sourceId, handle, estimateSize(draft));
    const node = { ...draft, position } as WfNode;
    p.onEdit((gr) => connect(addNode(gr, node), sourceId, handle, node.id));
    p.onSelect({ kind: 'node', id: node.id });
    const src = getNode(graph, sourceId);
    p.onAnnounce?.(`Added ${NODE_TYPES[type].label} ‘${node.name}’ after ‘${src ? handleLabel(src, handle, ctx.vars) : ''}’.`);
  }, [graph, sizes, p, ctx.vars]);

  const addTrigger = (type: TriggerType) => {
    const a = area();
    const center = toWorld(rf.getViewport(), { x: a.w / 2, y: a.h / 2 });
    const node = p.onCreateNode(type, { x: snap(center.x - NODE_WIDTH / 2), y: snap(center.y - 72) });
    p.onEdit((gr) => addNode(gr, node));
    p.onSelect({ kind: 'node', id: node.id });
  };

  /** Puts a new node on an existing connection, between its two nodes. */
  const insertOn = useCallback((id: string, type: NodeType) => {
    const edge = graph.edges.find((e) => e.id === id);
    if (!edge) return;
    const node = p.onCreateNode(type, { x: 0, y: 0 });
    p.onEdit((gr) => insertOnEdge(gr, sizes, id, node));
    p.onSelect({ kind: 'node', id: node.id });
    setHoverEdge(null);
    p.onAnnounce?.(`Inserted ${NODE_TYPES[type].label} ‘${node.name}’ between ‘${getNode(graph, edge.source)?.name}’ and ‘${getNode(graph, edge.target)?.name}’.`);
  }, [graph, sizes, p]);

  /** Opens the list of steps; a node's settings close first (what was typed in them stays), so one drawer shows. */
  const openPicker = (target: PickerTarget) => {
    p.onSelect(null);
    setPicker(target);
  };

  /** Puts the type chosen in the picker where it was asked for. */
  const pick = (picked: NodeType) => {
    const target = picker;
    setPicker(null);
    if (!target) return;
    if (target.kind === 'trigger') { addTrigger(picked as TriggerType); return; }
    const type = picked as AddableType;
    if (target.kind === 'insert') { insertOn(target.edgeId, type); return; }
    // An output that is already connected gets the node in between.
    const existing = edgeFrom(graph, target.nodeId, target.handle);
    if (existing) insertOn(existing.id, type);
    else addAfter(target.nodeId, target.handle, type);
  };

  const pickerContext = (() => {
    if (!picker || picker.kind === 'trigger') return undefined;
    if (picker.kind === 'insert') {
      const edge = graph.edges.find((e) => e.id === picker.edgeId);
      return edge ? `Between ‘${getNode(graph, edge.source)?.name}’ and ‘${getNode(graph, edge.target)?.name}’` : undefined;
    }
    const n = getNode(graph, picker.nodeId);
    if (!n) return undefined;
    return n.type === 'switch' ? `After ‘${handleLabel(n, picker.handle, ctx.vars)}’ in ‘${n.name}’` : `After ‘${n.name}’`;
  })();

  /* ── Focus, Move mode and the keyboard ── */

  /** The Card's own button (its overlay) is the node's focus target. */
  const focusNode = useCallback((id: string) => {
    const target = cards.current.get(id)?.lastElementChild as HTMLElement | null;
    target?.focus({ preventScroll: true });
    reveal(id);
  }, [reveal]);

  const nudge = (dx: number, dy: number) => {
    if (!moving) return;
    p.onEdit((gr) => {
      const n = getNode(gr, moving.id);
      return n ? moveNode(gr, moving.id, { x: n.position.x + dx * GRID, y: n.position.y + dy * GRID }) : gr;
    }, `move:${moving.id}`);
    window.setTimeout(() => reveal(moving.id), 0);
  };

  const endMove = (keep: boolean) => {
    if (!moving) return;
    if (!keep) p.onEdit((gr) => moveNode(gr, moving.id, moving.origin), `move:${moving.id}`);
    const id = moving.id;
    setMoving(null);
    window.setTimeout(() => focusNode(id), 0);
  };

  const onMenuAction = (id: string, action: NodeMenuAction) => {
    setMenuNode(null);
    switch (action.kind) {
      case 'add': openPicker({ kind: 'after', nodeId: id, handle: action.handle }); break;
      case 'connect': p.onConnectRequest(id); break;
      case 'delete': p.onDeleteNode(id); break;
      case 'toggleDisabled': {
        const n = getNode(graph, id);
        p.onEdit((gr) => updateNode(gr, id, (x) => ({ ...x, settings: { ...x.settings, disabled: !x.settings?.disabled } })));
        if (n) p.onAnnounce?.(`‘${n.name}’ ${n.settings?.disabled ? 'enabled' : 'disabled'}.`);
        break;
      }
      case 'move': {
        const n = getNode(graph, id);
        if (n) setMoving({ id, origin: n.position });
        p.onAnnounce?.(`Moving ‘${n?.name}’. Use the arrow keys or the arrow buttons; Enter or Done keeps it, Escape puts it back.`);
        window.setTimeout(() => focusNode(id), 0);
        break;
      }
    }
  };

  const onNodeKeyDown = (e: KeyboardEvent<HTMLDivElement>, id: string) => {
    // Keys typed in the node's own menu (rendered in a portal) belong to the menu.
    if (isTyping(e.target) || !cards.current.get(id)?.contains(e.target as Node)) return;
    if (moving?.id === id) {
      const step = e.shiftKey ? 4 : 1;
      const keys: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (keys[e.key]) { e.preventDefault(); nudge(...keys[e.key]); return; }
      if (e.key === 'Enter') { e.preventDefault(); endMove(true); return; }
      if (e.key === 'Escape') { e.preventDefault(); endMove(false); return; }
    }
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault();
      setMenuNode(id);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      p.onDeleteNode(id);
      return;
    }
    const n = getNode(graph, id);
    if (!n) return;
    let next: string | undefined;
    if (e.key === 'ArrowRight') {
      next = outputHandles(n).map((h) => edgeFrom(graph, id, h)?.target).find(Boolean);
    } else if (e.key === 'ArrowLeft') {
      next = incoming(graph, id)[0]?.source;
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const parent = incoming(graph, id)[0]?.source;
      const siblings = parent ? outgoing(graph, parent).map((x) => x.target) : order;
      const list = siblings.length > 1 ? siblings : order;
      const i = list.indexOf(id);
      next = list[i + (e.key === 'ArrowDown' ? 1 : -1)];
    } else if (e.key === 'Home') next = order[0];
    else if (e.key === 'End') next = order[order.length - 1];
    if (next) {
      e.preventDefault();
      focusNode(next);
    }
  };

  /* ── What nodes and edges can ask for (stable, always the latest handlers) ── */

  const latest = useRef<CanvasActions>(null!);
  latest.current = {
    onSelectNode: (id) => { if (!justDragged.current) p.onSelect({ kind: 'node', id }); },
    onNodeKeyDown,
    onMenuAction,
    onMenuOpenChange: (id, open) => setMenuNode(open ? id : null),
    registerCard: (id, el) => { if (el) cards.current.set(id, el); else cards.current.delete(id); },
    onInsert: (edgeId) => openPicker({ kind: 'insert', edgeId }),
    onRemoveEdge: (edgeId) => { p.onEdit((gr) => disconnect(gr, edgeId)); p.onSelect(null); setHoverEdge(null); },
    onHoverEdge: (edgeId) => {
      window.clearTimeout(hoverTimer.current);
      if (edgeId) setHoverEdge(edgeId);
      else hoverTimer.current = window.setTimeout(() => setHoverEdge(null), HOVER_GRACE_MS);
    },
  };
  const actions = useMemo<CanvasActions>(() => ({
    onSelectNode: (...a) => latest.current.onSelectNode(...a),
    onNodeKeyDown: (...a) => latest.current.onNodeKeyDown(...a),
    onMenuAction: (...a) => latest.current.onMenuAction(...a),
    onMenuOpenChange: (...a) => latest.current.onMenuOpenChange(...a),
    registerCard: (...a) => latest.current.registerCard(...a),
    onInsert: (...a) => latest.current.onInsert(...a),
    onRemoveEdge: (...a) => latest.current.onRemoveEdge(...a),
    onHoverEdge: (...a) => latest.current.onHoverEdge(...a),
  }), []);

  /* ── React Flow's nodes and edges, built from the graph ── */

  const runById = useMemo(() => new Map(p.run?.nodes
    // While a test runs, nodes it hasn't reached yet show nothing rather than "Not run".
    .filter((n) => !(p.run?.status === 'running' && n.status === 'not_run'))
    .map((n) => [n.nodeId, n])), [p.run]);
  const issueByNode = useMemo(() => {
    const m = new Map<string, 'error' | 'unreachable'>();
    for (const i of p.issues) {
      if (!i.nodeId) continue;
      if (i.severity === 'error') m.set(i.nodeId, 'error');
      else if (i.id.endsWith(':unreachable:warning') && !m.has(i.nodeId)) m.set(i.nodeId, 'unreachable');
    }
    return m;
  }, [p.issues]);

  const nodes = useMemo<FlowNodeType[]>(() => nodesInOrder.map((n) => ({
    id: n.id,
    type: 'wf',
    position: dragging[n.id] ?? n.position,
    ...(measured[n.id] ? { measured: measured[n.id] } : {}),
    draggable: moving?.id !== n.id,
    selectable: false,
    data: {
      node: n,
      ctx,
      isSelected: selectedNodeId === n.id,
      run: runById.get(n.id),
      issue: issueByNode.get(n.id),
      freeOutputs: outputHandles(n).filter((h) => !edgeFrom(graph, n.id, h)).map((h) => ({ handle: h, label: handleLabel(n, h, ctx.vars) })),
      allOutputs: outputHandles(n).map((h) => ({ handle: h, label: handleLabel(n, h, ctx.vars) })),
      connectHint: connectHover?.id === n.id
        ? { state: connectHover.ok ? 'valid' : 'invalid', side: connectHover.side, handle: connectHover.side === 'out' ? connectHover.handle : undefined }
        : undefined,
      isMenuOpen: menuNode === n.id,
      change: p.changes?.get(n.id),
    },
  })), [nodesInOrder, dragging, measured, moving, ctx, selectedNodeId, runById, issueByNode, graph, connectHover, menuNode, p.changes]);

  const taken = useMemo(() => takenEdgeIds(p.run), [p.run]);
  // While a test runs, the link into the node being worked on flows.
  const flowing = useMemo(() => {
    if (p.run?.status !== 'running') return null;
    const busy = new Set(p.run.nodes.filter((n) => n.status === 'queued' || n.status === 'running').map((n) => n.nodeId));
    const ran = new Set(p.run.path);
    return new Set(graph.edges.filter((e) => ran.has(e.source) && busy.has(e.target)).map((e) => e.id));
  }, [p.run, graph.edges]);
  const selectedEdgeId = p.selection?.kind === 'edge' ? p.selection.id : null;

  const edges = useMemo<FlowEdgeType[]>(() => graph.edges.map((e) => ({
    id: e.id,
    type: 'wf',
    source: e.source,
    sourceHandle: e.sourceHandle,
    target: e.target,
    targetHandle: 'in',
    selectable: false,
    focusable: false,
    data: {
      from: getNode(graph, e.source)?.name ?? '',
      to: getNode(graph, e.target)?.name ?? '',
      isSelected: selectedEdgeId === e.id,
      isHighlighted: !connecting && hoverEdge === e.id,
      run: flowing?.has(e.id) ? 'flowing' : taken ? (taken.has(e.id) ? 'taken' : 'untaken') : undefined,
      showControls: !connecting,
    },
  })), [graph, selectedEdgeId, connecting, hoverEdge, flowing, taken]);

  const movingNode = moving ? getNode(graph, moving.id) : undefined;
  const movingSize = moving ? sizes[moving.id] : undefined;

  return (
    <CanvasActionsCtx.Provider value={actions}>
      <div
        ref={containerRef}
        className="io-canvas"
        role="region"
        aria-label="Workflow canvas"
        aria-describedby={outlineId}
        data-connecting={connectSide}
      >
        <ReactFlow<FlowNodeType, FlowEdgeType>
          // No "React Flow" credit link in the corner (allowed by its MIT licence; its authors ask Pro subscribers to do this).
          proOptions={{ hideAttribution: true }}
          nodes={nodes}
          edges={edges}
          nodeTypes={FLOW_NODE_TYPES}
          edgeTypes={FLOW_EDGE_TYPES}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onConnect={(c) => doConnect(c.source, c.sourceHandle ?? 'out', c.target)}
          onConnectEnd={onConnectEnd}
          isValidConnection={(c) => canConnect(graphRef.current, c.source, c.sourceHandle ?? 'out', c.target).ok}
          connectionLineComponent={FlowConnectionLine}
          connectionRadius={CONNECT_RADIUS}
          // Cards select themselves; this keeps nodes tappable in Move mode (not draggable then),
          // since React Flow turns pointer events off on nodes with nothing to handle them.
          onNodeClick={noop}
          onEdgeClick={(_, e) => p.onSelect({ kind: 'edge', id: e.id })}
          onPaneClick={() => { p.onSelect(null); setPicker(null); }}
          defaultViewport={viewRef.current}
          onMove={(_, v) => { viewRef.current = v; }}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          // A wheel pans; Ctrl/⌘ + wheel and pinch zoom, as before.
          panOnScroll
          zoomOnScroll={false}
          zoomOnPinch
          zoomOnDoubleClick={false}
          // Drag a node to move it (touch too); drag empty canvas to pan.
          nodesDraggable
          snapToGrid
          snapGrid={[GRID, GRID]}
          elementsSelectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          disableKeyboardA11y
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
        >
          <Background variant={BackgroundVariant.Dots} gap={GRID} size={2} color="var(--border-neutral-highlighted)" />
          {/* An overview of a bigger workflow, bottom-right: drag or scroll in it to move around. Its colours come from
              CSS (React Flow paints them as SVG attributes, which can't take tokens); it steps left of an open drawer. */}
          {showMinimap && (
            <MiniMap
              pannable
              zoomable
              ariaLabel="Workflow overview"
              position="bottom-right"
              nodeClassName={(n) => `io-mm io-mm--${categoryOf((n.data as FlowNodeType['data']).node.type).tone}`}
              nodeBorderRadius={MINIMAP.radius}
              style={{ width: MINIMAP.width, height: MINIMAP.height, marginRight: p.rightInset }}
            />
          )}
          {movingNode && movingSize && (
            <ViewportPortal>
              <div
                className="io-canvas__move nodrag nopan"
                style={{ transform: `translate(${movingNode.position.x}px, ${movingNode.position.y + movingSize.h}px)` }}
              >
                <ButtonGroup variant="Secondary" size="sm">
                  <Button iconOnly aria-label="Move left" leadingIcon={<ArrowLeft size={16} />} onClick={() => nudge(-1, 0)} />
                  <Button iconOnly aria-label="Move up" leadingIcon={<ArrowUp size={16} />} onClick={() => nudge(0, -1)} />
                  <Button iconOnly aria-label="Move down" leadingIcon={<ArrowDown size={16} />} onClick={() => nudge(0, 1)} />
                  <Button iconOnly aria-label="Move right" leadingIcon={<ArrowRight size={16} />} onClick={() => nudge(1, 0)} />
                </ButtonGroup>
                <Button size="sm" variant="secondary" tone="neutral" label="Done" onClick={() => endMove(true)} />
              </div>
            </ViewportPortal>
          )}
        </ReactFlow>

        {!trigger && (
          <div className="io-canvas__start">
            <FirstStep
              onAdd={() => openPicker({ kind: 'trigger' })}
              onTemplate={() => setTemplatesOpen(true)}
              ai={<Button variant="secondary" tone="neutral" label="Build with AI" leadingIcon={<AiMark size={16} />} onClick={() => useIoSession.getState().setAssistantOpen(true)} />}
            />
          </div>
        )}

        {graph.nodes.length > 0 && <ZoomControls onZoom={zoomBy} onFit={() => fit()} onTidy={tidy} />}

        <TemplatesModal isOpen={templatesOpen} onPick={applyTemplate} onDismiss={() => setTemplatesOpen(false)} />
        <EdgeArrowDefs />
        <CanvasOutline id={outlineId} graph={graph} order={order} ctx={ctx} run={p.run} />
        <NodePickerDrawer
          kind={picker ? (picker.kind === 'trigger' ? 'trigger' : 'next') : null}
          context={pickerContext}
          onPick={pick}
          onDismiss={() => setPicker(null)}
        />
      </div>
    </CanvasActionsCtx.Provider>
  );
}

/**
 * Bottom-left canvas controls; only this re-renders while the view moves. Fit,
 * zoom in, zoom out and Tidy up are one FDS ButtonGroup (Tertiary: a toolbar;
 * md where fingers point). A group takes buttons only, so the read-only zoom
 * level sits beside it.
 */
function ZoomControls({ onZoom, onFit, onTidy }: { onZoom: (factor: number) => void; onFit: () => void; onTidy: () => void }) {
  const { zoom } = useViewport();
  const coarse = useCoarsePointer();
  const pct = `${Math.round(zoom * 100)}%`;
  return (
    <div className="io-canvas__zoom">
      <ButtonGroup variant="Tertiary" size={coarse ? 'md' : 'sm'} aria-label="Canvas view">
        <Button iconOnly aria-label="Fit to view" leadingIcon={<Maximize size={16} />} onClick={onFit} />
        <Button iconOnly aria-label="Zoom in" leadingIcon={<ZoomIn size={16} />} onClick={() => onZoom(ZOOM_STEP)} />
        <Button iconOnly aria-label="Zoom out" leadingIcon={<ZoomOut size={16} />} onClick={() => onZoom(1 / ZOOM_STEP)} />
        <Button iconOnly aria-label="Tidy up" leadingIcon={<BrushCleaning size={16} />} onClick={onTidy} />
      </ButtonGroup>
      <span className="io-canvas__zoom-level BodySmallMedium" aria-label={`Zoom ${pct}`}>{pct}</span>
    </div>
  );
}
