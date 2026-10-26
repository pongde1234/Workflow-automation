import type { ComponentType } from 'react';
import type { NodeType } from '../domain/types';
import { NODE_TYPES, type NodeCategory } from '../domain/nodeTypes';
import { NODE_ICON } from './nodeIcons';

/**
 * One FDS colour family per role on the tile, so the flow reads at a glance:
 * Triggers notice, Logic brand, Actions positive. The role's Badge stays
 * Neutral: Badge colours mean status, and the tile already says it.
 */
export const CATEGORY: Record<NodeCategory, { label: string; tone: 'notice' | 'brand' | 'positive' }> = {
  trigger: { label: 'Trigger', tone: 'notice' },
  logic: { label: 'Logic', tone: 'brand' },
  action: { label: 'Action', tone: 'positive' },
};

export const categoryOf = (t: NodeType) => CATEGORY[NODE_TYPES[t].category];

const ICON_SIZE = { xs: 14, sm: 16, md: 20, lg: 24 } as const;
type TileSize = keyof typeof ICON_SIZE;
export type TileTone = 'notice' | 'brand' | 'positive' | 'negative' | 'info';

/** An icon on a tile tinted with one FDS colour family (tokens only). `xs` fits a 20×20 slot such as DrawerHeader's leading. */
export function IconTile({ icon: Icon, tone, size = 'md' }: { icon: ComponentType<{ size?: number }>; tone: TileTone; size?: TileSize }) {
  return (
    <span className="io-tile" data-tone={tone} data-size={size} aria-hidden="true">
      <Icon size={ICON_SIZE[size]} />
    </span>
  );
}

/** The node type's icon on a tile tinted with its role's colour. */
export function NodeTile({ type, size = 'md' }: { type: NodeType; size?: TileSize }) {
  return <IconTile icon={NODE_ICON[type]} tone={categoryOf(type).tone} size={size} />;
}
