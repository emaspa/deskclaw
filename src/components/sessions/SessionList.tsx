import { useEffect, useMemo, useState } from 'react';
import { useSessionStore, agentIdFromKey } from '../../store/sessionStore';
import { listSessions, getAgentIdentity, createSession, setNotificationIdentity } from '../../lib/tauri';
import { SessionItem } from './SessionItem';
import { Spinner } from '../ui/Spinner';
import { RefreshCw, PanelLeftClose, Plus, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import type { SessionInfo } from '../../lib/types';

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
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newAgentId, setNewAgentId] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  // Agent groups start collapsed except main; user toggles are kept here
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ main: true });
  const [query, setQuery] = useState('');

  // Search filters across all groups; results render flat
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return sessions.filter((s) =>
      [s.display_name, s.key, s.kind, s.model, s.last_channel]
        .some((f) => f && f.toLowerCase().includes(q))
    );
  }, [sessions, query]);
  const agents = useSessionStore((s) => s.agents);
  const canCreate = useSessionStore((s) => s.hasGatewayMethod('sessions.create'));

  // Group sessions by owning agent, like the official Control UI: main
  // first, the rest alphabetical.
  const groups = useMemo(() => {
    const map = new Map<string, SessionInfo[]>();
    for (const s of sessions) {
      const id = agentIdFromKey(s.key);
      const list = map.get(id);
      if (list) list.push(s);
      else map.set(id, [s]);
    }
    return [...map.keys()]
      .sort((a, b) => (a === 'main' ? -1 : b === 'main' ? 1 : a.localeCompare(b)))
      .map((id) => ({ id, sessions: map.get(id)! }));
  }, [sessions]);

  const agentLabel = (id: string) => {
    const agent = agents.find((a) => a.id === id);
    const name = agent?.name || id.charAt(0).toUpperCase() + id.slice(1);
    return agent?.emoji ? `${agent.emoji} ${name}` : name;
  };

  const fetchSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      const [result] = await Promise.all([
        listSessions(),
        getAgentIdentity().then((identity) => {
          console.log('[deskclaw] agent identity:', identity);
          const name = (identity.name as string) || (identity.displayName as string) || 'Assistant';
          setAgentIdentity({
            name,
            persona: (identity.persona as string) || undefined,
            emoji: (identity.emoji as string) || undefined,
          });
          setNotificationIdentity(name).catch(() => {});
        }).catch((e) => {
          console.warn('[deskclaw] agent.identity.get failed:', e);
        }),
      ]);
      console.log('[deskclaw] sessions:', result.length, result.map(s => s.key));
      setSessions(result);
      if (result.length > 0 && !activeSessionId) {
        const main = result.find((s) => agentIdFromKey(s.key) === 'main');
        setActiveSession((main || result[0]).key);
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

  const handleCreate = async () => {
    if (createBusy) return;
    setCreateBusy(true);
    try {
      const result = await createSession(newLabel.trim() || undefined, newAgentId || undefined);
      const newKey = (result.key as string) || (result.sessionKey as string) || '';
      const fresh = await listSessions();
      setSessions(fresh);
      if (newKey) setActiveSession(newKey);
      setCreating(false);
      setNewLabel('');
      setNewAgentId('');
    } catch (e) {
      const msg = typeof e === 'string' ? e : (e as Error).message || 'Failed to create session';
      console.error('[deskclaw] sessions.create error:', msg);
      setError(msg);
    } finally {
      setCreateBusy(false);
    }
  };

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
          {canCreate && (
            <button
              onClick={() => setCreating((v) => !v)}
              aria-label="New session"
              title="New session"
              style={{
                background: 'transparent',
                border: 'none',
                color: creating ? 'var(--accent-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = creating ? 'var(--accent-primary)' : 'var(--text-muted)'; }}
            >
              <Plus size={15} />
            </button>
          )}
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
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          margin: '0 12px 8px',
          padding: '5px 8px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
          placeholder="Search sessions..."
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: 'var(--font-sm)',
            fontFamily: 'inherit',
          }}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label="Clear search"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {creating && (
        <div
          style={{
            margin: '0 12px 8px',
            padding: '10px',
            background: 'rgba(108, 92, 231, 0.06)',
            border: '1px solid rgba(108, 92, 231, 0.2)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
            placeholder="Session label (optional)"
            autoFocus
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 8px',
              color: 'var(--text-primary)',
              fontSize: 'var(--font-sm)',
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          {agents.length > 1 && (
            <select
              value={newAgentId}
              onChange={(e) => setNewAgentId(e.target.value)}
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 8px',
                color: 'var(--text-primary)',
                fontSize: 'var(--font-sm)',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            >
              <option value="">Default agent</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.emoji ? `${a.emoji} ` : ''}{a.name || a.id}{a.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={handleCreate}
            disabled={createBusy}
            style={{
              background: 'var(--accent-primary)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '6px',
              color: '#fff',
              fontSize: 'var(--font-sm)',
              cursor: createBusy ? 'default' : 'pointer',
              fontFamily: 'inherit',
              opacity: createBusy ? 0.6 : 1,
            }}
          >
            {createBusy ? 'Creating...' : 'Create session'}
          </button>
        </div>
      )}

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
        {filtered && filtered.length === 0 && !loading && (
          <div
            style={{
              color: 'var(--text-secondary)',
              fontSize: 'var(--font-sm)',
              textAlign: 'center',
              padding: '24px 12px',
            }}
          >
            No matching sessions
          </div>
        )}
        {filtered
          ? filtered.map((session) => (
              <SessionItem
                key={session.key}
                session={session}
                active={session.key === activeSessionId}
                onClick={() => setActiveSession(session.key)}
              />
            ))
          : groups.length <= 1
          ? sessions.map((session) => (
              <SessionItem
                key={session.key}
                session={session}
                active={session.key === activeSessionId}
                onClick={() => setActiveSession(session.key)}
              />
            ))
          : groups.map((group) => {
              // Keep a group open while one of its sessions is active
              const hasActive = group.sessions.some((s) => s.key === activeSessionId);
              const isOpen = expanded[group.id] || hasActive;
              const Chevron = isOpen ? ChevronDown : ChevronRight;
              return (
                <div key={group.id}>
                  <button
                    onClick={() => setExpanded((e) => ({ ...e, [group.id]: !isOpen }))}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 8px 4px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: 'var(--font-xs)',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                  >
                    <Chevron size={12} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {agentLabel(group.id)}
                    </span>
                    <span style={{ fontWeight: 400 }}>{group.sessions.length}</span>
                  </button>
                  {isOpen && group.sessions.map((session) => (
                    <SessionItem
                      key={session.key}
                      session={session}
                      active={session.key === activeSessionId}
                      onClick={() => setActiveSession(session.key)}
                    />
                  ))}
                </div>
              );
            })}
      </div>
    </div>
  );
}
