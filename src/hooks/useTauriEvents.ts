import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isPermissionGranted, requestPermission, sendNotification, onAction } from '@tauri-apps/plugin-notification';
import { useConnectionStore } from '../store/connectionStore';
import { useChatStore } from '../store/chatStore';
import { useSessionStore, extractSessionId } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { sendMessage, listSessions } from '../lib/tauri';
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

async function maybeNotify(content: string) {
  try {
    if (!useSettingsStore.getState().notifyOnMessage) return;
    if (await getCurrentWindow().isFocused()) return;

    let permitted = await isPermissionGranted();
    if (!permitted) {
      const result = await requestPermission();
      permitted = result === 'granted';
    }
    if (!permitted) return;

    const { agentIdentity } = useSessionStore.getState();
    const title = agentIdentity?.name || 'DeskClaw';
    const body = content.length > 200 ? content.slice(0, 200) + '...' : content;

    sendNotification({ title, body });
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

export function useTauriEvents() {
  const setPhase = useConnectionStore((s) => s.setPhase);
  const addMessage = useChatStore((s) => s.addMessage);
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
        console.log('[deskclaw] new-message event:', JSON.stringify(data).slice(0, 1000));

        const sessionId = extractSessionId(data);
        const msg = data.message as Record<string, unknown> | undefined;

        if (!sessionId) {
          console.warn('[deskclaw] new-message: no session identifier found in payload');
          return;
        }

        const state = data.state as string | undefined;
        const runId = data.runId as string | undefined;

        // Skip "delta" events — only process final/complete/error to avoid duplicates
        if (state && state !== 'final' && state !== 'complete' && state !== 'error') {
          return;
        }

        // For error states, extract errorMessage as content
        const errorMsg = (data.errorMessage as string) || (msg?.errorMessage as string) || '';

        const content = errorMsg || (msg
          ? (extractContent(msg.content) || (msg.text as string) || '')
          : (extractContent(data.content) || (data.text as string) || ''));
        if (!content) {
          if (!msg) console.warn('[deskclaw] new-message: no content found in payload');
          return;
        }

        const ts = msg
          ? toTimestamp(msg.timestamp || msg.ts)
          : toTimestamp(data.timestamp || data.ts);
        const role = ((msg?.role || data.role) as 'user' | 'assistant' | 'system' | 'tool') || 'assistant';
        const msgType = (msg?.type || msg?.messageType || data.type || data.messageType) as string | undefined;

        // Auto-retry: when the agent responds with raw tool_code (e.g. image analysis),
        // show a friendly placeholder and send a follow-up to get the actual result.
        if (role === 'assistant' && content.trimStart().startsWith('tool_code')) {
          console.log('[deskclaw] tool_code detected, auto-retrying for result');
          addMessage(sessionId, {
            id: (msg?.id as string) || (data.id as string) || runId || crypto.randomUUID(),
            role: 'assistant',
            content: '*Analyzing image...*',
            timestamp: ts,
            session_id: sessionId,
          });
          sendMessage(sessionId, 'describe what you found').catch((err) => {
            console.error('[deskclaw] auto-retry after tool_code failed:', err);
          });
          return;
        }

        addMessage(sessionId, {
          id: (msg?.id as string) || (data.id as string) || runId || crypto.randomUUID(),
          role: state === 'error' ? 'system' : role,
          content: state === 'error' ? `**Error:** ${content}` : content,
          timestamp: ts,
          session_id: sessionId,
          message_type: msgType || undefined,
        });

        if (role === 'assistant' && state !== 'error') {
          maybeNotify(content);
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

        console.log('[deskclaw] agent-update:', stream, 'phase:', phase, 'runId:', runId, 'session:', sessionId);

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

      // Bring window to foreground when user clicks a notification
      const u5 = await onAction(async () => {
        try {
          const win = getCurrentWindow();
          await win.unminimize();
          await win.show();
          await win.setFocus();
        } catch (err) {
          console.warn('[deskclaw] notification action focus failed:', err);
        }
      });
      if (cancelled) { u5.unregister(); return; }
      unlisteners.push(() => u5.unregister());
    })();

    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, [setPhase, addMessage, addRun, removeRun, setAgentPhase, updateSession]);
}
