import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-react';
import { ConnectionForm } from './ConnectionForm';
import { ConnectionStatus } from './ConnectionStatus';
import { AccountSelector } from './AccountSelector';
import { GlassPanel } from '../ui/GlassPanel';
import { useSettingsStore } from '../../store/settingsStore';

export function ConnectionScreen() {
  const appWindow = getCurrentWindow();
  const hasAccounts = useSettingsStore((s) => s.accounts.length > 0);

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Title bar with drag region and window controls */}
      <div
        data-tauri-drag-region
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 12px',
          height: '38px',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', gap: '2px' }}>
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
      </div>

      {/* Connection content */}
      <div
        className="animate-fade-in-up"
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 20px 20px',
        }}
      >
        {hasAccounts ? (
          /* Two-column: accounts left, form right */
          <div
            style={{
              display: 'flex',
              gap: '16px',
              width: '100%',
              maxWidth: '740px',
              alignItems: 'flex-start',
            }}
          >
            <GlassPanel
              noHover
              style={{
                width: '260px',
                flexShrink: 0,
                padding: '16px',
              }}
            >
              <AccountSelector />
            </GlassPanel>

            <GlassPanel
              noHover
              style={{
                flex: 1,
                padding: '36px 32px',
              }}
            >
              <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                <div
                  style={{
                    fontSize: 'var(--font-2xl)',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    marginBottom: '8px',
                  }}
                >
                  DeskClaw
                </div>
                <div
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: 'var(--font-sm)',
                    marginBottom: '16px',
                  }}
                >
                  Connect to your OpenClaw instance via SSH
                </div>
                <ConnectionStatus />
              </div>
              <ConnectionForm />
            </GlassPanel>
          </div>
        ) : (
          /* Single centered form when no accounts */
          <GlassPanel
            noHover
            style={{
              width: '100%',
              maxWidth: '440px',
              padding: '36px 32px',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <div
                style={{
                  fontSize: 'var(--font-2xl)',
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  marginBottom: '8px',
                }}
              >
                DeskClaw
              </div>
              <div
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: 'var(--font-sm)',
                  marginBottom: '16px',
                }}
              >
                Connect to your OpenClaw instance via SSH
              </div>
              <ConnectionStatus />
            </div>
            <ConnectionForm />
          </GlassPanel>
        )}
      </div>
    </div>
  );
}
