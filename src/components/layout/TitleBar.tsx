import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-react';
import { ConnectionStatus } from '../connection/ConnectionStatus';

export function TitleBar() {
  const appWindow = getCurrentWindow();

  return (
    <div
      data-tauri-drag-region
      style={{
        gridArea: 'titlebar',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--glass-border)',
        height: '38px',
        userSelect: 'none',
      }}
    >
      <div
        data-tauri-drag-region
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: 'var(--font-sm)',
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          DeskClaw
        </span>
        <ConnectionStatus />
        <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>v0.1.0</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {[
          { icon: Minus, action: () => appWindow.minimize() },
          { icon: Square, action: () => appWindow.toggleMaximize() },
          { icon: X, action: () => appWindow.close(), danger: true },
        ].map(({ icon: Icon, action, danger }, i) => (
          <button
            key={i}
            onClick={action}
            style={{
              background: 'transparent',
              border: 'none',
              color: danger ? 'var(--text-secondary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px 8px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = danger
                ? 'rgba(255, 82, 82, 0.2)'
                : 'rgba(255, 255, 255, 0.06)';
              if (danger) e.currentTarget.style.color = 'var(--accent-danger)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>
    </div>
  );
}
