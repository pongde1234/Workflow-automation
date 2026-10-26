import { useMemo } from 'react';
import { getTrigger } from '../engine/graph';
import { defaultTestData, labelScope, render, triggerValues } from '../engine/simulate';
import { OutputTable } from '../ui/OutputTable';
import { useWorkflow } from '../pages/WorkflowContext';

/** Where the preview's values come from, said in a few words. */
const SOURCE_NOTE = {
  ioForms: 'Filled with the form’s sample answers.',
  deviceAlert: 'Filled with a reading just past the limit.',
  scheduler: 'Filled as if it ran now.',
} as const;

/**
 * What a message will actually say: the node's texts with every inserted
 * value filled in from the trigger's sample data, the same way a test run
 * fills them. Shown under the fields it previews; empty texts are left out.
 */
export function MessagePreview({ texts }: { texts: Record<string, string> }) {
  const { editor, ctx } = useWorkflow();
  const trigger = getTrigger(editor.graph);
  const scope = useMemo(
    () => labelScope(ctx.vars, triggerValues(trigger, defaultTestData(trigger, ctx, Date.now()))),
    [trigger, ctx],
  );
  if (!trigger) return null;
  const filled = Object.fromEntries(Object.entries(texts).filter(([, t]) => t.trim()).map(([k, t]) => [k, render(t, scope)]));
  if (Object.keys(filled).length === 0) return null;
  return (
    <section className="io-preview" aria-label="Preview">
      <div className="io-preview__head">
        <h3 className="BodyMediumSemibold">Preview</h3>
        <p className="io-muted BodySmallRegular">{SOURCE_NOTE[trigger.type as keyof typeof SOURCE_NOTE]}</p>
      </div>
      <OutputTable data={filled} label="Preview with sample values" />
    </section>
  );
}
