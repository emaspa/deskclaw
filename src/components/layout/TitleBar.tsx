import { getCurrentWindow } from '@tauri-apps/api/window';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Minus, Square, X } from 'lucide-react';
import { ConnectionStatus } from '../connection/ConnectionStatus';
import { useSettingsStore } from '../../store/settingsStore';
import { useUpdateCheck } from '../../hooks/useUpdateCheck';
import { isMacOS } from '../../lib/platform';

export function TitleBar() {
  const appWindow = getCurrentWindow();
  const closeToTray = useSettingsStore((s) => s.closeToTray);
  const minimizeToTray = useSettingsStore((s) => s.minimizeToTray);
  const { update, recheck } = useUpdateCheck();

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
          onClick={async () => {
            if (update) {
              openUrl(update.release_url);
            } else {
              const found = await recheck();
              openUrl(found ? found.release_url : 'https://github.com/emaspa/deskclaw/releases/latest');
            }
          }}
          style={{
            fontSize: 'var(--font-xs)',
            color: update ? 'var(--accent-success)' : 'var(--text-muted)',
            cursor: 'pointer',
            transition: 'color 0.15s',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = update ? 'var(--accent-success)' : 'var(--text-muted)'; }}
          title={update ? `${update.latest_version} available — click to download` : 'View on GitHub'}
        >
          v0.2.3
          {update && (
            <span style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--accent-success)',
              boxShadow: '0 0 6px var(--accent-success)',
            }} />
          )}
        </span>
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
