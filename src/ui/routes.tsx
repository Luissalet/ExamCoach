import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { SubjectView } from './pages/SubjectView';
import { PracticeSessionPage } from './pages/PracticeSession';
import { ResultsPage } from './pages/Results';
import { SettingsPage } from './pages/Settings';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/subject/:subjectId" element={<SubjectView />} />
        <Route path="/practice/:sessionId" element={<PracticeSessionPage />} />
        <Route path="/results/:sessionId" element={<ResultsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
