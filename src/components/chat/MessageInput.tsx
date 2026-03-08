import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Paperclip } from 'lucide-react';
import { useSessionStore } from '../../store/sessionStore';
import { useChatStore } from '../../store/chatStore';
import { sendMessage } from '../../lib/tauri';
import { EmojiPicker } from './EmojiPicker';
import { AttachmentPreview } from './AttachmentPreview';
import { VoiceRecorder } from './VoiceRecorder';
import type { Attachment } from '../../lib/types';

export function MessageInput() {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSendingRef = useRef(false);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const addMessage = useChatStore((s) => s.addMessage);
  const addRun = useChatStore((s) => s.addRun);
  const removeRun = useChatStore((s) => s.removeRun);
  const addPending = useChatStore((s) => s.addPending);
  // Derive agentBusy as a primitive boolean to avoid reference-change re-renders
  const agentBusy = useChatStore((s) => {
    if (!activeSessionId) return false;
    const runs = s.activeRuns[activeSessionId];
    return !!runs && runs.size > 0;
  });
  // Derive queue length as a primitive to avoid [] !== [] infinite re-renders
  const pendingCount = useChatStore((s) => {
    if (!activeSessionId) return 0;
    return (s.pendingQueue[activeSessionId] || []).length;
  });

  const updateMessageContent = useChatStore((s) => s.updateMessageContent);

  // Send a message to the backend
  const doSend = useCallback(async (sessionId: string, messageText: string, atts?: Attachment[]) => {
    // Show uploading status in local display (will be updated with real paths after send)
    let contentDisplay = messageText;
    if (atts && atts.length > 0) {
      const names = atts.map((a) => a.name).join(', ');
      contentDisplay = messageText
        ? `${messageText}\n[Uploading: ${names}]`
        : `[Uploading: ${names}]`;
    }

    const msgId = crypto.randomUUID();
    addMessage(sessionId, {
      id: msgId,
      role: 'user',
      content: contentDisplay,
      timestamp: new Date().toISOString(),
      session_id: sessionId,
    });

    const tempRunId = `pending-${crypto.randomUUID()}`;
    addRun(sessionId, tempRunId);

    try {
      const result = await sendMessage(sessionId, messageText, atts) as Record<string, unknown>;
      console.log('[deskclaw] chat.send result:', result);

      // Update local message with tunneled media URLs so RemoteMedia renders them inline
      const mediaUrls = result?.mediaUrls as string[] | undefined;
      if (mediaUrls && mediaUrls.length > 0) {
        const urlsText = mediaUrls.join('\n');
        updateMessageContent(sessionId, msgId,
          messageText ? `${messageText}\n${urlsText}` : urlsText
        );
      }

      removeRun(sessionId, tempRunId);
    } catch (err) {
      console.error('[deskclaw] chat.send error:', err);
      removeRun(sessionId, tempRunId);
    }
  }, [addMessage, updateMessageContent, addRun, removeRun]);

  // Auto-send queued messages when agent becomes idle
  useEffect(() => {
    if (agentBusy || !activeSessionId || autoSendingRef.current) return;
    // Access store directly to avoid selector reference issues
    const store = useChatStore.getState();
    const queue = store.pendingQueue[activeSessionId] || [];
    if (queue.length === 0) return;

    autoSendingRef.current = true;
    const next = store.shiftPending(activeSessionId);
    if (next) {
      doSend(activeSessionId, next.content).finally(() => {
        autoSendingRef.current = false;
      });
    } else {
      autoSendingRef.current = false;
    }
  }, [agentBusy, activeSessionId, doSend]);

  const handleSend = useCallback(() => {
    if ((!text.trim() && attachments.length === 0) || !activeSessionId) return;

    // When only attachments (no text), send empty — backend appends server-side file paths
    const messageText = text.trim();
    const currentAttachments = [...attachments];
    setText('');
    setAttachments([]);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    if (agentBusy) {
      // Queue the message for later — user can edit it (attachments not queued)
      addPending(activeSessionId, {
        id: crypto.randomUUID(),
        content: messageText,
        timestamp: new Date().toISOString(),
      });
    } else {
      doSend(activeSessionId, messageText, currentAttachments.length > 0 ? currentAttachments : undefined);
    }

    textareaRef.current?.focus();
  }, [text, attachments, activeSessionId, agentBusy, addPending, doSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFiles = (files: FileList) => {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // result is "data:mime;base64,DATA" — extract the base64 part
        const base64 = result.split(',')[1] || '';
        setAttachments((prev) => [...prev, {
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          data: base64,
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const insertEmoji = (emoji: string) => {
    const ta = textareaRef.current;
    if (ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newText = text.slice(0, start) + emoji + text.slice(end);
      setText(newText);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + emoji.length;
        ta.focus();
      });
    } else {
      setText(text + emoji);
    }
  };

  if (!activeSessionId) return null;

  return (
    <div
      style={{
        padding: '12px 20px 16px',
        borderTop: '1px solid var(--glass-border)',
      }}
    >
      {/* Pending queue items */}
      {pendingCount > 0 && (
        <PendingMessages sessionId={activeSessionId} />
      )}

      {/* Attachment preview */}
      <AttachmentPreview
        attachments={attachments}
        onRemove={(i) => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
      />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <div
        style={{
          display: 'flex',
          gap: '6px',
          alignItems: 'center',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '10px 14px',
          transition: 'border-color 0.2s',
        }}
      >
        {!isRecording && <EmojiPicker onSelect={insertEmoji} />}
        {!isRecording && (
          <button
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach file"
            title="Attach file"
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
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <Paperclip size={18} />
          </button>
        )}
        <VoiceRecorder
          onTranscribed={(text) => setText((prev) => prev ? `${prev} ${text}` : text)}
          onRecordingChange={setIsRecording}
        />
        {!isRecording && (
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const el = e.target;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 150) + 'px';
            }}
            onKeyDown={handleKeyDown}
            placeholder={agentBusy ? 'Type to queue a message...' : 'Send a message...'}
            rows={1}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: 'var(--font-md)',
              fontFamily: 'inherit',
              resize: 'none',
              lineHeight: 1.5,
              maxHeight: '150px',
            }}
          />
        )}
        {!isRecording && (
          <button
            onClick={handleSend}
            disabled={!text.trim() && attachments.length === 0}
            aria-label="Send message"
            style={{
              background: (text.trim() || attachments.length > 0) ? 'var(--accent-primary)' : 'transparent',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '8px',
              cursor: (text.trim() || attachments.length > 0) ? 'pointer' : 'default',
              color: (text.trim() || attachments.length > 0) ? '#fff' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              transition: 'all 0.2s ease',
              flexShrink: 0,
            }}
          >
            <Send size={18} />
          </button>
        )}
      </div>
      <div
        style={{
          fontSize: 'var(--font-xs)',
          color: 'var(--text-muted)',
          marginTop: '6px',
          textAlign: 'center',
        }}
      >
        Enter to send, Shift+Enter for new line
      </div>
    </div>
  );
}

