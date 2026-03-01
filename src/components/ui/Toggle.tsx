interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}

export function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '6px 0',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-primary)', fontWeight: 500 }}>
          {label}
        </div>
        {description && (
          <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
            {description}
          </div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          border: 'none',
          cursor: 'pointer',
          background: checked ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.1)',
          position: 'relative',
          transition: 'background 0.2s ease',
          flexShrink: 0,
          padding: 0,
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            position: 'absolute',
            top: 2,
            left: checked ? 18 : 2,
            transition: 'left 0.2s ease',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
          }}
        />
      </button>
    </div>
  );
}
