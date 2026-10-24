import { createContext, useContext, type KeyboardEvent } from 'react';

export type NodeMenuAction =
  | { kind: 'add'; handle: string }
  | { kind: 'connect' } | { kind: 'move' } | { kind: 'delete' };

/**
 * What nodes and edges on the canvas can ask the canvas to do. Provided once
 * with stable methods (they call the latest handlers), so React Flow's node
 * and edge components don't re-render when a handler changes. Lives in its own
 * module so a hot reload of Canvas.tsx doesn't create a second context.
 */
export interface CanvasActions {
  onSelectNode: (id: string) => void;
  onNodeKeyDown: (e: KeyboardEvent<HTMLDivElement>, id: string) => void;
  onMenuAction: (id: string, action: NodeMenuAction) => void;
  onMenuOpenChange: (id: string, open: boolean) => void;
  registerCard: (id: string, el: HTMLDivElement | null) => void;
  /** Opens "Add a node" for a connection. */
  onInsert: (edgeId: string) => void;
  onRemoveEdge: (edgeId: string) => void;
  /** Pointer over a connection (null when it leaves): highlights it. */
  onHoverEdge: (edgeId: string | null) => void;
}

export const CanvasActionsCtx = createContext<CanvasActions | null>(null);

export function useCanvasActions(): CanvasActions {
  const v = useContext(CanvasActionsCtx);
  if (!v) throw new Error('useCanvasActions must be used inside the workflow canvas');
  return v;
}
