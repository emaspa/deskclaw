import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Toggle } from '../ui/Toggle';
import { useSettingsStore } from '../../store/settingsStore';
import { saveSettings, setCloseToTray } from '../../lib/tauri';

interface SettingsFormProps {
  onClose: () => void;
}

export function SettingsForm({ onClose }: SettingsFormProps) {
  const settings = useSettingsStore();

  const handleSave = async () => {
    try {
      await saveSettings({
        host: settings.host || undefined,
        port: settings.port,
        username: settings.username || undefined,
        auth_method: settings.authMethod,
        key_path: settings.keyPath || undefined,
      });
      // Sync close-to-tray to Rust backend
      await setCloseToTray(settings.closeToTray);
      onClose();
    } catch {
      // silent
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Behavior section */}
      <div>
        <div
          style={{
            fontSize: 'var(--font-xs)',
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '8px',
          }}
        >
          Behavior
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <Toggle
            label="Close to tray"
            description="Hide window to system tray instead of quitting"
            checked={settings.closeToTray}
            onChange={(v) => settings.setAppSetting('closeToTray', v)}
          />
          <Toggle
            label="Minimize to tray"
            description="Minimize to system tray instead of taskbar"
            checked={settings.minimizeToTray}
            onChange={(v) => settings.setAppSetting('minimizeToTray', v)}
          />
          <Toggle
            label="Auto-login"
            description="Automatically connect to your last used account on startup"
            checked={settings.autoLogin}
            onChange={(v) => settings.setAppSetting('autoLogin', v)}
          />
          <Toggle
            label="Check for updates"
            description="Notify when a new version is available"
            checked={settings.checkForUpdates}
            onChange={(v) => settings.setAppSetting('checkForUpdates', v)}
          />
        </div>
      </div>

      <div style={{ height: '1px', background: 'var(--glass-border)' }} />

      {/* System paths section */}
      <div>
        <div
          style={{
            fontSize: 'var(--font-xs)',
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '8px',
          }}
        >
          System Paths
        </div>
        <Input
          label="Default SSH Key Path"
          placeholder="~/.ssh/id_ed25519"
          value={settings.keyPath}
          onChange={(e) => settings.setField('keyPath', e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSave} style={{ flex: 1 }}>
          Save
        </Button>
      </div>
    </div>
  );
}
