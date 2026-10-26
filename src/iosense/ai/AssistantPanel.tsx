import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AiApproval, AiComposer, AiConversation, AiDrawer, AiDrawerHome, AiMessage, AiResponse, AiSteps, AiThinking,
  type AiPrompt, type AiStatus, type AiStep,
} from '@faclon-labs/fds/ai';
import { uid } from '@/lib/util';
import { getTrigger } from '../engine/graph';
import { withFreshIds } from '../engine/graphOps';
import { editorPath } from '../lib/links';
import { useIoWorkflows } from '../store/workflowStore';
import { useIoSession } from '../store/sessionStore';
import { draftWorkflow, type DraftResult } from './draftWorkflow';

/*
 * FDS has no guard for the AI family (G10: said here rather than borrowed);
 * the composition follows the components' own docs and AppShell R9/R27.
 */

const PROMPTS: AiPrompt[] = [
  { id: 'breakdown', label: 'When a breakdown is reported as critical, email the maintenance leads and raise a work order' },
  { id: 'device', label: 'If the compressor temperature goes above 90, text the maintenance team and raise a work order' },
  { id: 'report', label: 'Every weekday at 8 am, send the energy report to Vikram and me' },
];

/** How long the simulated assistant "thinks", then types (FDS paces the words itself). */
const THINK_MS = 900;
const WRITE_MS = 1400;

type Turn =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; prompt: string; result: DraftResult; phase: 'thinking' | 'writing' | 'done'; outcome?: string };

const reasoning = (phase: 'writing' | 'done'): AiStep[] => [
  { label: 'Reading what should start it', status: 'completed' },
  { label: 'Matching forms, devices and people', status: 'completed' },
  { label: 'Laying out the steps', status: phase === 'done' ? 'completed' : 'active' },
];

function replyText(result: DraftResult): string {
  if (!result.ok) return result.error;
  const { draft } = result;
  const lead = `Here’s a draft, **${draft.name}**, with ${draft.graph.nodes.length} steps.`;
  return draft.notes.length ? `${lead}\n\nTo finish it:\n${draft.notes.map((n) => `- ${n}`).join('\n')}` : `${lead} It's ready to test as it is.`;
}

/**
 * The assistant (Bruce) in AppShell's docked panel: describe a workflow in a
 * sentence and it drafts one from the plant's forms, devices and people, for
 * you to add with one approval. Simulated: drafts come from keyword rules
 * (draftWorkflow), not a model, and the composer says so.
 */
