import { X, FileText, Image } from 'lucide-react';
import type { Attachment } from '../../lib/types';

interface Props {
  attachments: Attachment[];
  onRemove: (index: number) => void;
}

export function AttachmentPreview({ attachments, onRemove }: Props) {
  if (attachments.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
      {attachments.map((att, i) => {
        const isImage = att.mimeType.startsWith('image/');
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-md)',
              padding: '4px 8px',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-secondary)',
              maxWidth: '200px',
            }}
          >
            {isImage && att.data ? (
              <img
                src={`data:${att.mimeType};base64,${att.data}`}
                alt={att.name}
                style={{ width: 24, height: 24, borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }}
              />
            ) : isImage ? (
              <Image size={14} style={{ flexShrink: 0 }} />
            ) : (
              <FileText size={14} style={{ flexShrink: 0 }} />
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {att.name}
            </span>
            <button
              onClick={() => onRemove(i)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '0 2px',
                display: 'flex',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-danger)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
