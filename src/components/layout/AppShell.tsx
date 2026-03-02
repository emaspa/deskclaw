import { useCallback, useEffect, useState } from 'react';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';
import { ChatView } from '../chat/ChatView';
import { useSessionStore } from '../../store/sessionStore';
import { useSettingsStore } from '../../store/settingsStore';
import { listSessions, getAgentIdentity } from '../../lib/tauri';

export function AppShell() {
  const sessionCount = useSessionStore((s) => s.sessions.length);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
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
            useSessionStore.getState().setAgentIdentity({
              name: (identity.name as string) || (identity.displayName as string) || 'Assistant',
              persona: (identity.persona as string) || undefined,
              emoji: (identity.emoji as string) || undefined,
            });
          }).catch(() => {}),
        ]);
        useSessionStore.getState().setSessions(sessions);
        // Auto-select last session from prefs, or fall back to first
        const currentActive = useSessionStore.getState().activeSessionId;
        if (!currentActive && sessions.length > 0) {
          const savedKey = layoutPrefs?.lastSessionKey;
          const match = savedKey && sessions.find((s) => s.key === savedKey);
          useSessionStore.getState().setActiveSession(match ? savedKey! : sessions[0].key);
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
      <ChatView />
    </div>
  );
}
