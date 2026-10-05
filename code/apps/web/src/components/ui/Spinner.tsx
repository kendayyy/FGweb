import React from 'react';

export interface SpinnerProps {
  size?: number;
  color?: string;
  testId?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 32,
  color = 'var(--color-focus)',
  testId = 'auth-loading-spinner',
}) => {
  return (
    <div
      data-testid={testId}
      style={{
        display: 'inline-block',
        width: `${size}px`,
        height: `${size}px`,
        border: `3px solid ${color}`,
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'fg-spin 0.8s linear infinite',
      }}
    >
      <style>{`
        @keyframes fg-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
