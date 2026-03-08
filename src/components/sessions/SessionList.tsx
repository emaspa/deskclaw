import { useEffect, useState } from 'react';
import { useSessionStore } from '../../store/sessionStore';
import { listSessions, getAgentIdentity } from '../../lib/tauri';
import { SessionItem } from './SessionItem';
import { Spinner } from '../ui/Spinner';
import { RefreshCw, PanelLeftClose } from 'lucide-react';

interface SessionListProps {
  onCollapse?: () => void;
}

export function SessionList({ onCollapse }: SessionListProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setSessions = useSessionStore((s) => s.setSessions);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const setAgentIdentity = useSessionStore((s) => s.setAgentIdentity);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      const [result] = await Promise.all([
        listSessions(),
        getAgentIdentity().then((identity) => {
          console.log('[deskclaw] agent identity:', identity);
          setAgentIdentity({
            name: (identity.name as string) || (identity.displayName as string) || 'Assistant',
            persona: (identity.persona as string) || undefined,
            emoji: (identity.emoji as string) || undefined,
          });
        }).catch((e) => {
          console.warn('[deskclaw] agent.identity.get failed:', e);
        }),
      ]);
      console.log('[deskclaw] sessions:', result.length, result.map(s => s.key));
      setSessions(result);
      if (result.length > 0 && !activeSessionId) {
        setActiveSession(result[0].key);
      }
    } catch (e) {
      const msg = typeof e === 'string' ? e : (e as Error).message || 'Failed to load sessions';
      console.error('[deskclaw] session fetch error:', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch if AppShell hasn't already loaded sessions
    if (sessions.length === 0) fetchSessions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 12px 8px',
        }}
      >
        <span
          style={{
            fontSize: 'var(--font-xs)',
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Sessions
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button
            onClick={fetchSessions}
            disabled={loading}
            aria-label="Refresh sessions"
            title="Refresh sessions"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)';
            }}
          >
            {loading ? <Spinner size={14} /> : <RefreshCw size={14} />}
          </button>
          {onCollapse && (
            <button
              onClick={onCollapse}
              title="Collapse sidebar"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <PanelLeftClose size={14} />
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0 8px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        {error && (
          <div
            style={{
              color: 'var(--accent-danger)',
              fontSize: 'var(--font-sm)',
              textAlign: 'center',
              padding: '16px 12px',
              background: 'rgba(255, 82, 82, 0.08)',
              borderRadius: 'var(--radius-md)',
              margin: '0 4px',
            }}
          >
            {error}
          </div>
        )}
        {sessions.length === 0 && !loading && !error && (
          <div
            style={{
              color: 'var(--text-secondary)',
              fontSize: 'var(--font-sm)',
              textAlign: 'center',
              padding: '24px 12px',
            }}
          >
            No sessions found
          </div>
        )}
        {sessions.map((session) => (
          <SessionItem
            key={session.key}
            session={session}
            active={session.key === activeSessionId}
            onClick={() => setActiveSession(session.key)}
          />
        ))}
      </div>
    </div>
  );
}
