import { useState } from 'react';
import { Settings, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { SessionList } from '../sessions/SessionList';
import { SettingsDialog } from '../settings/SettingsDialog';
import { disconnectSsh } from '../../lib/tauri';
import { useConnectionStore } from '../../store/connectionStore';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const [showSettings, setShowSettings] = useState(false);
  const setPhase = useConnectionStore((s) => s.setPhase);

  const handleDisconnect = async () => {
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
          }}
        >
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
