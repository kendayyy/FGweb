import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { LoginForm, HeaderAuthWidget, ProtectedRoute, useAuth } from './features/auth/index.js';
import { OnboardingPage } from './features/onboarding/index.js';
import { ProfilePage } from './features/profiles/index.js';
import { Card } from './components/ui/Card.js';
import { LobbyPage } from './features/lobby/LobbyPage.js';

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
              display:'inline-flex',alignItems:'center',minHeight:44,minWidth:44,
            }}
          >
            FG
          </Link>
          <nav style={{ display: 'flex', gap: '16px' }}>
            <Link to="/" style={{ color: 'var(--text-main)', fontSize: '14px', fontWeight: 500,display:'inline-flex',alignItems:'center',minHeight:44,minWidth:44 }}>
              Lobby
            </Link>
            <Link to="/protected" style={{ color: 'var(--text-sub)', fontSize: '14px', fontWeight: 500,display:'inline-flex',alignItems:'center',minHeight:44,minWidth:44 }}>
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
            path="/protected"
            element={
              <ProtectedRoute>
                <ProtectedMemberShell />
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
  if (user && (user.onboardingComplete !== true || !Array.isArray(user.interestedGames) || user.interestedGames.length===0)) {
    return <OnboardingPage />;
  }

  return <LobbyPage />;
};

const ProtectedMemberShell: React.FC = () => {
  const { user } = useAuth();

  return (
    <div style={{ padding: '32px 24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Card padding={32}>
        <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '12px', color: 'var(--color-focus)' }}>
          Phòng của tôi — FG
        </h2>
        <p style={{ color: 'var(--text-main)', fontSize: '14px', marginBottom: '16px' }}>
          Khu vực dành riêng cho thành viên đã xác thực. Chào mừng {user?.displayName}.
        </p>
      </Card>
    </div>
  );
};

export default App;
