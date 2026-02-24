import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { SubjectView } from './pages/SubjectView';
import { PracticeSessionPage } from './pages/PracticeSession';
import { ResultsPage } from './pages/Results';
import { SettingsPage } from './pages/Settings';
import { FlashcardPage } from './pages/Flashcard';
import { DeliverablesPage } from './pages/Deliverables';
import { StatsPage } from './pages/Stats';
import { GlobalStatsPage } from './pages/GlobalStats';
import { ReadModePage } from './pages/ReadMode';
import { PdfListenMode } from './pages/PdfListenMode';
import { SessionHistoryPage } from './pages/SessionHistory';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/subject/:subjectId" element={<SubjectView />} />
        <Route path="/subject/:subjectId/stats" element={<StatsPage />} />
        <Route path="/subject/:subjectId/read/:topicId" element={<ReadModePage />} />
        <Route path="/subject/:subjectId/listen/:topicId" element={<PdfListenMode />} />
        <Route path="/subject/:subjectId/listen-resource" element={<PdfListenMode />} />
        <Route path="/practice/:sessionId" element={<PracticeSessionPage />} />
        <Route path="/results/:sessionId" element={<ResultsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/flashcard/:subjectId" element={<FlashcardPage />} />
        <Route path="/deliverables" element={<DeliverablesPage />} />
        <Route path="/sessions" element={<SessionHistoryPage />} />
        <Route path="/stats" element={<GlobalStatsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}