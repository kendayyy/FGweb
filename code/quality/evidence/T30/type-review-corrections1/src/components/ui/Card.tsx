import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: string | number;
}

export const Card: React.FC<CardProps> = ({ children, padding = '24px', style, className = '', ...props }) => {
  return (
    <div
      className={className}
      style={{
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        padding: typeof padding === 'number' ? `${padding}px` : padding,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
};
