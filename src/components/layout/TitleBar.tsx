import { getCurrentWindow } from '@tauri-apps/api/window';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Minus, Square, X } from 'lucide-react';
import { ConnectionStatus } from '../connection/ConnectionStatus';
import { useSettingsStore } from '../../store/settingsStore';
import { isMacOS } from '../../lib/platform';

export function TitleBar() {
  const appWindow = getCurrentWindow();
  const closeToTray = useSettingsStore((s) => s.closeToTray);
  const minimizeToTray = useSettingsStore((s) => s.minimizeToTray);

  return (
    <div
      data-tauri-drag-region
      style={{
        gridArea: 'titlebar',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        // On macOS, add left padding for native traffic light buttons
        paddingLeft: '12px',
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
        <span
          onClick={() => openUrl('https://github.com/emaspa/deskclaw')}
          style={{
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
        >v0.1.6</span>
      </div>

      {/* Window controls — only on non-macOS (macOS uses native traffic lights) */}
      {!isMacOS && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {[
            { icon: Minus, action: () => minimizeToTray ? appWindow.hide() : appWindow.minimize() },
            { icon: Square, action: () => appWindow.toggleMaximize() },
            { icon: X, action: () => closeToTray ? appWindow.hide() : appWindow.close(), danger: true },
          ].map(({ icon: Icon, action, danger }, i) => (
            <button
              key={i}
              onClick={action}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
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
      )}
    </div>
  );
}