export function AssistantPanel() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isOpen = useIoSession((s) => s.assistantOpen);
  const setOpen = useIoSession((s) => s.setAssistantOpen);
  const setPendingDraft = useIoSession((s) => s.setPendingDraft);
  const workflows = useIoWorkflows((s) => s.workflows);
  const directory = useIoWorkflows((s) => s);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Inside a workflow with nothing on it yet, a draft fills that workflow; anywhere else it becomes a new one.
  const openId = /^\/iosense\/workflows\/([^/]+)/.exec(pathname)?.[1];
  const current = workflows.find((w) => w.id === openId);
  const fillsCurrent = !!current && !getTrigger(current.graph);

  const last = turns[turns.length - 1];
  const status: AiStatus = last?.role === 'assistant' && last.phase === 'thinking' ? 'submitted'
    : last?.role === 'assistant' && last.phase === 'writing' ? 'streaming' : 'ready';

  const patch = (id: string, p: Partial<Extract<Turn, { role: 'assistant' }>>) =>
    setTurns((ts) => ts.map((t) => (t.id === id && t.role === 'assistant' ? { ...t, ...p } : t)));

  const ask = (prompt: string) => {
    const q = prompt.trim();
    if (!q) return;
    const id = uid('turn');
    const result = draftWorkflow(q, directory);
    setText('');
    setTurns((ts) => [...ts, { id: `${id}-q`, role: 'user', text: q }, { id, role: 'assistant', prompt: q, result, phase: 'thinking' }]);
    timers.current.push(
      window.setTimeout(() => patch(id, { phase: 'writing' }), THINK_MS),
      window.setTimeout(() => patch(id, { phase: 'done' }), THINK_MS + WRITE_MS),
    );
  };
  const finishNow = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setTurns((ts) => ts.map((t) => (t.role === 'assistant' && t.phase !== 'done' ? { ...t, phase: 'done' } : t)));
  };

  const apply = (turn: Extract<Turn, { role: 'assistant' }>) => {
    if (!turn.result.ok) return;
    const { draft } = turn.result;
    const graph = withFreshIds(draft.graph, uid);
    if (fillsCurrent && current) {
      setPendingDraft({ workflowId: current.id, graph });
      patch(turn.id, { outcome: `Added to **${current.name}**. Test it from the bar above the canvas.` });
      return;
    }
    const store = useIoWorkflows.getState();
    const wf = store.createWorkflow({ name: draft.name, description: turn.prompt.slice(0, 200) });
    store.saveGraph(wf.id, graph);
    patch(turn.id, { outcome: `Created **${wf.name}** and opened it.` });
    navigate(editorPath(wf.id));
  };

  return (
    <AiDrawer
      isOpen={isOpen}
      onDismiss={() => setOpen(false)}
      title="Bruce"
      subtitle={turns.length ? 'Workflow builder' : undefined}
      onNewChat={() => { finishNow(); setTurns([]); setText(''); }}
      footer={(
        <AiComposer
          value={text}
          onChange={setText}
          onSubmit={({ text: t }) => ask(t)}
          onStop={finishNow}
          status={status}
          placeholder="Describe a workflow, e.g. when… then…"
          footnote="Simulated assistant: drafts are built from keywords, not an AI model."
        />
      )}
    >
      {turns.length === 0 ? (
        <AiDrawerHome
          title="Build a workflow from a sentence"
          description="Say what should start it and what it should do. I’ll draft the steps for you to add."
          prompts={PROMPTS}
          onPromptPick={(p) => setText(p.label)}
        />
      ) : (
        <AiConversation status={status}>
          {turns.map((t) => (t.role === 'user' ? (
            <AiMessage key={t.id} role="user">{t.text}</AiMessage>
          ) : (
            <AiMessage key={t.id} role="assistant">
              {t.phase === 'thinking' ? <AiThinking /> : (
                <>
                  {t.result.ok && <AiSteps presentation="reasoning" status={t.phase === 'writing' ? 'streaming' : 'ready'} durationMs={THINK_MS} steps={reasoning(t.phase)} />}
                  <AiResponse isStreaming={t.phase === 'writing'}>{replyText(t.result)}</AiResponse>
                  {t.result.ok && t.phase === 'done' && (
                    <AiSteps presentation="plan" steps={t.result.draft.understood.map((label) => ({ label, status: 'completed' as const }))} />
                  )}
                  {t.result.ok && t.phase === 'done' && !t.outcome && (
                    <AiApproval
                      title={fillsCurrent ? 'Add these steps to this workflow?' : 'Create this workflow?'}
                      description={fillsCurrent && current
                        ? `Adds the ${t.result.draft.graph.nodes.length} steps to ‘${current.name}’. You can change anything afterwards.`
                        : `Creates ‘${t.result.draft.name}’ as a draft with these ${t.result.draft.graph.nodes.length} steps and opens it.`}
                      approveLabel={fillsCurrent ? 'Add to workflow' : 'Create workflow'}
                      denyLabel="Discard"
                      onApprove={() => apply(t)}
                      onDeny={() => patch(t.id, { outcome: 'Discarded. Describe it differently and I’ll try again.' })}
                    />
                  )}
                  {t.outcome && <AiResponse>{t.outcome}</AiResponse>}
                </>
              )}
            </AiMessage>
          )))}
        </AiConversation>
      )}
    </AiDrawer>
  );
}
