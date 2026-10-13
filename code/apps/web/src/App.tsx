import {InitialLoading} from './components/ui/InitialLoading.js';
import React from 'react';
import {FGLogo} from './components/ui/FGLogo.js';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import {AuthHeader} from './features/auth/AuthFields.js';
import {EmailFlowPage} from './features/auth/EmailFlowPage.js';
import {PasswordSettingsPage} from './features/auth/PasswordSettingsPage.js';
import { LoginForm, HeaderAuthWidget, ProtectedRoute, useAuth } from './features/auth/index.js';
import { OnboardingPage } from './features/onboarding/index.js';
import { ProfilePage } from './features/profiles/index.js';
import { LobbyPage } from './features/lobby/LobbyPage.js';
import { RoomsPage } from './features/rooms/index.js';
import {ThemeProvider} from './features/theme/ThemeProvider.js';
import {ThemeSwitcher} from './features/theme/ThemeSwitcher.js';
import {TeamActivityPage} from './features/invitations/TeamActivityPage.js';
import {CryptoDeviceProvider, CryptoDeviceSettings} from './features/crypto/CryptoDeviceProvider.js';

export const App: React.FC = () => <ThemeProvider><CryptoDeviceProvider><AppContent/></CryptoDeviceProvider></ThemeProvider>;
const AppContent: React.FC = () => {
  const {user,isLoading,isError}=useAuth();
  const location=useLocation();
  const authPage=['/login','/register','/auth/verify','/auth/forgot','/auth/reset','/auth/add-password','/auth/password'].includes(location.pathname);
  if(isLoading&&!user&&!isError)return <InitialLoading pending layout="bootstrap" label="Đang kiểm tra phiên làm việc"/>;
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Navigation Header */}
      {authPage?<AuthHeader><ThemeSwitcher/></AuthHeader>:<header
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
            to="/" aria-label="FG"
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
            <FGLogo decorative/>
          </Link>
          <nav style={{ display: 'flex', gap: '16px',flexWrap:'wrap' }}>
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
            {user&&<Link to="/team-activity" style={{color:'var(--text-sub)',fontSize:14,fontWeight:500,display:'inline-flex',alignItems:'center',minHeight:44}}>Lời mời</Link>}
            {user&&<Link to="/crypto" style={{color:'var(--text-sub)',fontSize:14,fontWeight:500,display:'inline-flex',alignItems:'center',minHeight:44}}>Thiết bị mã hóa</Link>}
          </nav>
        </div>

        <div className="fg-app-header-actions"><ThemeSwitcher/><HeaderAuthWidget /></div>
      </header>}

      {/* Main Content Area */}
      <main style={{ flex: 1, backgroundColor: 'var(--bg-canvas)' }}>
        <Routes>
          <Route path="/crypto" element={<ProtectedRoute><CryptoDeviceSettings/></ProtectedRoute>}/>
          <Route path="/login" element={<LoginForm key="login" />} />
          <Route path="/register" element={<LoginForm key="register" />} />
          <Route path="/auth/verify" element={<EmailFlowPage key="verify" />} />
          <Route path="/auth/forgot" element={<EmailFlowPage key="forgot" />} />
          <Route path="/auth/reset" element={<EmailFlowPage key="reset" />} />
          <Route path="/auth/add-password" element={<EmailFlowPage key="attach" />} />
          <Route path="/auth/password" element={<PasswordSettingsPage key={user?.id??'guest'} />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/users/:id" element={<ProfilePage />} />
          <Route path="/users/:id/profile" element={<ProfilePage />} />
          <Route path="/team-activity" element={<ProtectedRoute><TeamActivityRoute/></ProtectedRoute>}/>
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
function TeamActivityRoute(){const {user}=useAuth();if(!user)return null;if(user.onboardingComplete!==true||!user.interestedGames?.length)return <OnboardingPage/>;return <TeamActivityPage actorId={user.id}/>;}

export default App;
