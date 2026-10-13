import {InitialLoading} from '../../components/ui/InitialLoading.js';
import React, { useCallback } from 'react';
import {Link,useInRouterContext} from 'react-router-dom';
import { useAuth } from './AuthProvider.js';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';

export interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, isLoading, isError, error, refetchUser } = useAuth();
  const inRouter=useInRouterContext();

  const handleRetry = useCallback(() => {
    refetchUser().catch((err) => {
      console.error('Refetch user error:', err);
    });
  }, [refetchUser]);

  if (isLoading) return <InitialLoading pending layout="bootstrap" label="Đang kiểm tra phiên làm việc" testId="auth-loading-spinner"/>;

  if (isError || !user) {
    const isForbidden = error?.message?.includes('403');
    const isNetworkError = error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError');

    return (
      <div
        role="alert"
        data-testid="auth-error-state"
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
          padding: '24px',
        }}
      >
        <Card style={{ maxWidth: '440px', width: '100%' }}>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)' }}>
              {isForbidden ? 'Không có quyền truy cập' : 'Yêu cầu xác thực tài khoản'}
            </h3>
            <p style={{ color: 'var(--text-sub)', fontSize: '14px', lineHeight: 1.5 }}>
              {isForbidden
                ? 'Tài khoản của bạn chưa được cấp quyền vào vùng này hoặc phiên đã bị từ chối.'
                : isNetworkError
                ? 'Không thể kết nối đến máy chủ xác thực. Vui lòng kiểm tra kết nối và thử lại.'
                : 'Nội dung này dành riêng cho thành viên FG. Vui lòng đăng nhập để tiếp tục.'}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <Button variant="outline" onClick={handleRetry}>
                Thử lại
              </Button>
              {inRouter?<Link to="/login" className="fg-btn fg-btn-primary">Đăng nhập</Link>:<a href="/login" className="fg-btn fg-btn-primary">Đăng nhập</a>}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};
