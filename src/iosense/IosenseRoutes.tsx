import { Navigate, Route, Routes } from 'react-router-dom';
import '@xyflow/react/dist/base.css';
import './iosense.css';
import { WorkflowListPage } from './pages/WorkflowListPage';
import { WorkflowLayout } from './pages/WorkflowLayout';
import { RunHistoryPage } from './pages/RunHistoryPage';

/** The iosense Workflow Automation module, mounted at /iosense/*. */
export function IosenseRoutes() {
  return (
    <Routes>
      <Route path="workflows" element={<WorkflowListPage />} />
      <Route path="workflows/:id/*" element={<WorkflowLayout />} />
      <Route path="runs" element={<RunHistoryPage />} />
      {/* Absolute: inside a catch-all, a relative path resolves against the unknown URL itself and redirects forever. */}
      <Route path="*" element={<Navigate to="/iosense/workflows" replace />} />
    </Routes>
  );
}
