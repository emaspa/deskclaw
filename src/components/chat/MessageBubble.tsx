import { useState, useEffect } from 'react';
import { Bot, User, Terminal, Info, FileText } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSessionStore } from '../../store/sessionStore';
import { useSettingsStore } from '../../store/settingsStore';
import { downloadRemoteFile } from '../../lib/tauri';
import type { ChatMessage } from '../../lib/types';

interface MessageBubbleProps {
  message: ChatMessage;
}

const roleConfig = {
  user: {
    icon: User,
    align: 'flex-end' as const,
    bg: 'rgba(108, 92, 231, 0.15)',
    border: 'rgba(108, 92, 231, 0.25)',
    iconColor: 'var(--accent-primary)',
  },
  assistant: {
    icon: Bot,
    align: 'flex-start' as const,
    bg: 'var(--glass-bg)',
    border: 'var(--glass-border)',
    iconColor: 'var(--accent-secondary)',
  },
  system: {
    icon: Info,
    align: 'center' as const,
    bg: 'rgba(255, 171, 0, 0.08)',
    border: 'rgba(255, 171, 0, 0.15)',
    iconColor: 'var(--accent-warning)',
  },
  tool: {
    icon: Terminal,
    align: 'flex-start' as const,
    bg: 'rgba(0, 200, 83, 0.08)',
    border: 'rgba(0, 200, 83, 0.15)',
    iconColor: 'var(--accent-success)',
  },
};

function formatTime(ts: string): string {
  if (!ts) return '';
  const num = Number(ts);
  const date = isNaN(num) ? new Date(ts) : new Date(num);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Regex to detect .deskclaw/media/ paths or tunneled media URLs in message content
const DESKCLAW_MEDIA_RE = /(\/[^\s]+\/\.deskclaw\/media\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|bmp|mp3|ogg|wav|m4a|mp4|pdf|doc|docx|txt))/gi;
const MEDIA_URL_RE = /(https?:\/\/127\.0\.0\.1:\d+\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|bmp|mp3|ogg|wav|m4a|mp4|webm|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|json|xml|zip|rar|7z))/gi;

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);
const AUDIO_EXTS = new Set(['mp3', 'ogg', 'wav', 'm4a', 'webm']);

function getExt(path: string): string {
  return path.split('.').pop()?.toLowerCase() || '';
}

/** Renders an inline image or audio for a tunneled HTTP URL or remote path */
function RemoteMedia({ url }: { url: string }) {
  const [error, setError] = useState(false);
  const ext = getExt(url);
  const isImage = IMAGE_EXTS.has(ext);
  const isAudio = AUDIO_EXTS.has(ext);
  const fileName = url.split('/').pop() || url;

  // For HTTP URLs, use them directly. For file paths, fall back to download.
  const isHttp = url.startsWith('http');

  // When HTTP URL fails (e.g. port changed after reconnect), fall back to SSH download
  if (error && isHttp && fileName) {
    return <RemoteMediaFallback path={`~/.deskclaw/media/${fileName}`} />;
  }

  if (isImage) {
    if (isHttp) {
      return (
        <img
          src={url}
          alt={fileName}
          onError={() => setError(true)}
          onLoad={(e) => {
            // Scroll the chat container so the loaded image is visible
            const container = (e.target as HTMLElement).closest('[data-chat-scroll]');
            if (container) container.scrollTop = container.scrollHeight;
          }}
          style={{
            maxWidth: '100%',
            maxHeight: 300,
            borderRadius: 'var(--radius-md)',
            marginTop: 4,
            cursor: 'pointer',
          }}
          onClick={() => window.open(url, '_blank')}
        />
      );
    }
    // Fallback for file paths: use downloadRemoteFile
    return <RemoteMediaFallback path={url} />;
  }

  if (isAudio) {
    if (isHttp) return <audio controls src={url} style={{ maxWidth: '100%', marginTop: 4 }} onError={() => setError(true)} />;
    return <RemoteMediaFallback path={url} />;
  }

  // Document / generic file chip
  const label = ext.toUpperCase();
  return (
    <a
      href={isHttp ? url : undefined}
      target="_blank"
      rel="noopener noreferrer"
      onClick={isHttp ? undefined : (e) => e.preventDefault()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: 'rgba(108, 92, 231, 0.08)',
        border: '1px solid rgba(108, 92, 231, 0.2)',
        borderRadius: 'var(--radius-md)',
        fontSize: 'var(--font-sm)',
        color: 'var(--text-primary)',
        marginTop: 4,
        textDecoration: 'none',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(108, 92, 231, 0.15)';
        e.currentTarget.style.borderColor = 'rgba(108, 92, 231, 0.35)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(108, 92, 231, 0.08)';
        e.currentTarget.style.borderColor = 'rgba(108, 92, 231, 0.2)';
      }}
    >
      <FileText size={18} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
        {fileName}
      </span>
      <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>
        {label}
      </span>
    </a>
  );
}

