import { useState } from 'react';
import { Settings, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { SessionList } from '../sessions/SessionList';
import { SettingsDialog } from '../settings/SettingsDialog';
import { disconnectSsh } from '../../lib/tauri';
import { useConnectionStore } from '../../store/connectionStore';
import { useSettingsStore } from '../../store/settingsStore';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const [showSettings, setShowSettings] = useState(false);
  const setPhase = useConnectionStore((s) => s.setPhase);

  const handleDisconnect = async () => {
    // Clear lastAccountId so auto-login doesn't immediately reconnect
    useSettingsStore.getState().setLastAccountId(null);
    try {
      await disconnectSsh();
    } catch {
      setPhase('Disconnected');
    }
  };

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <>
      <div
        style={{
          gridArea: 'sidebar',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--glass-border)',
          overflow: 'hidden',
        }}
      >
        {collapsed ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 4px 8px' }}>
            <button
              onClick={onToggle}
              title="Expand sidebar"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <ToggleIcon size={16} />
            </button>
          </div>
        ) : (
          <SessionList onCollapse={onToggle} />
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: collapsed ? 'column' : 'row',
            gap: '4px',
            padding: collapsed ? '8px 4px' : '8px 12px',
            borderTop: '1px solid var(--glass-border)',
            marginTop: 'auto',
            flexWrap: 'wrap',
          }}
        >
          {/* Buy me a coffee */}
          <button
            onClick={() => openUrl('https://buymeacoffee.com/emaspa')}
            title="Buy me a coffee"
            style={{
              flex: collapsed ? undefined : '1 1 100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: collapsed ? '0' : '6px',
              padding: '8px',
              background: 'transparent',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 'var(--font-xs)',
              fontFamily: 'inherit',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 884 1279" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
              <path d="m791 298c-1-9-8-15-17-15h-671c-8 0-15 5-17 13l-86 429c-1 5 0 10 4 14s9 6 14 6h97c-13 47-18 97-13 148 13 134 107 244 237 278 39 10 78 15 117 15 91 0 178-33 246-95 85-78 127-194 112-310-6-43-18-82-36-118h134c5 0 10-2 14-6s5-9 4-14l-69-345zm-373 718c-124-26-205-148-181-273 14-72 61-130 122-162l-42 209c-1 5 0 10 4 14s9 6 14 6h221c-33 56-82 101-138 131-37 19-79 29-122 29-26 0-53-4-78-10z"/>
              <path d="m675 174c-4 0-7 2-9 6-10 20-10 43 0 63 4 8 11 8 14 0 10-20 10-43 0-63-2-4-5-6-5-6z"/>
              <path d="m513 111c-5 0-9 3-12 8-14 28-14 60 0 88 5 11 15 11 19 0 14-28 14-60 0-88-3-5-7-8-7-8z"/>
              <path d="m352 174c-4 0-7 2-9 6-10 20-10 43 0 63 4 8 11 8 14 0 10-20 10-43 0-63-2-4-5-6-5-6z"/>
            </svg>
            {!collapsed && 'Buy me a coffee'}
          </button>

          {[
            { icon: Settings, label: 'Settings', onClick: () => setShowSettings(true) },
            { icon: LogOut, label: 'Disconnect', onClick: handleDisconnect, danger: true },
          ].map(({ icon: Icon, label, onClick, danger }) => (
            <button
              key={label}
              onClick={onClick}
              title={label}
              style={{
                flex: collapsed ? undefined : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: collapsed ? '0' : '6px',
                padding: '8px',
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: danger ? 'var(--accent-danger)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 'var(--font-xs)',
                fontFamily: 'inherit',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = danger
                  ? 'rgba(255, 82, 82, 0.1)'
                  : 'rgba(255, 255, 255, 0.04)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <Icon size={14} />
              {!collapsed && label}
            </button>
          ))}
        </div>
      </div>

      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </>
  );
}
