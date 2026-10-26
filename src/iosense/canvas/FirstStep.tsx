import type { ReactNode } from 'react';
import { Button } from '@faclon-labs/fds';
import { LayoutTemplate, Plus } from 'lucide-react';

/**
 * An empty workflow's starting point: a dashed "+" tile with "Add first step…"
 * under it, which opens the list of triggers; then, after "or", the other ways
 * in (a template, or a sentence for the assistant). The tile is a canvas
 * composite from tokens (FDS has no placeholder tile); its dashed border is
 * FDS's own, as on AppCenter's empty glyph.
 */
export function FirstStep({ onAdd, onTemplate, ai }: {
  onAdd: () => void;
  onTemplate?: () => void;
  /** The "Build with AI" button, when the assistant is available. */
  ai?: ReactNode;
}) {
  return (
    <div className="io-first">
      <button type="button" className="io-first-step" onClick={onAdd}>
        <span className="io-first-step__tile" aria-hidden="true"><Plus size={32} /></span>
        <span className="BodyMediumSemibold">Add first step…</span>
        <span className="io-muted BodySmallRegular">Choose what starts this workflow</span>
      </button>
      {(onTemplate || ai) && (
        <div className="io-first__alts">
          <span className="io-muted BodySmallRegular">or</span>
          {onTemplate && <Button variant="secondary" tone="neutral" label="Start from a template" leadingIcon={<LayoutTemplate size={16} />} onClick={onTemplate} />}
          {ai}
        </div>
      )}
    </div>
  );
}
