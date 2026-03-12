import { Square } from 'lucide-react';
import { useSessionStore } from '../../store/sessionStore';
import { useChatStore } from '../../store/chatStore';
import { cancelRun } from '../../lib/tauri';

const phaseLabels: Record<string, string> = {
  thinking: 'is thinking',
  compacting: 'is compacting conversation',
  summarizing: 'is summarizing',
  processing: 'is processing',
};

export function AgentStatus() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const agentIdentity = useSessionStore((s) => s.agentIdentity);
  const activeRuns = useChatStore((s) =>
    activeSessionId ? s.activeRuns[activeSessionId] : undefined
  );
  const clearRuns = useChatStore((s) => s.clearRuns);
  const phase = useChatStore((s) =>
    activeSessionId ? s.agentPhase[activeSessionId] : null
  );
  const isTyping = !!activeRuns && activeRuns.size > 0;

  if (!isTyping || !activeSessionId) return null;

  const name = agentIdentity?.name || 'Assistant';
  const emoji = agentIdentity?.emoji;
  const label = phaseLabels[phase || 'thinking'] || `is ${phase}`;

  const handleStop = () => {
    if (!activeRuns) return;
    for (const runId of activeRuns) {
      cancelRun(activeSessionId, runId).catch((err) =>
        console.error('[deskclaw] cancel_run error:', err)
      );
    }
    clearRuns(activeSessionId);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 20px',
        color: 'var(--text-secondary)',
        fontSize: 'var(--font-sm)',
      }}
    >
      <span style={{ display: 'inline-flex', gap: '3px' }}>
        <span style={dotStyle(0)} />
        <span style={dotStyle(1)} />
        <span style={dotStyle(2)} />
      </span>
      <span style={{ flex: 1 }}>{emoji ? `${emoji} ` : ''}{name} {label}...</span>
      <button
        onClick={handleStop}
        aria-label="Stop agent"
        title="Stop agent"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          padding: '4px',
          borderRadius: 'var(--radius-sm)',
          transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-danger)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        <Square size={14} fill="currentColor" />
      </button>
    </div>
  );
}

function dotStyle(index: number): React.CSSProperties {
  return {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--accent-primary)',
    animation: `typingDot 1.4s ease-in-out ${index * 0.2}s infinite`,
  };
}
