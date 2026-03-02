import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';
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

  // Restore window size/position from account layout prefs on mount
  useEffect(() => {
    if (!layoutPrefs) return;
    const w = getCurrentWindow();
    const { windowWidth, windowHeight, windowX, windowY } = layoutPrefs;
    if (windowWidth && windowHeight) {
      w.setSize(new PhysicalSize(windowWidth, windowHeight)).catch(() => {});
    }
    if (windowX != null && windowY != null) {
      w.setPosition(new PhysicalPosition(windowX, windowY)).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Track window resize/move and save to account (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!activeAccountId) return;
    const w = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    const saveWindowState = async () => {
      try {
        const size = await w.innerSize();
        const pos = await w.outerPosition();
        updateAccountLayout(activeAccountId, {
          windowWidth: size.width,
          windowHeight: size.height,
          windowX: pos.x,
          windowY: pos.y,
        });
      } catch { /* window may be closing */ }
    };

    const debouncedSave = () => {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(saveWindowState, 500);
    };

    // Listen for both resize and move events
    Promise.all([
      w.onResized(debouncedSave),
      w.onMoved(debouncedSave),
    ]).then(([unlistenResize, unlistenMove]) => {
      unlisten = () => { unlistenResize(); unlistenMove(); };
    });

    return () => {
      clearTimeout(saveTimerRef.current);
      unlisten?.();
    };
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
