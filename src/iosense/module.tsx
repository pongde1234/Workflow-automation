import { lazy } from 'react';
import { NAV_ICON_SIZE } from '@faclon-labs/fds';
import { CircuitBoard, Waypoints } from 'lucide-react';
import type { AppModule } from '@/lib/appModule';
import { useIoWorkflows } from './store/workflowStore';

const IosenseRoutes = lazy(() => import('./IosenseRoutes').then((m) => ({ default: m.IosenseRoutes })));

/** /iosense/workflows/:id/… is a workflow (its canvas, or the canvas with History open), not the listing. */
const workflowId = (pathname: string) => {
  const [, root, section, id] = pathname.split('/');
  return root === 'iosense' && section === 'workflows' ? id : undefined;
};

export const iosenseModule: AppModule = {
  id: 'iosense',
  segment: 'iosense',
  nav: [{
    // An accordion, not a section: only accordions put the list page in a workflow's trail as a link back
    // ("iosense / Workflow automation / Critical breakdown alerts"), so the page needs no title or back button.
    id: 'iosense', label: 'iosense', icon: <CircuitBoard size={NAV_ICON_SIZE} />, children: [
      { id: 'io-workflows', label: 'Workflow automation', icon: <Waypoints size={NAV_ICON_SIZE} /> },
    ],
  }],
  pages: { 'io-workflows': { title: 'Workflow automation', path: '/iosense/workflows' } },
  landing: { iosense: 'io-workflows' },
  useRecord: (pathname) => {
    const id = workflowId(pathname);
    const name = useIoWorkflows((s) => (id ? s.workflows.find((w) => w.id === id)?.name : undefined));
    return name ? { title: name, parent: 'io-workflows' } : null;
  },
  // A workflow is a full-height canvas with its controls floating on it (FDS S2: canvas page).
  layout: (pathname) => (workflowId(pathname) ? { pageHeight: 'fill', pagePadding: 'none' } : undefined),
  routes: [{ path: '/iosense/*', element: <IosenseRoutes /> }],
};
