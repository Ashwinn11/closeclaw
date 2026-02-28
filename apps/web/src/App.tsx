import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { LandingPage } from './pages/LandingPage';
import { Loader2 } from 'lucide-react';
import './App.css';

// Lazy-load non-critical routes to split the monolithic JS bundle
const SolutionPage = lazy(() => import('./pages/SolutionPage').then(m => ({ default: m.SolutionPage })));
const SolutionsIndexPage = lazy(() => import('./pages/SolutionsIndexPage').then(m => ({ default: m.SolutionsIndexPage })));
const VsSelfHostingPage = lazy(() => import('./pages/VsSelfHostingPage').then(m => ({ default: m.VsSelfHostingPage })));
const OpenClawHostingPage = lazy(() => import('./pages/OpenClawHostingPage').then(m => ({ default: m.OpenClawHostingPage })));
const OpenClawDeployGuidePage = lazy(() => import('./pages/OpenClawDeployGuidePage').then(m => ({ default: m.OpenClawDeployGuidePage })));
const OpenClawTelegramDiscordPage = lazy(() => import('./pages/OpenClawTelegramDiscordPage').then(m => ({ default: m.OpenClawTelegramDiscordPage })));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage').then(m => ({ default: m.AuthCallbackPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const BillingPage = lazy(() => import('./pages/BillingPage').then(m => ({ default: m.BillingPage })));

const RouteSpinner = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <Loader2 size={32} className="spin" style={{ color: 'var(--text-secondary)' }} />
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <RouteSpinner />;
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

function App() {
  return (
    <Suspense fallback={<RouteSpinner />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/solutions" element={<SolutionsIndexPage />} />
        <Route path="/solutions/:id" element={<SolutionPage />} />
        <Route path="/vs-self-hosting" element={<VsSelfHostingPage />} />
        <Route path="/openclaw-hosting" element={<OpenClawHostingPage />} />
        <Route path="/openclaw-deploy-guide" element={<OpenClawDeployGuidePage />} />
        <Route path="/openclaw-telegram-discord" element={<OpenClawTelegramDiscordPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing"
          element={
            <ProtectedRoute>
              <BillingPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
