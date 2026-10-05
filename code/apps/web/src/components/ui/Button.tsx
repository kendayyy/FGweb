import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  disabled,
  className = '',
  style,
  ...props
}) => {
  const getVariantClass = () => {
    switch (variant) {
      case 'primary':
        return 'fg-btn-primary';
      case 'secondary':
        return 'fg-btn-secondary';
      case 'outline':
        return 'fg-btn-outline';
      case 'ghost':
        return 'fg-btn-ghost';
      case 'destructive':
        return 'fg-btn-destructive';
      default:
        return 'fg-btn-primary';
    }
  };

  const getSizeStyles = (): React.CSSProperties => {
    switch (size) {
      case 'sm':
        return {
          minHeight: '44px',
          padding: '0 14px',
          fontSize: '13px',
        };
      case 'lg':
        return {
          minHeight: '52px',
          padding: '0 24px',
          fontSize: '16px',
        };
      case 'md':
      default:
        return {
          minHeight: '44px',
          padding: '0 16px',
          fontSize: '14px',
        };
    }
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`fg-btn ${getVariantClass()} ${className}`}
      style={{
        ...getSizeStyles(),
        ...style,
      }}
      {...props}
    >
      {isLoading ? (
        <span
          data-testid="button-spinner"
          style={{
            width: '16px',
            height: '16px',
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            display: 'inline-block',
            animation: 'fg-spin 0.8s linear infinite',
          }}
        />
      ) : (
        leftIcon
      )}
      <span>{children}</span>
    </button>
  );
};
