import type { CSSProperties } from 'react';
import { Button, Tooltip } from '@faclon-labs/fds';
import { Plus } from 'lucide-react';
import { useCanvasButtonSize } from '../lib/useViewportWidth';

interface AddNodeButtonProps {
  /** Names the exact spot for screen readers, e.g. "Insert a node between ‘A’ and ‘B’". */
  label: string;
  /** Opens the "Add a node" window for this spot. */
  onClick: () => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * The canvas's "+": a white bordered button, the same surface as the node
 * cards, so it reads as a control at rest without adding colour to every line.
 * The Tooltip names it for sighted readers. It stays out of the Tab order:
 * keyboard users add nodes from the node's ⋯ menu.
 */
export function AddNodeButton({ label, onClick, className, style }: AddNodeButtonProps) {
  const size = useCanvasButtonSize();
  return (
    <Tooltip content="Add a node here">
      <Button
        iconOnly
        size={size}
        variant="secondary"
        tone="neutral"
        tabIndex={-1}
        aria-label={label}
        leadingIcon={<Plus size={16} />}
        className={className}
        style={style}
        onClick={onClick}
      />
    </Tooltip>
  );
}
