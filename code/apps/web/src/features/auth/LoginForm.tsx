import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from './AuthProvider.js';
import { Card } from '../../components/ui/Card.js';
import { Button } from '../../components/ui/Button.js';
import { Alert } from '../../components/ui/Alert.js';

export const LoginForm: React.FC = () => {
  const { signIn } = useAuth();
  const [searchParams] = useSearchParams();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const errorParam = searchParams.get('error');

  const getOAuthErrorMessage = (): string | null => {
    if (errorMessage) return errorMessage;
    if (!errorParam) return null;

    switch (errorParam) {
      case 'access_denied':
      case 'oauth_denied':
        return 'Đăng nhập Discord bị hủy hoặc thất bại. Vui lòng thử lại để tham gia FG.';
      case 'state_mismatch':
        return 'Xác thực state không hợp lệ. Vui lòng thực hiện đăng nhập lại.';
      case 'invalid_request':
        return 'Yêu cầu đăng nhập không hợp lệ.';
      default:
        return 'Đăng nhập Discord bị hủy hoặc thất bại. Vui lòng thử lại để tham gia FG.';
    }
  };

  const activeError = getOAuthErrorMessage();

  const handleDiscordLogin = async () => {
    setIsRedirecting(true);
    setErrorMessage(null);
    try {
      await signIn();
    } catch (err) {
      setIsRedirecting(false);
      setErrorMessage(err instanceof Error ? err.message : 'Đăng nhập không thành công');
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '80vh',
        padding: '24px 16px',
      }}
    >
      <Card style={{ maxWidth: '440px', width: '100%' }} padding={32}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', textAlign: 'center' }}>
          <div>
            <h1
              style={{
                fontSize: '28px',
                fontWeight: 800,
                color: 'var(--color-focus)',
                letterSpacing: '-0.02em',
                marginBottom: '8px',
              }}
            >
              FG
            </h1>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)' }}>
              Cộng đồng game thủ Việt Nam
            </h2>
            <p style={{ color: 'var(--text-sub)', fontSize: '14px', marginTop: '4px' }}>
              Đăng nhập bằng Discord để tham gia phòng và kết nối cùng đội chơi
            </p>
          </div>

          {activeError && (
            <Alert
              testId="oauth-error-banner"
              type="error"
              title="Đăng nhập không thành công"
              message={activeError}
              action={
                <Button variant="outline" size="sm" onClick={handleDiscordLogin} isLoading={isRedirecting}>
                  Thử lại
                </Button>
              }
            />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Button
              variant="primary"
              size="lg"
              onClick={handleDiscordLogin}
              isLoading={isRedirecting}
              leftIcon={<DiscordIcon />}
              style={{ width: '100%' }}
            >
              Đăng nhập bằng Discord
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

const DiscordIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);
