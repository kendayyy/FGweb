import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { LoginForm, HeaderAuthWidget, ProtectedRoute, useAuth } from './features/auth/index.js';
import { OnboardingPage } from './features/onboarding/index.js';
import { ProfilePage } from './features/profiles/index.js';
import { Card } from './components/ui/Card.js';

export const App: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Navigation Header */}
      <header
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

  return (
    <div style={{ padding: '32px 24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Card padding={32}>
        <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-main)' }}>
          Lobby · Liên Minh Huyền Thoại — FG
        </h2>
        <p style={{ color: 'var(--text-sub)', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
          Chào mừng bạn đến với cộng đồng game thủ FG. Giao diện Lobby công khai cho phép người xem theo dõi
          trạng thái phòng và tìm đội chơi.
        </p>

        {!user ? (
          <div
            style={{
              backgroundColor: 'var(--bg-raised)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              padding: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                Đăng nhập để tham gia chat & gọi thoại
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-quiet)' }}>
                Đăng nhập bằng tài khoản Discord của bạn chỉ với 1-click.
              </p>
            </div>
            <HeaderAuthWidget />
          </div>
        ) : (
          <div style={{ color: 'var(--color-online)', fontWeight: 600 }}>
            ✓ Đã xác thực phiên làm việc: {user.displayName}
          </div>
        )}
      </Card>
    </div>
  );
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
