import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { AgentStatus } from './AgentStatus';
import { ContextBar } from './ContextBar';

export function ChatView() {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg-base)',
      }}
    >
      <ContextBar />
      <MessageList />
      <AgentStatus />
      <MessageInput />
    </div>
  );
}
