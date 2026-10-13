import React, { useState, useCallback } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import { useAuth } from './AuthProvider.js';
import { Button } from '../../components/ui/Button.js';

export const HeaderAuthWidget: React.FC = () => {
  const { user, isLoading, isSigningOut, signOut } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);
  const inRouter = useInRouterContext();

  const handleSignOut = useCallback(async () => {
    setAuthError(null);
    try {
      await signOut();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Đăng xuất thất bại');
    }
  }, [signOut]);

  const handleRetry = useCallback(() => {void handleSignOut();}, [handleSignOut]);

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
              color: 'var(--btn-primary-text)',
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
            backgroundColor: 'var(--bg-error-inline)',
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
          {inRouter?<Link className="fg-btn fg-btn-primary" to="/login">Đăng nhập</Link>:<a className="fg-btn fg-btn-primary" href="/login">Đăng nhập</a>}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {renderUserLink()}
          {inRouter?<Link className="fg-btn fg-btn-ghost" to="/auth/password">Mật khẩu</Link>:<a className="fg-btn fg-btn-ghost" href="/auth/password">Mật khẩu</a>}

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
