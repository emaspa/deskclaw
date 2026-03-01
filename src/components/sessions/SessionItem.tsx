import { MessageSquare } from 'lucide-react';
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

export function SessionItem({ session, active, onClick }: SessionItemProps) {
  return (
    <button
      onClick={onClick}
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
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
      }}
      onMouseLeave={(e) => {
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
    </button>
  );
}
