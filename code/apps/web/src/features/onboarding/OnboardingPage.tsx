import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/index.js';
import { OnboardingForm } from './OnboardingForm.js';
import { Spinner } from '../../components/ui/Spinner.js';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';

export const OnboardingPage: React.FC = () => {
  const { user, isLoading, isError, error, refetchUser } = useAuth();
  const navigate = useNavigate();

  const handleRetry = useCallback(() => {
    refetchUser().catch((err) => {
      console.error('Refetch user error:', err);
    });
  }, [refetchUser]);

  const handleSuccess = useCallback(() => {
    navigate('/');
  }, [navigate]);

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: '16px',
        }}
      >
        <Spinner size={40} testId="onboarding-loading-spinner" />
        <span style={{ color: 'var(--text-sub)', fontSize: '14px' }}>
          Đang kiểm tra trạng thái tài khoản...
        </span>
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ padding: '40px 20px', display: 'flex', justifyContent: 'center' }}>
        <Card data-testid="onboarding-error-state" padding={28} style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px' }}>
            Không thể tải thông tin hồ sơ
          </h3>
          <p style={{ color: 'var(--text-sub)', fontSize: '14px', marginBottom: '20px' }}>
            {error?.message || 'Có lỗi xảy ra khi kết nối máy chủ. Vui lòng kiểm tra và thử lại.'}
          </p>
          <Button variant="primary" onClick={handleRetry}>
            Thử lại
          </Button>
        </Card>
      </div>
    );
  }

  // Guests are allowed to visit Lobby, not forced to complete onboarding
  if (!user) {
    return (
      <div style={{ padding: '40px 20px', display: 'flex', justifyContent: 'center' }}>
        <Card padding={28} style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px' }}>
            Yêu cầu đăng nhập
          </h3>
          <p style={{ color: 'var(--text-sub)', fontSize: '14px', marginBottom: '20px' }}>
            Vui lòng đăng nhập bằng Discord để bắt đầu quá trình khai báo thông tin ban đầu.
          </p>
          <Button variant="primary" onClick={() => navigate('/')}>
            Quay lại Lobby
          </Button>
        </Card>
      </div>
    );
  }

  // Missing or unknown onboardingComplete field or missing stored interests is an integration error state
  const hasValidInterests = Array.isArray(user.interestedGames) && user.interestedGames.length > 0;

  if (
    user.onboardingComplete === undefined ||
    user.onboardingComplete === null ||
    (user.onboardingComplete === true && !hasValidInterests)
  ) {
    return (
      <div style={{ padding: '40px 20px', display: 'flex', justifyContent: 'center' }}>
        <Card data-testid="onboarding-error-state" padding={28} style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px' }}>
            Không thể xác minh thông tin tài khoản
          </h3>
          <p style={{ color: 'var(--text-sub)', fontSize: '14px', marginBottom: '20px' }}>
            Dữ liệu nhận dạng tài khoản chưa đầy đủ hoặc không có thông tin game quan tâm.
          </p>
          <Button variant="primary" onClick={handleRetry}>
            Thử lại
          </Button>
        </Card>
      </div>
    );
  }

  // Known-complete users should not see onboarding form again
  if (user.onboardingComplete === true && hasValidInterests) {
    return (
      <div style={{ padding: '40px 20px', display: 'flex', justifyContent: 'center' }}>
        <Card padding={28} style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-online)', marginBottom: '12px' }}>
            Hồ sơ đã hoàn tất
          </h3>
          <p style={{ color: 'var(--text-sub)', fontSize: '14px', marginBottom: '20px' }}>
            Bạn đã hoàn thành khai báo thông tin ban đầu.
          </p>
          <Button variant="primary" onClick={() => navigate('/')}>
            Đến Lobby
          </Button>
        </Card>
      </div>
    );
  }

  // Authenticated incomplete users (onboardingComplete === false)
  return (
    <div style={{ padding: '40px 20px' }}>
      <OnboardingForm key={user.id} onSuccess={handleSuccess} />
    </div>
  );
};
