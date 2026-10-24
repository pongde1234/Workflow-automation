import type { NodeType } from '../domain/types';
import { NODE_TYPES, type NodeCategory } from '../domain/nodeTypes';
import { NODE_ICON } from './nodeIcons';

/**
 * A node's role, said in words (its Neutral Badge). Every tile shares the one
 * brand tint: FDS colours mean a status, and on the canvas green, red and
 * orange are kept for how a run went.
 */
export const CATEGORY: Record<NodeCategory, { label: string }> = {
  trigger: { label: 'Trigger' },
  logic: { label: 'Logic' },
  action: { label: 'Action' },
};

export const categoryOf = (t: NodeType) => CATEGORY[NODE_TYPES[t].category];

const ICON_SIZE = { xs: 14, sm: 16, md: 20, lg: 24 } as const;

/** The node type's icon on a brand-tinted tile (tokens only). `xs` fits a 20×20 slot such as DrawerHeader's leading. */
export function NodeTile({ type, size = 'md' }: { type: NodeType; size?: keyof typeof ICON_SIZE }) {
  const Icon = NODE_ICON[type];
  return (
    <span className="io-tile" data-size={size} aria-hidden="true">
      <Icon size={ICON_SIZE[size]} />
    </span>
  );
}
