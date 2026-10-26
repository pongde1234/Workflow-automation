import { Suspense, useSyncExternalStore } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppShell, DrawerStackProvider, Spinner, ThemeProvider, ToastContainer, buildTrail, resolveSection } from '@faclon-labs/fds';
import { iosenseModule as mod } from '@/iosense/module';

/** The module describes its own nav, pages, breadcrumb and layout (src/lib/appModule.ts); the shell only reads them. */
const NAV = mod.nav ?? [];
const PAGE_TITLES: Record<string, string> = Object.fromEntries(Object.entries(mod.pages).map(([id, p]) => [id, p.title]));
const PATHS: Record<string, string> = Object.fromEntries(Object.entries(mod.pages).map(([id, p]) => [id, p.path]));
const HOME = Object.values(mod.pages)[0].path;

/** Below AppShell's mobile breakpoint (768px), where the rail becomes a drawer. */
const PHONE = '(max-width: 767px)';
const subscribePhone = (cb: () => void) => {
  const mq = window.matchMedia(PHONE);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const usePhone = () => useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE).matches, () => false);

function Shell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isPhone = usePhone();
  const record = mod.useRecord?.(pathname) ?? null;
  const activeId = mod.activeId?.(pathname) ?? Object.keys(mod.pages)[0];
  const layout = mod.layout?.(pathname);

  // A workflow's trail is "Workflow automation / its name", the first crumb a link back to the list. Built by hand:
  // with a flat rail, buildTrail drops the parent of a record page.
  let trail = record
    ? [{ label: PAGE_TITLES[record.parent] ?? '', id: record.parent }, { label: record.title }]
    : buildTrail(activeId, PAGE_TITLES[activeId] ?? '', { items: NAV, pageTitles: PAGE_TITLES });
  // Phones: the top bar has room for one crumb.
  if (isPhone && trail.length > 1) trail = trail.slice(-1);

  return (
    <AppShell
      navItems={NAV}
      activeId={activeId}
      routing="none"
      onNavigate={(id) => navigate(PATHS[resolveSection(id, mod.landing ?? {})] ?? HOME)}
      trail={trail}
      workspace="iosense"
      pageHeight={layout?.pageHeight ?? 'auto'}
      pagePadding={layout?.pagePadding ?? 'default'}
    >
      <Suspense fallback={<div className="app-loading"><Spinner size="Large" accessibilityLabel="Loading" delay={200} /></div>}>
        <Routes>
          <Route path="/" element={<Navigate to={HOME} replace />} />
          {mod.routes.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
          <Route path="*" element={<Navigate to={HOME} replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

export function App() {
  return (
    <ThemeProvider defaultPreference="light">
      <DrawerStackProvider>
        <BrowserRouter>
          <Shell />
        </BrowserRouter>
      </DrawerStackProvider>
      <ToastContainer />
    </ThemeProvider>
  );
}
