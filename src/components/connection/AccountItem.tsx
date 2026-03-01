import { Pencil } from 'lucide-react';
import type { SavedAccount } from '../../lib/types';

interface AccountItemProps {
  account: SavedAccount;
  isActive: boolean;
  onClick: () => void;
  onEdit: () => void;
}

export function AccountItem({ account, isActive, onClick, onEdit }: AccountItemProps) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        background: isActive
          ? 'rgba(108, 92, 231, 0.15)'
          : 'transparent',
        border: isActive
          ? '1px solid rgba(108, 92, 231, 0.3)'
          : '1px solid transparent',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = 'transparent';
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'rgba(108, 92, 231, 0.15)',
          border: '1px solid rgba(108, 92, 231, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          overflow: 'hidden',
          fontSize: '22px',
        }}
      >
        {account.avatar ? (
          <img
            src={account.avatar}
            alt={account.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span>{account.name.charAt(0).toUpperCase()}</span>
        )}
      </div>

      {/* Name + "chat with username" */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--font-md)',
            fontWeight: 600,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {account.nickname || account.name}
        </div>
        <div
          style={{
            fontSize: 'var(--font-sm)',
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          chat with {account.name}
        </div>
      </div>

      {/* Edit icon */}
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        style={{
          background: 'transparent',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          padding: '4px',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          display: 'flex',
          flexShrink: 0,
          transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-primary)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        <Pencil size={13} />
      </button>
    </div>
  );
}
