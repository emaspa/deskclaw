import { useEffect, useRef, useState } from 'react';
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Scroll to bottom when messages are added or content is updated (e.g. attachment embed)
  const scrollVersion = useChatStore((s) => s.scrollVersion);
  useEffect(() => {
    const timer = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' });
    }, 100);
    return () => clearTimeout(timer);
  }, [scrollVersion]);


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
    <div
      ref={containerRef}
      data-chat-scroll
      style={{
        flex: 1,
        overflowY: 'auto',
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
  );
}
