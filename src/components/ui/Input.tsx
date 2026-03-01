import { type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, id, style, ...props }: InputProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {label && (
        <label
          htmlFor={id}
          style={{
            fontSize: 'var(--font-sm)',
            color: 'var(--text-secondary)',
            fontWeight: 500,
          }}
        >
          {label}
        </label>
      )}
      <input
        id={id}
        className="glass-input"
        style={style}
        {...props}
      />
    </div>
  );
}
