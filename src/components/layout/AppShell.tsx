import { useCallback, useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';
import { ChatView } from '../chat/ChatView';
import { useConnectionStore } from '../../store/connectionStore';
import { useSessionStore, agentIdFromKey } from '../../store/sessionStore';
import { useSettingsStore } from '../../store/settingsStore';
import { listSessions, getAgentIdentity, listAgents, getGatewayInfo, setNotificationIdentity } from '../../lib/tauri';
import type { AgentInfo } from '../../lib/types';

/** Parse the agents.list payload into the store's AgentInfo shape */
function parseAgents(result: Record<string, unknown>): AgentInfo[] {
  const defaultId = result.defaultId as string | undefined;
  const raw = result.agents;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
    .map((a) => {
      const identity = (a.identity || {}) as Record<string, unknown>;
      const model = (a.model || {}) as Record<string, unknown>;
      return {
        id: (a.id as string) || '',
        name: (a.name as string) || (identity.name as string) || undefined,
        emoji: (identity.emoji as string) || undefined,
        avatarUrl: (identity.avatarUrl as string) || undefined,
        model: (model.primary as string) || undefined,
        isDefault: a.id === defaultId,
      };
    })
    .filter((a) => a.id);
}

export function AppShell() {
  const sessionCount = useSessionStore((s) => s.sessions.length);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const phase = useConnectionStore((s) => s.phase);
  const activeAccountId = useSettingsStore((s) => s.activeAccountId);
  const updateAccountLayout = useSettingsStore((s) => s.updateAccountLayout);
  const layoutPrefs = useSettingsStore((s) => s.getActiveAccountLayout());

  const [sidebarCollapsed, setSidebarCollapsed] = useState(layoutPrefs?.sidebarCollapsed ?? false);

  // Fetch sessions on mount (works even with collapsed sidebar)
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const [sessions] = await Promise.all([
          listSessions(),
          getAgentIdentity().then((identity) => {
            const name = (identity.name as string) || (identity.displayName as string) || 'Assistant';
            useSessionStore.getState().setAgentIdentity({
              name,
              persona: (identity.persona as string) || undefined,
              emoji: (identity.emoji as string) || undefined,
            });
            // Attribute desktop notifications to the agent (e.g. "Luna")
            setNotificationIdentity(name).catch(() => {});
          }).catch(() => {}),
          listAgents().then((result) => {
            useSessionStore.getState().setAgents(parseAgents(result));
          }).catch((e) => console.warn('[deskclaw] agents.list failed:', e)),
          getGatewayInfo().then((info) => {
            useSessionStore.getState().setGatewayInfo(info);
          }).catch(() => {}),
        ]);
        useSessionStore.getState().setSessions(sessions);
        // Auto-select last session from prefs, or fall back to first
        const currentActive = useSessionStore.getState().activeSessionId;
        if (!currentActive && sessions.length > 0) {
          const savedKey = layoutPrefs?.lastSessionKey;
          const match = savedKey && sessions.find((s) => s.key === savedKey);
          // Fall back to a main-agent session before anything else
          const main = sessions.find((s) => agentIdFromKey(s.key) === 'main');
          useSessionStore.getState().setActiveSession(match ? savedKey! : (main || sessions[0]).key);
        }
      } catch (e) {
        console.error('[deskclaw] initial session fetch error:', e);
      }
    };
    fetchSessions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save active session key to account layout prefs when it changes
  useEffect(() => {
    if (activeAccountId && activeSessionId) {
      updateAccountLayout(activeAccountId, { lastSessionKey: activeSessionId });
    }
  }, [activeSessionId, activeAccountId, updateAccountLayout]);

  useEffect(() => {
    console.log('[deskclaw] AppShell mounted, sessions:', sessionCount);
  }, [sessionCount]);

  // Save sidebar state to account on toggle
  const handleSidebarToggle = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      if (activeAccountId) updateAccountLayout(activeAccountId, { sidebarCollapsed: next });
      return next;
    });
  }, [activeAccountId, updateAccountLayout]);

  return (
    <div
      className="animate-fade-in-up"
      style={{
        display: 'grid',
        gridTemplateColumns: `${sidebarCollapsed ? '48px' : '260px'} 1fr`,
        gridTemplateRows: '38px 1fr',
        gridTemplateAreas: `
          "titlebar titlebar"
          "sidebar  content"
        `,
        height: '100vh',
        width: '100vw',
        transition: 'grid-template-columns 0.2s ease',
      }}
    >
      <TitleBar />
      <Sidebar collapsed={sidebarCollapsed} onToggle={handleSidebarToggle} />
      <div style={{ gridArea: 'content', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {phase === 'Reconnecting' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '6px 12px',
              background: 'rgba(255, 171, 0, 0.12)',
              borderBottom: '1px solid rgba(255, 171, 0, 0.25)',
              color: 'var(--accent-warning)',
              fontSize: 'var(--font-xs)',
              flexShrink: 0,
            }}
          >
            <WifiOff size={13} />
            Connection lost — reconnecting...
          </div>
        )}
        <ChatView />
      </div>
    </div>
  );
}
