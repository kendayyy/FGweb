import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { LoginForm, HeaderAuthWidget, ProtectedRoute, useAuth } from './features/auth/index.js';
import { OnboardingPage } from './features/onboarding/index.js';
import { ProfilePage } from './features/profiles/index.js';
import { LobbyPage } from './features/lobby/LobbyPage.js';
import { RoomsPage } from './features/rooms/index.js';

export const App: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Navigation Header */}
      <header
        className="fg-app-header"
        style={{
          minHeight: '64px',
          backgroundColor: 'var(--bg-sidebar)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <Link
            to="/"
            style={{
              fontSize: '22px',
              fontWeight: 800,
              color: 'var(--color-focus)',
              textDecoration: 'none',
              letterSpacing: '-0.02em',
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 44,
              minWidth: 44,
            }}
          >
            FG
          </Link>
          <nav style={{ display: 'flex', gap: '16px' }}>
            <Link
              to="/"
              style={{
                color: 'var(--text-main)',
                fontSize: '14px',
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 44,
                minWidth: 44,
              }}
            >
              Lobby
            </Link>
            <Link
              to="/rooms"
              style={{
                color: 'var(--text-sub)',
                fontSize: '14px',
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 44,
                minWidth: 44,
              }}
            >
              Phòng của tôi
            </Link>
          </nav>
        </div>

        <HeaderAuthWidget />
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, backgroundColor: 'var(--bg-canvas)' }}>
        <Routes>
          <Route path="/login" element={<LoginForm />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/users/:id" element={<ProfilePage />} />
          <Route path="/users/:id/profile" element={<ProfilePage />} />
          <Route path="/" element={<GuestLobbyShell />} />
          <Route
            path="/rooms"
            element={
              <ProtectedRoute>
                <RoomsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rooms/:roomId"
            element={
              <ProtectedRoute>
                <RoomsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <RoomsPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </div>
  );
};

const GuestLobbyShell: React.FC = () => {
  const { user } = useAuth();

  // Authenticated incomplete users reach onboarding flow
  if (user && (user.onboardingComplete !== true || !Array.isArray(user.interestedGames) || user.interestedGames.length === 0)) {
    return <OnboardingPage />;
  }

  return <LobbyPage />;
};

export default App;
