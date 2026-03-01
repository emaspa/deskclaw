import { type CSSProperties, type ReactNode } from 'react';

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  noHover?: boolean;
}

export function GlassPanel({ children, className = '', style, noHover }: GlassPanelProps) {
  return (
    <div
      className={`glass ${noHover ? 'glass-no-hover' : ''} ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}
