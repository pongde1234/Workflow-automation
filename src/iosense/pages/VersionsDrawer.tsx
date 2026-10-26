import { useEffect, useState } from 'react';
import {
  ActionList, ActionListItem, ActionListItemBadge, Badge, Button, Drawer, DrawerBody, DrawerFooter, DrawerHeader, LinkButton,
} from '@faclon-labs/fds';
import { ArrowLeft } from 'lucide-react';
import type { Graph, WfNode, Workflow, WorkflowVersion } from '../domain/types';
import { graphChanges } from '../engine/diff';
import { useIoWorkflows } from '../store/workflowStore';
import { formatStamp } from '../ui/format';
import { NODE_ICON } from '../ui/nodeIcons';

/** How the draft differs from a version, node by node, in the draft's terms. */
function differences(draft: Graph, version: Graph): { node: WfNode; label: 'Added' | 'Changed' | 'Removed' }[] {
  const c = graphChanges(draft, version);
  const inDraft = new Set(draft.nodes.map((n) => n.id));
  return [
    ...draft.nodes.filter((n) => c.byNode.has(n.id)).map((node) => ({ node, label: c.byNode.get(node.id) === 'new' ? 'Added' as const : 'Changed' as const })),
    ...version.nodes.filter((n) => !inDraft.has(n.id)).map((node) => ({ node, label: 'Removed' as const })),
  ];
}

/**
 * Every publish of this workflow, newest first: who published it, when, and
 * what changed from the one before. Picking one compares it with the current
 * draft and offers to restore it into the draft (undoable; it goes live only
 * through Publish changes). Beside the canvas with no scrim, like the node's
 * settings.
 */
export function VersionsDrawer({ workflow, draft, isOpen, onDismiss, onRestore }: {
  workflow: Workflow;
  draft: Graph;
  isOpen: boolean;
  onDismiss: () => void;
  onRestore: (v: WorkflowVersion) => void;
}) {
  const users = useIoWorkflows((s) => s.users);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => { if (isOpen) setOpenId(null); }, [isOpen]);
  const versions = [...(workflow.versions ?? [])].reverse();
  const live = workflow.status !== 'draft' ? versions[0]?.id : undefined;
  const who = (id: string) => users.find((u) => u.id === id)?.name ?? 'Someone';
  const open = versions.find((v) => v.id === openId);

  if (open) {
    const diffs = differences(draft, open.graph);
    return (
      <Drawer isOpen={isOpen} onDismiss={onDismiss} showOverlay={false} isModal={false}>
        <DrawerHeader
          title={`Version ${open.number}`}
          subtitle={`${who(open.publishedBy)} · ${formatStamp(open.publishedAt)}`}
          titleSuffix={open.id === live ? <Badge label="Live" color="Positive" /> : undefined}
        />
        <DrawerBody>
          <div className="io-versions">
            <span className="io-history__back"><LinkButton label="All versions" icon={<ArrowLeft size={12} />} onClick={() => setOpenId(null)} /></span>
            <h3 className="BodyMediumSemibold">{diffs.length ? 'Your draft compared with this version' : 'Your draft is the same as this version'}</h3>
            {diffs.length > 0 && (
              <ul className="io-versions__diff" aria-label="Differences">
                {diffs.map(({ node, label }) => {
                  const Icon = NODE_ICON[node.type];
                  return (
                    <li key={`${label}-${node.id}`} className="io-versions__row">
                      <Icon size={16} aria-hidden="true" />
                      <span className="BodyMediumRegular io-versions__name">{node.name}</span>
                      <Badge label={label} color={label === 'Removed' ? 'Neutral' : 'Information'} />
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="io-muted BodySmallRegular">
              Restoring copies this version into your draft. You can undo it, and it goes live only when you publish.
            </p>
          </div>
        </DrawerBody>
        {diffs.length > 0 && (
          <DrawerFooter>
            <Button label={`Restore version ${open.number}`} onClick={() => onRestore(open)} />
          </DrawerFooter>
        )}
      </Drawer>
    );
  }

  return (
    <Drawer isOpen={isOpen} onDismiss={onDismiss} showOverlay={false} isModal={false}>
      <DrawerHeader title="Versions" subtitle={versions.length ? `${versions.length} published, newest first` : undefined} />
      <DrawerBody>
        {versions.length === 0 ? (
          <p className="io-muted BodyMediumRegular">Nothing published yet. Each time you publish, a version is kept here.</p>
        ) : (
          <ActionList accessibilityLabel="Versions">
            {versions.map((v) => (
              <ActionListItem
                key={v.id}
                value={v.id}
                title={`Version ${v.number}`}
                titleSuffix={v.id === live ? <ActionListItemBadge label="Live" color="Positive" /> : undefined}
                description={[who(v.publishedBy), formatStamp(v.publishedAt), v.changes ?? 'First version'].join(' · ')}
                onClick={() => setOpenId(v.id)}
              />
            ))}
          </ActionList>
        )}
      </DrawerBody>
    </Drawer>
  );
}