/** Fallback: download file content via SSH for non-HTTP paths */
function RemoteMediaFallback({ path }: { path: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const ext = getExt(path);
  const isImage = IMAGE_EXTS.has(ext);
  const fileName = path.split('/').pop() || path;

  useEffect(() => {
    let cancelled = false;
    downloadRemoteFile(path)
      .then((b64) => {
        if (cancelled) return;
        const mime = isImage
          ? `image/${ext === 'jpg' ? 'jpeg' : ext}`
          : `audio/${ext === 'm4a' ? 'mp4' : ext}`;
        setDataUrl(`data:${mime};base64,${b64}`);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path, isImage, ext]);

  if (loading) return <div style={{ padding: '8px', color: 'var(--text-muted)', fontSize: 'var(--font-xs)' }}>Loading...</div>;
  if (error || !dataUrl) return <div style={{ padding: '4px', color: 'var(--accent-danger)', fontSize: 'var(--font-xs)' }}>Failed to load</div>;
  if (isImage) {
    return (
      <img
        src={dataUrl}
        alt={fileName}
        onLoad={(e) => {
          const container = (e.target as HTMLElement).closest('[data-chat-scroll]');
          if (container) container.scrollTop = container.scrollHeight;
        }}
        style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 'var(--radius-md)', marginTop: 4, cursor: 'pointer' }}
        onClick={() => window.open(dataUrl, '_blank')}
      />
    );
  }
  return <audio controls src={dataUrl} style={{ maxWidth: '100%', marginTop: 4 }} />;
}

/** Renders message text with inline media for any .deskclaw/media/ paths or tunneled URLs */
function MessageContent({ content }: { content: string }) {
  const { text, urls } = parseMediaRefs(content);
  return (
    <div>
      {text && (
        <div className="markdown-body">
          <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
        </div>
      )}
      {urls.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {urls.map((u) => <RemoteMedia key={u} url={u} />)}
        </div>
      )}
    </div>
  );
}

/** Splits message content into text and media references (URLs or paths) */
function parseMediaRefs(content: string): { text: string; urls: string[] } {
  const urls: string[] = [];
  // First extract HTTP media URLs
  let text = content.replace(MEDIA_URL_RE, (match) => {
    urls.push(match.trim());
    return '';
  });
  // Then extract file paths (fallback for old-style messages)
  text = text.replace(DESKCLAW_MEDIA_RE, (match) => {
    urls.push(match.trim());
    return '';
  });
  return { text: text.trim(), urls };
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const config = roleConfig[message.role] || roleConfig.assistant;
  const Icon = config.icon;
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isSystem = message.role === 'system';
  const agentIdentity = useSessionStore((s) => s.agentIdentity);
  // Return the stable account object reference — do NOT create a new object in the selector
  const activeAccount = useSettingsStore((s) =>
    s.activeAccountId ? s.accounts.find((a) => a.id === s.activeAccountId) ?? null : null
  );

  const agentLabel = isAssistant
    ? (agentIdentity?.emoji ? `${agentIdentity.emoji} ` : '') + (agentIdentity?.name || '')
    : '';
  const userLabel = isUser ? (activeAccount?.nickname || '') : '';

  return (
    <div
      className="animate-message-in"
      style={{
        display: 'flex',
        justifyContent: config.align,
        padding: '2px 0',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: '10px',
          maxWidth: isSystem ? '90%' : '75%',
          flexDirection: isUser ? 'row-reverse' : 'row',
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: config.bg,
            border: `1px solid ${config.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          {isUser && activeAccount?.avatar ? (
            <img src={activeAccount.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : isAssistant && agentIdentity?.emoji ? (
            <span style={{ fontSize: 14, lineHeight: 1 }}>{agentIdentity.emoji}</span>
          ) : (
            <Icon size={14} style={{ color: config.iconColor }} />
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
          {agentLabel && (
            <span
              style={{
                fontSize: 'var(--font-xs)',
                fontWeight: 600,
                color: 'var(--accent-secondary)',
              }}
            >
              {agentLabel}
            </span>
          )}
          {userLabel && (
            <span
              style={{
                fontSize: 'var(--font-xs)',
                fontWeight: 600,
                color: 'var(--accent-primary)',
              }}
            >
              {userLabel}
            </span>
          )}
          <div
            style={{
              background: config.bg,
              border: `1px solid ${config.border}`,
              borderRadius: 'var(--radius-lg)',
              padding: '10px 14px',
              fontSize: 'var(--font-base)',
              lineHeight: 1.6,
              wordBreak: 'break-word',
            }}
          >
            <MessageContent content={message.content} />
            <div
              style={{
                fontSize: 'var(--font-xs)',
                color: 'var(--text-muted)',
                marginTop: '4px',
                textAlign: isUser ? 'right' : 'left',
              }}
            >
              {formatTime(message.timestamp)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
