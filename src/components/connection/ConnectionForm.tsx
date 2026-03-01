import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useSettingsStore } from '../../store/settingsStore';
import { useConnectionStore } from '../../store/connectionStore';
import { connectSsh, decryptString, encryptString } from '../../lib/tauri';
import type { ConnectParams } from '../../lib/types';

export function ConnectionForm() {
  const settings = useSettingsStore();
  const phase = useConnectionStore((s) => s.phase);
  const setPhase = useConnectionStore((s) => s.setPhase);

  const [password, setPassword] = useState('');
  const [keyPassphrase, setKeyPassphrase] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);

  // When an account is loaded, decrypt its credentials
  const activeAccountId = useSettingsStore((s) => s.activeAccountId);
  const accounts = useSettingsStore((s) => s.accounts);
  const activeAccount = accounts.find((a) => a.id === activeAccountId);

  useEffect(() => {
    if (!activeAccount) return;

    let cancelled = false;

    (async () => {
      try {
        if (activeAccount.encryptedPassword) {
          const pw = await decryptString(activeAccount.encryptedPassword);
          if (!cancelled) setPassword(pw);
        } else {
          if (!cancelled) setPassword('');
        }

        if (activeAccount.encryptedToken) {
          const t = await decryptString(activeAccount.encryptedToken);
          if (!cancelled) setToken(t);
        } else {
          if (!cancelled) setToken('');
        }

        if (activeAccount.encryptedKeyPassphrase) {
          const kp = await decryptString(activeAccount.encryptedKeyPassphrase);
          if (!cancelled) setKeyPassphrase(kp);
        } else {
          if (!cancelled) setKeyPassphrase('');
        }
      } catch (e) {
        console.error('[deskclaw] failed to decrypt credentials:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [activeAccountId]);

  const isConnecting =
    phase !== 'Disconnected' &&
    phase !== 'Connected' &&
    !(typeof phase === 'object' && 'Error' in phase);

  const handleConnect = async () => {
    setError('');
    setPhase('ConnectingSsh');

    const params: ConnectParams = {
      host: settings.host,
      port: settings.port,
      username: settings.username,
      auth_method: settings.authMethod,
      password: settings.authMethod === 'password' ? password : undefined,
      key_path: settings.authMethod === 'key' ? settings.keyPath : undefined,
      key_passphrase: settings.authMethod === 'key' ? keyPassphrase : undefined,
      token,
    };

    try {
      await connectSsh(params);
    } catch (e) {
      const msg = typeof e === 'string' ? e : (e as Error).message || 'Connection failed';
      setError(msg);
      setPhase({ Error: msg });
    }
  };

  const handleSaveAccount = async () => {
    if (!settings.host || !settings.username) return;

    setSavingAccount(true);
    try {
      const encryptedPassword = password ? await encryptString(password) : undefined;
      const encryptedToken = token ? await encryptString(token) : undefined;
      const encryptedKeyPassphrase = keyPassphrase ? await encryptString(keyPassphrase) : undefined;

      settings.addAccount({
        id: crypto.randomUUID(),
        name: `${settings.username}@${settings.host}`,
        host: settings.host,
        port: settings.port,
        username: settings.username,
        authMethod: settings.authMethod,
        keyPath: settings.authMethod === 'key' ? settings.keyPath : undefined,
        encryptedPassword,
        encryptedToken,
        encryptedKeyPassphrase,
      });
    } catch (e) {
      console.error('[deskclaw] failed to save account:', e);
    } finally {
      setSavingAccount(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleConnect();
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '12px' }}>
        <Input
          label="Host"
          placeholder="192.168.1.100"
          value={settings.host}
          onChange={(e) => settings.setField('host', e.target.value)}
        />
        <Input
          label="SSH Port"
          type="number"
          placeholder="22"
          value={settings.port}
          onChange={(e) => settings.setField('port', Number(e.target.value))}
        />
      </div>

      <Input
        label="Username"
        placeholder="user"
        value={settings.username}
        onChange={(e) => settings.setField('username', e.target.value)}
      />

      <div style={{ display: 'flex', gap: '8px' }}>
        <Button
          type="button"
          variant={settings.authMethod === 'password' ? 'primary' : 'secondary'}
          onClick={() => settings.setField('authMethod', 'password')}
          style={{ flex: 1, padding: '8px' }}
        >
          Password
        </Button>
        <Button
          type="button"
          variant={settings.authMethod === 'key' ? 'primary' : 'secondary'}
          onClick={() => settings.setField('authMethod', 'key')}
          style={{ flex: 1, padding: '8px' }}
        >
          SSH Key
        </Button>
      </div>

      {settings.authMethod === 'password' ? (
        <Input
          label="Password"
          type="password"
          placeholder="Enter password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      ) : (
        <>
          <Input
            label="Key Path"
            placeholder="~/.ssh/id_ed25519"
            value={settings.keyPath}
            onChange={(e) => settings.setField('keyPath', e.target.value)}
          />
          <Input
            label="Key Passphrase (optional)"
            type="password"
            placeholder="Passphrase"
            value={keyPassphrase}
            onChange={(e) => setKeyPassphrase(e.target.value)}
          />
        </>
      )}

      <div
        style={{
          height: '1px',
          background: 'var(--glass-border)',
          margin: '4px 0',
        }}
      />

      <Input
        label="OpenClaw Token"
        type="password"
        placeholder="Gateway authentication token"
        value={token}
        onChange={(e) => setToken(e.target.value)}
      />

      {error && (
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(255, 82, 82, 0.1)',
            border: '1px solid rgba(255, 82, 82, 0.2)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--accent-danger)',
            fontSize: 'var(--font-sm)',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        {!activeAccountId && settings.host && settings.username && (
          <Button
            type="button"
            variant="secondary"
            onClick={handleSaveAccount}
            loading={savingAccount}
            style={{ padding: '10px 14px' }}
          >
            <Save size={15} />
            Save
          </Button>
        )}
        <Button
          type="submit"
          loading={isConnecting}
          disabled={!settings.host || !settings.username || !token}
          style={{ flex: 1 }}
        >
          Connect
        </Button>
      </div>
    </form>
  );
}
