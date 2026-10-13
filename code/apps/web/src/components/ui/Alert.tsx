import React from 'react';

export interface AlertProps {
  type?: 'error' | 'warning' | 'info' | 'success';
  title?: string;
  message: string;
  action?: React.ReactNode;
  testId?: string;
}

export const Alert: React.FC<AlertProps> = ({
  type = 'error',
  title,
  message,
  action,
  testId,
}) => {
  const getStyles = () => {
    switch (type) {
      case 'error':
        return {
          bg: 'var(--bg-alert-error)',
          border: 'var(--border-alert-error)',
          color: 'var(--text-main)',
        };
      case 'warning':
        return {
          bg: 'var(--bg-alert-warning)',
          border: 'var(--border-alert-warning)',
          color: 'var(--text-main)',
        };
      case 'success':
        return {
          bg: 'var(--bg-alert-success)',
          border: 'var(--border-alert-success)',
          color: 'var(--text-main)',
        };
      case 'info':
      default:
        return {
          bg: 'var(--bg-alert-info)',
          border: 'var(--border-alert-info)',
          color: 'var(--text-main)',
        };
    }
  };

  const style = getStyles();

  return (
    <div
      data-testid={testId}
      style={{
        backgroundColor: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 'var(--radius-sm)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {title && <h4 style={{ fontWeight: 600, fontSize: '14px', margin: 0 }}>{title}</h4>}
      <p style={{ color: 'var(--text-sub)', fontSize: '13px', margin: 0 }}>{message}</p>
      {action && <div style={{ marginTop: '8px' }}>{action}</div>}
    </div>
  );
};
