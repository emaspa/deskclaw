import { useEffect, useState } from 'react';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';
import { ChatView } from '../chat/ChatView';
import { useSessionStore } from '../../store/sessionStore';

export function AppShell() {
  const sessionCount = useSessionStore((s) => s.sessions.length);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    console.log('[deskclaw] AppShell mounted, sessions:', sessionCount);
  }, [sessionCount]);

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
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((c) => !c)} />
      <ChatView />
    </div>
  );
}
