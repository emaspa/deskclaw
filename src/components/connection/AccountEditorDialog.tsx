import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload } from 'lucide-react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { ImageCropper } from '../ui/ImageCropper';
import { useSettingsStore } from '../../store/settingsStore';
import { encryptString } from '../../lib/tauri';
import type { SavedAccount } from '../../lib/types';

interface Props {
  account: SavedAccount | null; // null = create new
  onClose: () => void;
}

export function AccountEditorDialog({ account, onClose }: Props) {
  const addAccount = useSettingsStore((s) => s.addAccount);
  const updateAccount = useSettingsStore((s) => s.updateAccount);

  const [name, setName] = useState(account?.name || '');
  const [nickname, setNickname] = useState(account?.nickname || '');
  const [avatar, setAvatar] = useState(account?.avatar || '');
  const [host, setHost] = useState(account?.host || '');
  const [port, setPort] = useState(account?.port || 22);
  const [username, setUsername] = useState(account?.username || '');
  const [authMethod, setAuthMethod] = useState<'password' | 'key'>(account?.authMethod || 'password');
  const [keyPath, setKeyPath] = useState(account?.keyPath || '');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [keyPassphrase, setKeyPassphrase] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [cropperSrc, setCropperSrc] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = () => {
      setCropperSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!name.trim() || !host.trim() || !username.trim()) {
      setError('Name, host, and username are required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      // Encrypt secrets
      const encryptedPassword = password ? await encryptString(password) : account?.encryptedPassword;
      const encryptedToken = token ? await encryptString(token) : account?.encryptedToken;
      const encryptedKeyPassphrase = keyPassphrase ? await encryptString(keyPassphrase) : account?.encryptedKeyPassphrase;

      const data: SavedAccount = {
        id: account?.id || crypto.randomUUID(),
        name: name.trim(),
        nickname: nickname.trim() || undefined,
        avatar: avatar || undefined,
        host: host.trim(),
        port,
        username: username.trim(),
        authMethod,
        keyPath: authMethod === 'key' ? keyPath : undefined,
        encryptedPassword,
        encryptedToken,
        encryptedKeyPassphrase: authMethod === 'key' ? encryptedKeyPassphrase : undefined,
      };

      if (account) {
        updateAccount(account.id, data);
      } else {
        addAccount(data);
      }

      onClose();
    } catch (e) {
      setError(typeof e === 'string' ? e : (e as Error).message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return <>{createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)',
        overflowY: 'auto',
        padding: '24px 16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="glass"
        style={{
          width: '100%',
          maxWidth: '400px',
          padding: '20px',
          borderRadius: 'var(--radius-lg)',
          flexShrink: 0,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ fontSize: 'var(--font-lg)', fontWeight: 600, color: 'var(--text-primary)' }}>
            {account ? 'Edit Account' : 'New Account'}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Avatar + Name row */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'rgba(108, 92, 231, 0.1)',
                border: '2px dashed rgba(108, 92, 231, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
                overflow: 'hidden',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(108, 92, 231, 0.6)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(108, 92, 231, 0.3)'; }}
            >
              {avatar ? (
                <img src={avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Upload size={16} style={{ color: 'var(--accent-primary)' }} />
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              style={{ display: 'none' }}
            />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Input label="Account Name" placeholder="My Server" value={name} onChange={(e) => setName(e.target.value)} />
              <Input label="Chat Nickname" placeholder="Optional display name" value={nickname} onChange={(e) => setNickname(e.target.value)} />
            </div>
          </div>

          <div style={{ height: '1px', background: 'var(--glass-border)' }} />

          {/* Connection fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '8px' }}>
            <Input label="Host" placeholder="192.168.1.100" value={host} onChange={(e) => setHost(e.target.value)} />
            <Input label="Port" type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} />
          </div>

          <Input label="Username" placeholder="user" value={username} onChange={(e) => setUsername(e.target.value)} />

          <div style={{ display: 'flex', gap: '6px' }}>
            <Button
              type="button"
              variant={authMethod === 'password' ? 'primary' : 'secondary'}
              onClick={() => setAuthMethod('password')}
              style={{ flex: 1, padding: '6px' }}
            >
              Password
            </Button>
            <Button
              type="button"
              variant={authMethod === 'key' ? 'primary' : 'secondary'}
              onClick={() => setAuthMethod('key')}
              style={{ flex: 1, padding: '6px' }}
            >
              SSH Key
            </Button>
          </div>

          {authMethod === 'password' ? (
            <Input
              label={account?.encryptedPassword ? 'Password (leave blank to keep)' : 'Password'}
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          ) : (
            <>
              <Input label="Key Path" placeholder="~/.ssh/id_ed25519" value={keyPath} onChange={(e) => setKeyPath(e.target.value)} />
              <Input
                label={account?.encryptedKeyPassphrase ? 'Key Passphrase (leave blank to keep)' : 'Key Passphrase (optional)'}
                type="password"
                placeholder="Passphrase"
                value={keyPassphrase}
                onChange={(e) => setKeyPassphrase(e.target.value)}
              />
            </>
          )}

          <div style={{ height: '1px', background: 'var(--glass-border)' }} />

          <Input
            label={account?.encryptedToken ? 'OpenClaw Token (leave blank to keep)' : 'OpenClaw Token'}
            type="password"
            placeholder="Gateway authentication token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />

          {error && (
            <div
              style={{
                padding: '8px 12px',
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

          <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
            <Button variant="secondary" onClick={onClose} style={{ flex: 1 }}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving} style={{ flex: 1 }}>
              {account ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )}
  {cropperSrc && (
    <ImageCropper
      imageSrc={cropperSrc}
      onCrop={(dataUrl) => {
        setAvatar(dataUrl);
        setCropperSrc(null);
      }}
      onCancel={() => setCropperSrc(null)}
    />
  )}
  </>;
}
