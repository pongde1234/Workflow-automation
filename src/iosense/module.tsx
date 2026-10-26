import { lazy } from 'react';
import { NAV_ICON_SIZE } from '@faclon-labs/fds';
import { History, Waypoints, Workflow } from 'lucide-react';
import type { AppModule } from '@/lib/appModule';
import { useIoWorkflows } from './store/workflowStore';

const IosenseRoutes = lazy(() => import('./IosenseRoutes').then((m) => ({ default: m.IosenseRoutes })));

/** /iosense/workflows/:id/… is a workflow (its canvas, or the canvas with History open), not the listing. */
const workflowId = (pathname: string) => {
  const [, root, section, id] = pathname.split('/');
  return root === 'iosense' && section === 'workflows' ? id : undefined;
};

/** The nav id for a path: /iosense/runs, or anything under /iosense/workflows. */
const PAGE_FOR_SECTION: Record<string, string> = { runs: 'io-runs', workflows: 'io-workflows' };

export const iosenseModule: AppModule = {
  id: 'iosense',
  segment: 'iosense',
  // One group, Workflow automation, with its two pages. A group (not flat items) also puts the list page
  // in a workflow's trail as a link back ("Workflow automation / Workflows / Critical breakdown alerts").
  nav: [{
    id: 'automation', label: 'Workflow automation', icon: <Waypoints size={NAV_ICON_SIZE} />, children: [
      { id: 'io-workflows', label: 'Workflows', icon: <Workflow size={NAV_ICON_SIZE} /> },
      { id: 'io-runs', label: 'Run history', icon: <History size={NAV_ICON_SIZE} /> },
    ],
  }],
  pages: {
    'io-workflows': { title: 'Workflows', path: '/iosense/workflows' },
    'io-runs': { title: 'Run history', path: '/iosense/runs' },
  },
  landing: { automation: 'io-workflows' },
  activeId: (pathname) => PAGE_FOR_SECTION[pathname.split('/')[2] ?? ''] ?? 'io-workflows',
  useRecord: (pathname) => {
    const id = workflowId(pathname);
    const name = useIoWorkflows((s) => (id ? s.workflows.find((w) => w.id === id)?.name : undefined));
    return name ? { title: name, parent: 'io-workflows' } : null;
  },
  // A workflow is a full-height canvas with its controls floating on it (FDS S2: canvas page).
  layout: (pathname) => (workflowId(pathname) ? { pageHeight: 'fill', pagePadding: 'none' } : undefined),
  routes: [{ path: '/iosense/*', element: <IosenseRoutes /> }],
};
