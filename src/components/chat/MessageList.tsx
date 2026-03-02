import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useSessionStore } from '../../store/sessionStore';
import { getHistory } from '../../lib/tauri';
import { MessageBubble } from './MessageBubble';
import { Spinner } from '../ui/Spinner';
import type { ChatMessage } from '../../lib/types';

const EMPTY_MESSAGES: ChatMessage[] = [];

export function MessageList() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const messagesMap = useChatStore((s) => s.messages);
  const messages = activeSessionId ? (messagesMap[activeSessionId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES;
  const setMessages = useChatStore((s) => s.setMessages);
  const [loading, setLoading] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);

  const checkNearBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 120;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    isNearBottom.current = near;
    setShowJump(!near);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkNearBottom, { passive: true });
    return () => el.removeEventListener('scroll', checkNearBottom);
  }, [checkNearBottom]);

  useEffect(() => {
    if (!activeSessionId) return;

    const fetchHistory = async () => {
      setLoading(true);
      try {
        const history = await getHistory(activeSessionId);
        console.log('[deskclaw] history for', activeSessionId, ':', history.length, 'messages');
        setMessages(activeSessionId, history);
      } catch (e) {
        console.error('[deskclaw] history fetch error:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [activeSessionId, setMessages]);

  // Scroll to bottom when messages are added or content is updated — only if already near bottom
  const scrollVersion = useChatStore((s) => s.scrollVersion);
  useEffect(() => {
    if (!isNearBottom.current) return;
    const timer = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' });
    }, 100);
    return () => clearTimeout(timer);
  }, [scrollVersion]);

  const jumpToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  if (!activeSessionId) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          color: 'var(--text-secondary)',
          fontSize: 'var(--font-lg)',
        }}
      >
        <span style={{ fontSize: '32px' }}>💬</span>
        <span>Select a session to start chatting</span>
        <span style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
          Choose a session from the sidebar or create a new one
        </span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        ref={containerRef}
        data-chat-scroll
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
            <Spinner size={24} />
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} style={{ height: 24, flexShrink: 0 }} />
      </div>

      {showJump && (
        <button
          onClick={jumpToBottom}
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            background: 'rgba(108, 92, 231, 0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(108, 92, 231, 0.4)',
            borderRadius: '20px',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
            transition: 'opacity 0.2s, transform 0.2s',
            opacity: 1,
            zIndex: 10,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(108, 92, 231, 1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(108, 92, 231, 0.85)';
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          New messages
        </button>
      )}
    </div>
  );
}
