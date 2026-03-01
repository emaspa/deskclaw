import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { AgentStatus } from './AgentStatus';
import { ContextBar } from './ContextBar';

export function ChatView() {
  return (
    <div
      style={{
        gridArea: 'content',
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
