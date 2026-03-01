import { useState } from 'react';
import { Plus, UserCircle } from 'lucide-react';
import { useSettingsStore } from '../../store/settingsStore';
import { useConnectionStore } from '../../store/connectionStore';
import { AccountItem } from './AccountItem';
import { AccountEditorDialog } from './AccountEditorDialog';
import { connectSsh, decryptString } from '../../lib/tauri';
import type { SavedAccount, ConnectParams } from '../../lib/types';

export function AccountSelector() {
  const accounts = useSettingsStore((s) => s.accounts);
  const activeAccountId = useSettingsStore((s) => s.activeAccountId);
  const setPhase = useConnectionStore((s) => s.setPhase);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SavedAccount | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const handleEdit = (account: SavedAccount) => {
    setEditingAccount(account);
    setEditorOpen(true);
  };

  const handleAdd = () => {
    setEditingAccount(null);
    setEditorOpen(true);
  };

  const handleConnect = async (account: SavedAccount) => {
    setConnectingId(account.id);
    setPhase('ConnectingSsh');

    try {
      const password = account.encryptedPassword
        ? await decryptString(account.encryptedPassword) : undefined;
      const token = account.encryptedToken
        ? await decryptString(account.encryptedToken) : undefined;
      const keyPassphrase = account.encryptedKeyPassphrase
        ? await decryptString(account.encryptedKeyPassphrase) : undefined;

      const params: ConnectParams = {
        host: account.host,
        port: account.port,
        username: account.username,
        auth_method: account.authMethod,
        password: account.authMethod === 'password' ? password : undefined,
        key_path: account.authMethod === 'key' ? account.keyPath : undefined,
        key_passphrase: account.authMethod === 'key' ? keyPassphrase : undefined,
        token: token || '',
      };

      // Mark this account as active
      useSettingsStore.getState().loadAccount(account.id);

      await connectSsh(params);
    } catch (e) {
      const msg = typeof e === 'string' ? e : (e as Error).message || 'Connection failed';
      setPhase({ Error: msg });
    } finally {
      setConnectingId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 4px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: 'var(--font-sm)',
            fontWeight: 600,
            color: 'var(--text-secondary)',
          }}
        >
          <UserCircle size={14} />
          Saved Accounts
        </div>
        <button
          onClick={handleAdd}
          style={{
            background: 'rgba(108, 92, 231, 0.12)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 8px',
            cursor: 'pointer',
            color: 'var(--accent-primary)',
            fontSize: 'var(--font-xs)',
            fontWeight: 500,
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(108, 92, 231, 0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(108, 92, 231, 0.12)'; }}
        >
          <Plus size={12} />
          Add
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {accounts.map((account) => (
          <AccountItem
            key={account.id}
            account={account}
            isActive={account.id === activeAccountId || account.id === connectingId}
            onClick={() => handleConnect(account)}
            onEdit={() => handleEdit(account)}
          />
        ))}
      </div>

      {/* Manual entry option */}
      <button
        onClick={() => useSettingsStore.getState().clearActiveAccount()}
        style={{
          background: 'transparent',
          border: '1px dashed var(--glass-border)',
          borderRadius: 'var(--radius-md)',
          padding: '8px',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          fontSize: 'var(--font-xs)',
          fontFamily: 'inherit',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--text-secondary)';
          e.currentTarget.style.color = 'var(--text-secondary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--glass-border)';
          e.currentTarget.style.color = 'var(--text-muted)';
        }}
      >
        Manual entry
      </button>

      {editorOpen && (
        <AccountEditorDialog
          account={editingAccount}
          onClose={() => { setEditorOpen(false); setEditingAccount(null); }}
        />
      )}
    </div>
  );
}
