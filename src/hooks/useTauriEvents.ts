import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { onAction } from '@tauri-apps/plugin-notification';
import { useConnectionStore } from '../store/connectionStore';
import { useChatStore } from '../store/chatStore';
import { useSessionStore, extractSessionId } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { listSessions, sendNativeNotification } from '../lib/tauri';
import type { ConnectionPhase, SessionInfo } from '../lib/types';

// Convert timestamp (can be number ms, string, or missing)
function toTimestamp(raw: unknown): string {
  if (typeof raw === 'number') return new Date(raw).toISOString();
  if (typeof raw === 'string') return raw;
  return new Date().toISOString();
}

// Extract text content — handles both string and array-of-{type,text} formats
function extractContent(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw
      .filter((item: Record<string, unknown>) => item.type === 'text' && item.text)
      .map((item: Record<string, unknown>) => item.text as string)
      .join('\n');
  }
  return '';
}

async function maybeNotify(content: string, sessionId?: string) {
  try {
    if (!useSettingsStore.getState().notifyOnMessage) return;
    if (await getCurrentWindow().isFocused()) return;

    const { agentIdentity } = useSessionStore.getState();
    const title = agentIdentity?.name || 'DeskClaw';
    const body = content.length > 200 ? content.slice(0, 200) + '...' : content;

    // Native command (not the plugin) so the toast is attributed to our
    // registered app identity instead of "Windows PowerShell".
    await sendNativeNotification(title, body, sessionId);
  } catch (err) {
    console.warn('[deskclaw] notification failed:', err);
  }
}

// Debounce helper: returns a function that delays calling fn until after ms of inactivity
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as unknown as T;
}

/** Streaming message ids are derived from the run id so deltas and the final
 *  message for the same run land on the same bubble. */
const streamId = (runId: string) => `stream-${runId}`;

