import { useEffect, useRef, useState } from 'react';
import { MessageSquare, MoreHorizontal, Archive, RotateCcw, Trash2 } from 'lucide-react';
import { useSessionStore } from '../../store/sessionStore';
import { compactSession, resetSession, deleteSession, listSessions } from '../../lib/tauri';
import type { SessionInfo } from '../../lib/types';

interface SessionItemProps {
  session: SessionInfo;
  active: boolean;
  onClick: () => void;
}

function formatDateTime(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isToday) return `Today ${time}`;
  if (isYesterday) return `Yesterday ${time}`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` ${time}`;
}

function formatSessionName(session: SessionInfo): string {
  // Prefer date/time; only use display_name if it's not a phone number or raw identifier
  if (session.updated_at) return formatDateTime(session.updated_at);
  if (session.display_name) return session.display_name;
  return session.kind || session.id.slice(0, 8);
}

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: '💬 WhatsApp',
  openai: '🤖 OpenAI',
  telegram: '📨 Telegram',
  web: '🌐 Web',
};

function formatSubtitle(session: SessionInfo): string {
  const parts: string[] = [];
  const keyParts = session.key.split(':');

  // Channel from key (e.g. agent:main:whatsapp:direct:+353...)
  if (keyParts.length > 2 && keyParts[2] !== 'main') {
    const channel = keyParts[2];
    parts.push(CHANNEL_LABELS[channel] || channel);
  } else if (session.kind) {
    parts.push(session.kind);
  }

  if (session.model) parts.push(session.model);

  return parts.join(' · ');
}

async function refreshSessions() {
  try {
    const sessions = await listSessions();
    useSessionStore.getState().setSessions(sessions);
  } catch {
    // sidebar refresh button remains available
  }
}

function SessionMenu({ session, onClose }: { session: SessionInfo; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const hasMethod = useSessionStore((s) => s.hasGatewayMethod);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
      await refreshSessions();
      onClose();
    } catch (e) {
      console.error(`[deskclaw] ${label} failed:`, e);
      setBusy(null);
    }
  };

  const items = [
    hasMethod('sessions.compact') && {
      icon: Archive,
      label: 'Compact context',
      action: () => run('compact', () => compactSession(session.key)),
    },
    hasMethod('sessions.reset') && {
      icon: RotateCcw,
      label: 'Reset session',
      action: () => run('reset', () => resetSession(session.key)),
    },
    hasMethod('sessions.delete') && {
      icon: Trash2,
      label: confirmDelete ? 'Confirm delete?' : 'Delete session',
      danger: true,
      action: () => {
        if (!confirmDelete) {
          setConfirmDelete(true);
          return;
        }
        run('delete', async () => {
          await deleteSession(session.key);
          const store = useSessionStore.getState();
          if (store.activeSessionId === session.key) store.setActiveSession(null);
        });
      },
    },
  ].filter(Boolean) as { icon: typeof Archive; label: string; danger?: boolean; action: () => void }[];

  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        top: '100%',
        right: 8,
        zIndex: 50,
        minWidth: 170,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--glass-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        padding: '4px',
      }}
    >
      {items.map(({ icon: Icon, label, danger, action }) => (
        <button
          key={label}
          onClick={(e) => { e.stopPropagation(); action(); }}
          disabled={busy !== null}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 10px',
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: danger ? 'var(--accent-danger)' : 'var(--text-primary)',
            fontSize: 'var(--font-sm)',
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'inherit',
            opacity: busy ? 0.5 : 1,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <Icon size={13} style={{ flexShrink: 0 }} />
          {label}
        </button>
      ))}
    </div>
  );
}

export function SessionItem({ session, active, onClick }: SessionItemProps) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
        className="animate-slide-in-left"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 12px',
          background: active ? 'rgba(108, 92, 231, 0.12)' : 'transparent',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.15s ease',
          fontFamily: 'inherit',
          fontSize: 'var(--font-sm)',
          boxSizing: 'border-box',
        }}
        onMouseEnter={(e) => {
          setHovered(true);
          if (!active) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
        }}
        onMouseLeave={(e) => {
          setHovered(false);
          if (!active) e.currentTarget.style.background = 'transparent';
        }}
      >
        <MessageSquare
          size={16}
          style={{
            color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div
            style={{
              fontWeight: active ? 600 : 400,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {formatSessionName(session)}
          </div>
          <div
            style={{
              fontSize: 'var(--font-xs)',
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {formatSubtitle(session)}
          </div>
        </div>
        {(hovered || menuOpen) && (
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            aria-label="Session actions"
            title="Session actions"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '2px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <MoreHorizontal size={14} />
          </button>
        )}
      </div>
      {menuOpen && <SessionMenu session={session} onClose={() => setMenuOpen(false)} />}
    </div>
  );
}
