import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useSettingsStore } from '../../store/settingsStore';
import { saveSettings } from '../../lib/tauri';

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
      onClose();
    } catch {
      // silent
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <Input
        label="Default Host"
        placeholder="192.168.1.100"
        value={settings.host}
        onChange={(e) => settings.setField('host', e.target.value)}
      />
      <Input
        label="Default SSH Port"
        type="number"
        value={settings.port}
        onChange={(e) => settings.setField('port', Number(e.target.value))}
      />
      <Input
        label="Default Username"
        placeholder="user"
        value={settings.username}
        onChange={(e) => settings.setField('username', e.target.value)}
      />
      <Input
        label="Default SSH Key Path"
        placeholder="~/.ssh/id_ed25519"
        value={settings.keyPath}
        onChange={(e) => settings.setField('keyPath', e.target.value)}
      />

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