export function useTauriEvents() {
  const setPhase = useConnectionStore((s) => s.setPhase);
  const addMessage = useChatStore((s) => s.addMessage);
  const applyDelta = useChatStore((s) => s.applyDelta);
  const finalizeStream = useChatStore((s) => s.finalizeStream);
  const addRun = useChatStore((s) => s.addRun);
  const removeRun = useChatStore((s) => s.removeRun);
  const setAgentPhase = useChatStore((s) => s.setAgentPhase);
  const updateSession = useSessionStore((s) => s.updateSession);

  // Debounce token refresh to avoid flooding after rapid agent runs
  const debouncedRefreshRef = useRef(
    debounce((sessionId: string) => {
      listSessions().then((sessions: SessionInfo[]) => {
        const match = sessions.find((s) => s.id === sessionId || s.key === sessionId);
        if (match) {
          useSessionStore.getState().updateSession(sessionId, {
            total_tokens: match.total_tokens,
            context_tokens: match.context_tokens,
            context_window: match.context_window,
          });
        }
      }).catch(() => {});
    }, 2000)
  );

  // Debounced full session list refresh for sessions.changed broadcasts
  const debouncedListRefreshRef = useRef(
    debounce(() => {
      listSessions()
        .then((sessions: SessionInfo[]) => {
          useSessionStore.getState().setSessions(sessions);
        })
        .catch(() => {});
    }, 1000)
  );

  useEffect(() => {
    let cancelled = false;
    const unlisteners: (() => void)[] = [];

    (async () => {
      const u1 = await listen<ConnectionPhase>('connection-status', (event) => {
        setPhase(event.payload);
      });
      if (cancelled) { u1(); return; }
      unlisteners.push(u1);

      const u2 = await listen<Record<string, unknown>>('new-message', (event) => {
        const data = event.payload;

        const sessionId = extractSessionId(data);
        const msg = data.message as Record<string, unknown> | undefined;

        if (!sessionId) {
          console.warn('[deskclaw] new-message: no session identifier found in payload');
          return;
        }

        const state = data.state as string | undefined;
        const runId = data.runId as string | undefined;

        // Protocol v4 streaming: deltas carry the incremental text in
        // deltaText; replace=true means deltaText is the full replacement
        // (non-prefix rewrite), not an append.
        if (state === 'delta') {
          if (!runId) return;
          const deltaText = (data.deltaText as string) ?? '';
          const replace = data.replace === true;
          if (deltaText || replace) {
            applyDelta(sessionId, streamId(runId), deltaText, replace);
          }
          return;
        }

        if (state && state !== 'final' && state !== 'complete' && state !== 'error') {
          return;
        }

        // For error states, extract errorMessage as content
        const errorMsg = (data.errorMessage as string) || (msg?.errorMessage as string) || '';

        const content = errorMsg || (msg
          ? (extractContent(msg.content) || (msg.text as string) || '')
          : (extractContent(data.content) || (data.text as string) || ''));
        if (!content) {
          // A final frame with no content still ends any stream for this run
          if (runId) finalizeStream(sessionId, streamId(runId), null);
          return;
        }

        const ts = msg
          ? toTimestamp(msg.timestamp || msg.ts)
          : toTimestamp(data.timestamp || data.ts);
        const role = ((msg?.role || data.role) as 'user' | 'assistant' | 'system' | 'tool') || 'assistant';
        const msgType = (msg?.type || msg?.messageType || data.type || data.messageType) as string | undefined;

        const finalMessage = {
          id: (msg?.id as string) || (data.id as string) || runId || crypto.randomUUID(),
          role: state === 'error' ? 'system' as const : role,
          content: state === 'error' ? `**Error:** ${content}` : content,
          timestamp: ts,
          session_id: sessionId,
          message_type: msgType || undefined,
        };

        // Replace the streaming bubble (if any) with the final message
        if (runId) {
          finalizeStream(sessionId, streamId(runId), finalMessage);
        } else {
          addMessage(sessionId, finalMessage);
        }

        if (role === 'assistant' && state !== 'error') {
          maybeNotify(content, sessionId);
        }

        // Error state means the run is done — clear typing indicator
        if (state === 'error' && runId) {
          removeRun(sessionId, runId);
        }
      });
      if (cancelled) { u2(); return; }
      unlisteners.push(u2);

      // Agent events: lifecycle for typing indicator + assistant stream for messages
      const u3 = await listen<Record<string, unknown>>('agent-update', (event) => {
        const data = event.payload;
        const sessionId = extractSessionId(data);
        const stream = data.stream as string | undefined;
        const runId = data.runId as string | undefined;
        const agentData = data.data as Record<string, unknown> | undefined;
        const phase = agentData?.phase as string | undefined;

        if (!sessionId) return;

        // Lifecycle events: phase "start" / "end" / "error" — source of truth for typing indicator
        if (stream === 'lifecycle') {
          if (!runId) return;
          if (phase === 'start') {
            addRun(sessionId, runId);
            setAgentPhase(sessionId, 'thinking');
          } else if (phase === 'end' || phase === 'error') {
            removeRun(sessionId, runId);
            setAgentPhase(sessionId, null);
            // Drop any unfinished streaming bubble for this run; the final
            // chat frame (when there is one) has already replaced it.
            const messages = useChatStore.getState().messages[sessionId] || [];
            const pending = messages.find((m) => m.id === streamId(runId) && m.streaming);
            if (pending) {
              finalizeStream(sessionId, streamId(runId), { ...pending, streaming: undefined });
            }
            // Debounced token count refresh
            debouncedRefreshRef.current(sessionId);
          }
        }

        // Compaction events: stream "compaction" with phase "start" / "end"
        if (stream === 'compaction') {
          if (phase === 'start') {
            setAgentPhase(sessionId, 'compacting');
          } else if (phase === 'end') {
            setAgentPhase(sessionId, useChatStore.getState().isTyping(sessionId) ? 'thinking' : null);
          }
        }

      });
      if (cancelled) { u3(); return; }
      unlisteners.push(u3);

      // Session updates — keep token counts in sync
      const u4 = await listen<Record<string, unknown>>('session-update', (event) => {
        const data = event.payload;
        const sessionId = extractSessionId(data);
        if (!sessionId) return;

        const update: Record<string, unknown> = {};
        if (data.totalTokens != null) update.total_tokens = data.totalTokens as number;
        if (data.contextTokens != null) update.context_tokens = data.contextTokens as number;
        if (data.contextWindow != null) update.context_window = data.contextWindow as number;
        // Don't update model from session events — it can arrive stale from previous runs.
        // Model is managed by the dropdown (user action) and initial session load.

        if (Object.keys(update).length > 0) {
          updateSession(sessionId, update);
        }
      });
      if (cancelled) { u4(); return; }
      unlisteners.push(u4);

      // sessions.changed broadcasts — keep the sidebar list live
      const u5 = await listen<Record<string, unknown>>('sessions-changed', () => {
        debouncedListRefreshRef.current();
      });
      if (cancelled) { u5(); return; }
      unlisteners.push(u5);

      // Toast clicks: backend focuses the window and tells us which session
      // the message belonged to — switch the chat view to it.
      const u5b = await listen<string>('notification-clicked', (event) => {
        const sessionKey = event.payload;
        if (sessionKey) {
          useSessionStore.getState().setActiveSession(sessionKey);
        }
      });
      if (cancelled) { u5b(); return; }
      unlisteners.push(u5b);

      // Bring window to foreground when user clicks a notification
      const u6 = await onAction(async () => {
        try {
          const win = getCurrentWindow();
          await win.unminimize();
          await win.show();
          await win.setFocus();
        } catch (err) {
          console.warn('[deskclaw] notification action focus failed:', err);
        }
      });
      if (cancelled) { u6.unregister(); return; }
      unlisteners.push(() => u6.unregister());
    })();

    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, [setPhase, addMessage, applyDelta, finalizeStream, addRun, removeRun, setAgentPhase, updateSession]);
}
