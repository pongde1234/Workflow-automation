import { Navigate, Route, Routes } from 'react-router-dom';
import '@xyflow/react/dist/base.css';
import './iosense.css';
import { WorkflowListPage } from './pages/WorkflowListPage';
import { WorkflowLayout } from './pages/WorkflowLayout';

/** The iosense Workflow Automation module, mounted at /iosense/*. */
export function IosenseRoutes() {
  return (
    <Routes>
      <Route path="workflows" element={<WorkflowListPage />} />
      <Route path="workflows/:id/*" element={<WorkflowLayout />} />
      <Route path="*" element={<Navigate to="workflows" replace />} />
    </Routes>
  );
}
