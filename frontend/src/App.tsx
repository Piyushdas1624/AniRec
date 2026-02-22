import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import GuestBanner from './components/GuestBanner';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import HomePage from './pages/HomePage';
import MyListPage from './pages/MyListPage';
import RecommendationsPage from './pages/RecommendationsPage';
import SettingsPage from './pages/SettingsPage';
import StatsPage from './pages/StatsPage';
import SeasonalPage from './pages/SeasonalPage';
import RandomPickerPage from './pages/RandomPickerPage';
import AchievementsPage from './pages/AchievementsPage';
import TasteProfilePage from './pages/TasteProfilePage';
import { useEffect } from 'react';
import api from './utils/api';
import toast from 'react-hot-toast';

/**
 * Captures ?invite=TOKEN from URL and stores it in localStorage.
 * After the user logs in / signs up, InviteJoiner will auto-join the session.
 */
function InviteCapture() {
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const invite = searchParams.get('invite');
    if (invite) {
      localStorage.setItem('anirec_invite_token', invite);
    }
  }, [searchParams]);
  return null;
}

/**
 * After login, checks for a pending invite token and auto-joins the session.
 */
function InviteJoiner() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const invite = localStorage.getItem('anirec_invite_token');
    if (!invite) return;

    // Attempt to join the session
    api.joinSession(invite).then(result => {
      if (result.joined) {
        toast.success(`🔗 Joined ${result.adminName}'s AI session!`);
        // Force reload so GuestBanner picks up the new status
        window.location.href = '/';
      }
    }).catch(err => {
      // If it fails (invalid/expired), silently ignore
      console.warn('Failed to join session:', err.message);
    }).finally(() => {
      localStorage.removeItem('anirec_invite_token');
    });
  }, [user]);
  return null;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-container" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
        <span className="loading-text">Loading...</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppLayout() {
  return (
    <>
      <GuestBanner />
      <Navbar />
      <Routes>
        <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/my-list" element={<ProtectedRoute><MyListPage /></ProtectedRoute>} />
        <Route path="/recommendations" element={<ProtectedRoute><RecommendationsPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="/stats" element={<ProtectedRoute><StatsPage /></ProtectedRoute>} />
        <Route path="/seasonal" element={<ProtectedRoute><SeasonalPage /></ProtectedRoute>} />
        <Route path="/random" element={<ProtectedRoute><RandomPickerPage /></ProtectedRoute>} />
        <Route path="/achievements" element={<ProtectedRoute><AchievementsPage /></ProtectedRoute>} />
        <Route path="/taste" element={<ProtectedRoute><TasteProfilePage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <InviteCapture />
        <InviteJoiner />
        <Routes>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/signup" element={<PublicRoute><SignupPage /></PublicRoute>} />
          <Route path="/*" element={<AppLayout />} />
        </Routes>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#1a1a3e',
              color: '#f0f0ff',
              border: '1px solid rgba(124, 92, 252, 0.2)',
              borderRadius: '12px',
              fontSize: '0.9rem',
            },
            success: { iconTheme: { primary: '#22c55e', secondary: '#1a1a3e' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#1a1a3e' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}
