import { Suspense, useState, useSyncExternalStore } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppShell, DrawerStackProvider, IconButton, Spinner, ThemeProvider, ToastContainer, Tooltip, buildTrail, resolveSection, toastStore } from '@faclon-labs/fds';
import { Radio } from 'lucide-react';
import { iosenseModule as mod } from '@/iosense/module';
import { NotificationsDrawer, useNotifications } from '@/iosense/pages/NotificationsDrawer';
import { useIoSession } from '@/iosense/store/sessionStore';
import { CURRENT_USER_ID, SEED_USERS } from '@/iosense/seed/seed';
import { AssistantPanel } from '@/iosense/ai/AssistantPanel';
import { useLiveMode } from '@/iosense/live/useLiveMode';

/** The module describes its own nav, pages, breadcrumb and layout (src/lib/appModule.ts); the shell only reads them. */
const NAV = mod.nav ?? [];
const PAGE_TITLES: Record<string, string> = Object.fromEntries(Object.entries(mod.pages).map(([id, p]) => [id, p.title]));
const PATHS: Record<string, string> = Object.fromEntries(Object.entries(mod.pages).map(([id, p]) => [id, p.path]));
const HOME = Object.values(mod.pages)[0].path;

/** The demo's signed-in person: the plant manager from the sample directory. */
const ME = SEED_USERS.find((u) => u.id === CURRENT_USER_ID)!;
const PROFILE = { name: ME.name, email: ME.email, org: 'Pune plant' };

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
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { unread } = useNotifications();
  const markSeen = useIoSession((s) => s.markNotificationsSeen);
  const assistantOpen = useIoSession((s) => s.assistantOpen);
  const setAssistantOpen = useIoSession((s) => s.setAssistantOpen);
  const live = useIoSession((s) => s.live);
  const setLive = useIoSession((s) => s.setLive);
  const [explainedLive, setExplainedLive] = useState(false);
  useLiveMode();
  const toggleLive = () => {
    setLive(!live);
    // Said once: runs start arriving a few seconds later, so the effect isn't visible straight away (S3).
    if (!live && !explainedLive) {
      setExplainedLive(true);
      toastStore.show({ color: 'Neutral', content: 'Live mode is on: active workflows fire sample events every few seconds. Watch Run history, the bell or an open canvas.' });
    }
  };

  // A workflow's trail is "Workflow automation / Workflows / its name": the list page's id is the record's parent.
  let trail = record
    ? buildTrail(record.parent, record.title, { items: NAV, pageTitles: PAGE_TITLES, recordParent: { [record.parent]: record.parent } })
    : buildTrail(activeId, PAGE_TITLES[activeId] ?? '', { items: NAV, pageTitles: PAGE_TITLES });
  // Phones: the top bar has room for one crumb.
  if (isPhone && trail.length > 1) trail = trail.slice(-1);

  return (
    <>
      <AppShell
        navItems={NAV}
        activeId={activeId}
        routing="none"
        onNavigate={(id) => navigate(PATHS[resolveSection(id, mod.landing ?? {})] ?? HOME)}
        trail={trail}
        workspace="iosense"
        profile={PROFILE}
        unreadCount={unread}
        onOpenNotifications={() => setNotificationsOpen(true)}
        // The shell draws the Bruce button (R9); the assistant docks beside the page in the content sheet (R27).
        onOpenAssistant={() => setAssistantOpen(!assistantOpen)}
        isAssistantOpen={assistantOpen}
        panel={<AssistantPanel />}
        // A bare icon control in the top bar (R9): live mode on or off, highlighted while on.
        actions={(
          <Tooltip content={live ? 'Stop live mode' : 'Start live mode: active workflows fire sample events'}>
            <IconButton icon={Radio} accessibilityLabel={live ? 'Live mode, on' : 'Live mode, off'} isHighlighted={live} onClick={toggleLive} />
          </Tooltip>
        )}
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
      {/* Closing the panel marks what it showed as read. */}
      <NotificationsDrawer isOpen={notificationsOpen} onDismiss={() => { setNotificationsOpen(false); markSeen(); }} />
    </>
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
