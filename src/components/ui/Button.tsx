import { type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--accent-primary)',
    color: '#fff',
    border: 'none',
  },
  secondary: {
    background: 'rgba(255, 255, 255, 0.06)',
    color: 'var(--text-primary)',
    border: '1px solid var(--glass-border)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: 'none',
  },
  danger: {
    background: 'rgba(255, 82, 82, 0.15)',
    color: 'var(--accent-danger)',
    border: '1px solid rgba(255, 82, 82, 0.3)',
  },
};

export function Button({
  variant = 'primary',
  children,
  loading,
  disabled,
  style,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      style={{
        ...variantStyles[variant],
        padding: '10px 20px',
        borderRadius: 'var(--radius-md)',
        fontSize: 'var(--font-base)',
        fontFamily: 'inherit',
        fontWeight: 500,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.5 : 1,
        transition: 'all 0.2s ease',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        ...style,
      }}
      {...props}
    >
      {loading && <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />}
      {children}
    </button>
  );
}
