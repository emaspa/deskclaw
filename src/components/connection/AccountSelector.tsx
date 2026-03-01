import { useState } from 'react';
import { Plus, UserCircle } from 'lucide-react';
import { useSettingsStore } from '../../store/settingsStore';
import { AccountItem } from './AccountItem';
import { AccountEditorDialog } from './AccountEditorDialog';
import type { SavedAccount } from '../../lib/types';

export function AccountSelector() {
  const accounts = useSettingsStore((s) => s.accounts);
  const activeAccountId = useSettingsStore((s) => s.activeAccountId);
  const loadAccount = useSettingsStore((s) => s.loadAccount);
  const deleteAccount = useSettingsStore((s) => s.deleteAccount);
  const clearActiveAccount = useSettingsStore((s) => s.clearActiveAccount);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SavedAccount | null>(null);

  const handleEdit = (account: SavedAccount) => {
    setEditingAccount(account);
    setEditorOpen(true);
  };

  const handleAdd = () => {
    setEditingAccount(null);
    setEditorOpen(true);
  };

  const handleDelete = (id: string) => {
    deleteAccount(id);
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
            isActive={account.id === activeAccountId}
            onClick={() => loadAccount(account.id)}
            onEdit={() => handleEdit(account)}
            onDelete={() => handleDelete(account.id)}
          />
        ))}
      </div>

      {/* Manual entry option */}
      {activeAccountId && (
        <button
          onClick={clearActiveAccount}
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
      )}

      {editorOpen && (
        <AccountEditorDialog
          account={editingAccount}
          onClose={() => { setEditorOpen(false); setEditingAccount(null); }}
        />
      )}
    </div>
  );
}
