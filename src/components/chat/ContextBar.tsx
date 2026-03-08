import { useEffect, useState, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { useSessionStore } from '../../store/sessionStore';
import { listModels, setModel } from '../../lib/tauri';

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  reasoning?: boolean;
}

export function ContextBar() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const updateSession = useSessionStore((s) => s.updateSession);
  const session = useSessionStore((s) => {
    if (!s.activeSessionId) return null;
    return s.findSession(s.activeSessionId) ?? null;
  });

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch models when a session is active (connection is established)
  useEffect(() => {
    if (!activeSessionId) return;
    listModels()
      .then((result) => {
        const raw = ((result as Record<string, unknown>).models || result) as Record<string, unknown>[];
        if (!Array.isArray(raw)) return;
        setModels(raw.map((m) => ({
          id: (m.id as string) || '',
          name: (m.name as string) || (m.id as string) || '',
          provider: (m.provider as string) || '',
          reasoning: m.reasoning as boolean | undefined,
        })));
      })
      .catch((e) => console.warn('[deskclaw] models.list failed:', e));
  }, [activeSessionId]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleSelect = async (model: ModelInfo) => {
    if (!activeSessionId) return;
    setOpen(false);
    setSwitching(true);
    const qualifiedId = model.provider && model.provider !== 'default'
      ? `${model.provider}/${model.id}`
      : model.id;
    try {
      await setModel(activeSessionId, qualifiedId);
      // Update the session store immediately so the UI reflects the change
      updateSession(activeSessionId, { model: qualifiedId, model_provider: model.provider });
    } catch (e) {
      console.error('[deskclaw] set_model error:', e);
    } finally {
      setSwitching(false);
    }
  };

  if (!session) return null;

  const totalTokens = session.total_tokens || 0;
  const model = session.model || 'Unknown model';

  // Find the currently active model in the list for highlighting, display name, and context window
  const currentModelId = session.model || '';
  const matchedModel = models.find((m) => {
    const qualifiedId = m.provider && m.provider !== 'default'
      ? `${m.provider}/${m.id}`
      : m.id;
    return currentModelId === qualifiedId
      || currentModelId === m.id
      || currentModelId === m.name
      // Match when session stores "provider/id" but we compare to bare id, or vice versa
      || currentModelId.endsWith(`/${m.id}`)
      || qualifiedId.endsWith(`/${currentModelId}`);
  });
  const displayModelName = matchedModel?.name || model;

  // OpenClaw standardizes context window to 200k for all models — use the gateway value
  const contextWindow = session.context_window || session.context_tokens || 0;
  const pct = contextWindow ? Math.min((totalTokens / contextWindow) * 100, 100) : 0;

  // Smooth green → yellow → red
  const barColor = pct >= 85
    ? '#ff5252'
    : pct >= 60
      ? '#ffab00'
      : '#00c853';

  return (
    <div style={barStyle}>
      {/* Model selector dropdown */}
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          onClick={() => models.length > 0 && setOpen(!open)}
          disabled={switching}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            background: 'transparent',
            border: 'none',
            padding: '2px 4px',
            color: 'var(--text-secondary)',
            fontSize: 'var(--font-xs)',
            fontWeight: 500,
            cursor: models.length > 0 ? 'pointer' : 'default',
            fontFamily: 'inherit',
            borderRadius: 'var(--radius-sm)',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => { if (models.length > 0) e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
            {switching ? 'Switching...' : displayModelName}
          </span>
          {models.length > 0 && <ChevronDown size={11} style={{ opacity: 0.5, flexShrink: 0 }} />}
        </button>

        {open && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              minWidth: 300,
              maxHeight: 320,
              overflowY: 'auto',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 100,
              padding: '4px',
            }}
          >
            {models.map((m) => {
              const qualifiedId = m.provider && m.provider !== 'default'
                ? `${m.provider}/${m.id}`
                : m.id;
              const isActive = currentModelId === qualifiedId || currentModelId === m.id || currentModelId === m.name || currentModelId.endsWith(`/${m.id}`) || qualifiedId.endsWith(`/${currentModelId}`);
              return (
                <button
                  key={m.id}
                  onClick={() => handleSelect(m)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    padding: '8px 10px',
                    background: isActive ? 'rgba(108, 92, 231, 0.15)' : 'transparent',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: 'var(--font-sm)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
                    <span style={{
                      fontWeight: isActive ? 600 : 400,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {m.name}
                    </span>
                    <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                      {m.provider}{m.reasoning ? ' · reasoning' : ''}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Token usage progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, justifyContent: 'flex-end' }}>
        <span style={valueStyle}>
          {formatTokens(totalTokens)}{contextWindow ? ` / ${formatTokens(contextWindow)}` : ' tokens'}
        </span>
        {contextWindow > 0 && (
          <>
            <div
              style={{
                width: '120px',
                height: '6px',
                background: 'rgba(255, 255, 255, 0.06)',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: barColor,
                  borderRadius: '3px',
                  transition: 'width 0.4s ease, background 0.4s ease',
                }}
              />
            </div>
            <span style={{ ...valueStyle, color: barColor, minWidth: '36px', textAlign: 'right', fontWeight: 500 }}>
              {Math.round(pct)}%
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const barStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '6px 20px',
  borderBottom: '1px solid var(--glass-border)',
  fontSize: 'var(--font-xs)',
  flexShrink: 0,
};

const valueStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
};
