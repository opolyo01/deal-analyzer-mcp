import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/ui/Layout';
import { useAuth } from './hooks/useAuth';
import { AnalysisPage } from './pages/AnalysisPage';
import { DashboardPage } from './pages/DashboardPage';
import { HomePage } from './pages/HomePage';
import { QuickCheckPage } from './pages/QuickCheckPage';

export function App() {
  const auth = useAuth();

  return (
    <Layout user={auth.user} isAuthLoading={auth.isLoading}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/index.html" element={<Navigate to="/" replace />} />
        <Route path="/quick-check" element={<QuickCheckPage />} />
        <Route path="/deal-widget.html" element={<QuickCheckPage />} />
        <Route path="/dashboard" element={<DashboardPage user={auth.user} isAuthLoading={auth.isLoading} />} />
        <Route path="/deals.html" element={<Navigate to="/dashboard" replace />} />
        <Route path="/add" element={<AnalysisPage user={auth.user} />} />
        <Route path="/add.html" element={<AnalysisPage user={auth.user} />} />
        <Route path="/agent" element={<Navigate to="/" replace />} />
        <Route path="/agent.html" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