// Inline editable pending messages above the input
function PendingMessages({ sessionId }: { sessionId: string }) {
  const pendingQueue = useChatStore((s) => s.pendingQueue[sessionId] || []);
  const updatePending = useChatStore((s) => s.updatePending);
  const removePending = useChatStore((s) => s.removePending);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
      <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', paddingLeft: '2px' }}>
        Queued {pendingQueue.length === 1 ? 'message' : `${pendingQueue.length} messages`} — click to edit
      </div>
      {pendingQueue.map((msg) => (
        <PendingItem
          key={msg.id}
          msg={msg}
          onUpdate={(content) => updatePending(sessionId, msg.id, content)}
          onRemove={() => removePending(sessionId, msg.id)}
        />
      ))}
    </div>
  );
}

function PendingItem({
  msg,
  onUpdate,
  onRemove,
}: {
  msg: { id: string; content: string };
  onUpdate: (content: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      onRemove();
    } else {
      onUpdate(trimmed);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div
        style={{
          display: 'flex',
          gap: '6px',
          alignItems: 'flex-start',
          background: 'rgba(108, 92, 231, 0.08)',
          border: '1px solid rgba(108, 92, 231, 0.25)',
          borderRadius: 'var(--radius-md)',
          padding: '8px 10px',
        }}
      >
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
            if (e.key === 'Escape') { setDraft(msg.content); setEditing(false); }
          }}
          rows={1}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: 'var(--font-sm)',
            fontFamily: 'inherit',
            resize: 'none',
            lineHeight: 1.5,
          }}
        />
        <button
          onClick={save}
          style={{
            background: 'var(--accent-primary)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 10px',
            color: '#fff',
            fontSize: 'var(--font-xs)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          }}
        >
          Save
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'rgba(108, 92, 231, 0.06)',
        border: '1px dashed rgba(108, 92, 231, 0.2)',
        borderRadius: 'var(--radius-md)',
        padding: '8px 10px',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(108, 92, 231, 0.4)';
        e.currentTarget.style.background = 'rgba(108, 92, 231, 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(108, 92, 231, 0.2)';
        e.currentTarget.style.background = 'rgba(108, 92, 231, 0.06)';
      }}
    >
      <span
        style={{
          fontSize: 'var(--font-xs)',
          color: 'var(--accent-primary)',
          fontWeight: 500,
          flexShrink: 0,
        }}
      >
        QUEUED
      </span>
      <span
        style={{
          flex: 1,
          fontSize: 'var(--font-sm)',
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {msg.content}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: 'var(--font-sm)',
          padding: '0 4px',
          lineHeight: 1,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-danger)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        ×
      </button>
    </div>
  );
}
