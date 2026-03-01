import { useEffect } from 'react';
import { useTauriEvents } from './hooks/useTauriEvents';
import { useConnectionStore } from './store/connectionStore';
import { ConnectionScreen } from './components/connection/ConnectionScreen';
import { AppShell } from './components/layout/AppShell';

export function App() {
  useTauriEvents();
  const phase = useConnectionStore((s) => s.phase);
  const isConnected = phase === 'Connected';

  useEffect(() => {
    console.log('[deskclaw] phase changed:', phase, 'isConnected:', isConnected);
  }, [phase, isConnected]);

  return isConnected ? <AppShell /> : <ConnectionScreen />;
}
