import { lazy } from 'react';
import { NAV_ICON_SIZE } from '@faclon-labs/fds';
import { Waypoints } from 'lucide-react';
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
  // The app is workflow automation alone, so the rail has one item. A workflow's trail
  // ("Workflow automation / Critical breakdown alerts", the first crumb a link back) is built in App.tsx.
  nav: [{ id: 'io-workflows', label: 'Workflow automation', icon: <Waypoints size={NAV_ICON_SIZE} /> }],
  pages: { 'io-workflows': { title: 'Workflow automation', path: '/iosense/workflows' } },
  useRecord: (pathname) => {
    const id = workflowId(pathname);
    const name = useIoWorkflows((s) => (id ? s.workflows.find((w) => w.id === id)?.name : undefined));
    return name ? { title: name, parent: 'io-workflows' } : null;
  },
  // A workflow is a full-height canvas with its controls floating on it (FDS S2: canvas page).
  layout: (pathname) => (workflowId(pathname) ? { pageHeight: 'fill', pagePadding: 'none' } : undefined),
  routes: [{ path: '/iosense/*', element: <IosenseRoutes /> }],
};
