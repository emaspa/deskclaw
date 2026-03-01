import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Minus, Square, X, Github, Settings } from 'lucide-react';
import { ConnectionForm } from './ConnectionForm';
import { ConnectionStatus } from './ConnectionStatus';
import { AccountSelector } from './AccountSelector';
import { GlassPanel } from '../ui/GlassPanel';
import { SettingsDialog } from '../settings/SettingsDialog';
import { useSettingsStore } from '../../store/settingsStore';
import { setCloseToTray } from '../../lib/tauri';
import { isMacOS } from '../../lib/platform';

export function ConnectionScreen() {
  const appWindow = getCurrentWindow();
  const hasAccounts = useSettingsStore((s) => s.accounts.length > 0);
  const closeToTray = useSettingsStore((s) => s.closeToTray);
  const minimizeToTray = useSettingsStore((s) => s.minimizeToTray);
  const [showSettings, setShowSettings] = useState(false);

  // Sync close-to-tray setting to Rust backend on mount and when it changes
  useEffect(() => {
    setCloseToTray(closeToTray).catch(() => {});
  }, [closeToTray]);

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
          paddingLeft: isMacOS ? '78px' : '12px',
          height: '38px',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', gap: '2px' }}>
          {/* Settings gear icon */}
          <button
            onClick={() => setShowSettings(true)}
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
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <Settings size={14} />
          </button>

          {/* Window controls — only on non-macOS */}
          {!isMacOS && (
            <>
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
            </>
          )}
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
                  A secure chat client for OpenClaw
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
                A secure chat client for OpenClaw
              </div>
              <ConnectionStatus />
            </div>
            <ConnectionForm />
          </GlassPanel>
        )}
      </div>
      {/* Footer links */}
      <div
        style={{
          position: 'fixed',
          bottom: '10px',
          left: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <button
          onClick={() => openUrl('https://github.com/emaspa/deskclaw')}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: 'var(--font-md)',
            fontFamily: 'inherit',
            padding: '4px 6px',
            borderRadius: 'var(--radius-sm)',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <Github size={28} />
          GitHub
        </button>
        <button
          onClick={() => openUrl('https://buymeacoffee.com/emaspa')}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: 'var(--font-md)',
            fontFamily: 'inherit',
            padding: '4px 6px',
            borderRadius: 'var(--radius-sm)',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#ffdd00'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <svg width="32" height="32" viewBox="0 0 884 1279" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="m791 298c-1-9-8-15-17-15h-671c-8 0-15 5-17 13l-86 429c-1 5 0 10 4 14s9 6 14 6h97c-13 47-18 97-13 148 13 134 107 244 237 278 39 10 78 15 117 15 91 0 178-33 246-95 85-78 127-194 112-310-6-43-18-82-36-118h134c5 0 10-2 14-6s5-9 4-14l-69-345zm-373 718c-124-26-205-148-181-273 14-72 61-130 122-162l-42 209c-1 5 0 10 4 14s9 6 14 6h221c-33 56-82 101-138 131-37 19-79 29-122 29-26 0-53-4-78-10z"/>
            <path d="m675 174c-4 0-7 2-9 6-10 20-10 43 0 63 4 8 11 8 14 0 10-20 10-43 0-63-2-4-5-6-5-6z"/>
            <path d="m513 111c-5 0-9 3-12 8-14 28-14 60 0 88 5 11 15 11 19 0 14-28 14-60 0-88-3-5-7-8-7-8z"/>
            <path d="m352 174c-4 0-7 2-9 6-10 20-10 43 0 63 4 8 11 8 14 0 10-20 10-43 0-63-2-4-5-6-5-6z"/>
          </svg>
          Buy me a coffee
        </button>
      </div>
      <div
        style={{
          position: 'fixed',
          bottom: '10px',
          right: '14px',
          fontSize: 'var(--font-md)',
          color: 'var(--text-muted)',
        }}
      >
        v0.1.2
      </div>

      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}
