import { type ReactNode } from 'react';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  pulse?: boolean;
}

const colors: Record<BadgeVariant, { bg: string; text: string; dot: string }> = {
  success: { bg: 'rgba(0, 200, 83, 0.12)', text: 'var(--accent-success)', dot: 'var(--accent-success)' },
  warning: { bg: 'rgba(255, 171, 0, 0.12)', text: 'var(--accent-warning)', dot: 'var(--accent-warning)' },
  danger: { bg: 'rgba(255, 82, 82, 0.12)', text: 'var(--accent-danger)', dot: 'var(--accent-danger)' },
  info: { bg: 'rgba(108, 92, 231, 0.12)', text: 'var(--accent-primary)', dot: 'var(--accent-primary)' },
  muted: { bg: 'rgba(255, 255, 255, 0.06)', text: 'var(--text-muted)', dot: 'var(--text-muted)' },
};

export function Badge({ variant = 'muted', children, pulse }: BadgeProps) {
  const c = colors[variant];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '999px',
        background: c.bg,
        color: c.text,
        fontSize: 'var(--font-xs)',
        fontWeight: 500,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: c.dot,
          ...(pulse ? { animation: 'pulseGlow 2s ease-in-out infinite', color: c.dot } : {}),
        }}
      />
      {children}
    </span>
  );
}
