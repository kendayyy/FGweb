import React, { useState, useCallback } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import { useAuth } from './AuthProvider.js';
import { Button } from '../../components/ui/Button.js';

export const HeaderAuthWidget: React.FC = () => {
  const { user, isLoading, isSigningOut, signIn, signOut } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);
  const [failedAction, setFailedAction] = useState<'signIn' | 'signOut' | null>(null);
  const inRouter = useInRouterContext();

  const handleSignIn = useCallback(async () => {
    setAuthError(null);
    setFailedAction(null);
    try {
      await signIn();
    } catch (err) {
      setFailedAction('signIn');
      setAuthError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
    }
  }, [signIn]);

  const handleSignOut = useCallback(async () => {
    setAuthError(null);
    setFailedAction(null);
    try {
      await signOut();
    } catch (err) {
      setFailedAction('signOut');
      setAuthError(err instanceof Error ? err.message : 'Đăng xuất thất bại');
    }
  }, [signOut]);

  const handleRetry = useCallback(() => {
    if (failedAction === 'signOut') {
      handleSignOut();
    } else {
      handleSignIn();
    }
  }, [failedAction, handleSignIn, handleSignOut]);

  if (isLoading) {
    return <div style={{ color: 'var(--text-quiet)', fontSize: '13px' }}>Đang tải...</div>;
  }

  const renderUserLink = () => {
    if (!user) return null;
    const content = (
      <>
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.displayName}
            style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-action)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '14px',
            }}
          >
            {user.displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '14px' }}>{user.displayName}</span>
      </>
    );

    const linkStyle: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      textDecoration: 'none',
      color: 'inherit',
      minHeight:44,
      minWidth:44,
    };

    if (inRouter) {
      return (
        <Link to={`/users/${user.id}`} data-testid="user-avatar-link" style={linkStyle}>
          {content}
        </Link>
      );
    }

    return (
      <a href={`/users/${user.id}`} data-testid="user-avatar-link" style={linkStyle}>
        {content}
      </a>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap',
      }}
    >
      {authError && (
        <div
          role="alert"
          style={{
            backgroundColor: 'rgba(229, 72, 77, 0.15)',
            border: '1px solid var(--color-danger)',
            borderRadius: 'var(--radius-sm)',
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            color: 'var(--text-main)',
          }}
        >
          <span>{authError}</span>
          <Button variant="outline" size="sm" onClick={handleRetry}>
            Thử lại
          </Button>
        </div>
      )}

      {!user ? (
        <div data-testid="guest-login-cta">
          <Button variant="primary" size="md" onClick={handleSignIn}>
            Đăng nhập bằng Discord
          </Button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {renderUserLink()}

          <Button
            data-testid="logout-button"
            variant="ghost"
            size="md"
            onClick={handleSignOut}
            isLoading={isSigningOut}
          >
            Đăng xuất
          </Button>
        </div>
      )}
    </div>
  );
};
