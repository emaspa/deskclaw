import { useState } from 'react';
import { Pencil, Trash2, User } from 'lucide-react';
import type { SavedAccount } from '../../lib/types';

interface AccountItemProps {
  account: SavedAccount;
  isActive: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function AccountItem({ account, isActive, onClick, onEdit, onDelete }: AccountItemProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        background: isActive
          ? 'rgba(108, 92, 231, 0.15)'
          : hovered
            ? 'rgba(255, 255, 255, 0.04)'
            : 'transparent',
        border: isActive
          ? '1px solid rgba(108, 92, 231, 0.3)'
          : '1px solid transparent',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'rgba(108, 92, 231, 0.15)',
          border: '1px solid rgba(108, 92, 231, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        {account.avatar ? (
          <img
            src={account.avatar}
            alt={account.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <User size={16} style={{ color: 'var(--accent-primary)' }} />
        )}
      </div>

      {/* Name + host */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--font-sm)',
            fontWeight: 600,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {account.name}
        </div>
        <div
          style={{
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {account.username}@{account.host}:{account.port}
        </div>
      </div>

      {/* Hover actions */}
      {hovered && (
        <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '4px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '4px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-danger)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
