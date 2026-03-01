import { useState, useRef, useEffect } from 'react';
import { Smile } from 'lucide-react';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

const EMOJI_CATEGORIES: Record<string, string[]> = {
  'Smileys': [
    '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉',
    '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😋', '😛', '😜',
    '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🫡', '🤐', '🤨',
    '😐', '😑', '😶', '🫥', '😏', '😒', '🙄', '😬', '😮‍💨', '🤥',
    '🫠', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢',
    '🤮', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎',
    '🤓', '🧐', '😕', '🫤', '😟', '🙁', '😮', '😯', '😲', '😳',
    '🥺', '🥹', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱',
    '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠',
  ],
  'Gestures': [
    '👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '🫳', '🫴', '👌',
    '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉',
    '👆', '🖕', '👇', '☝️', '🫵', '👍', '👎', '✊', '👊', '🤛',
    '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '💪', '🦾',
  ],
  'Hearts': [
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
    '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝',
    '💟', '♥️', '🫶',
  ],
  'Objects': [
    '🔥', '✨', '🌟', '💫', '⚡', '🎉', '🎊', '🎯', '🏆', '🥇',
    '🎮', '🎵', '🎶', '💡', '📌', '📎', '✏️', '📝', '💻', '🖥️',
    '⌨️', '🔑', '🔒', '🔓', '🛠️', '⚙️', '🧪', '🔬', '📊', '📈',
    '💰', '💎', '🪙', '☕', '🍕', '🍔', '🍺', '🍷', '🥂', '🍰',
  ],
  'Symbols': [
    '✅', '❌', '⭕', '❓', '❗', '‼️', '⁉️', '💯', '🔴', '🟠',
    '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '▶️', '⏸️', '⏹️',
    '🔄', '🔀', '↩️', '↪️', '⬆️', '⬇️', '➡️', '⬅️', '🔝', '🆕',
    '🆒', '🆗', '🆙', '🔜', '🏁', '🚀', '💬', '🗨️', '👀', '🧠',
  ],
};

const CATEGORY_NAMES = Object.keys(EMOJI_CATEGORIES);

export function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(CATEGORY_NAMES[0]);
  const [search, setSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const allEmojis = search
    ? Object.values(EMOJI_CATEGORIES).flat()
    : EMOJI_CATEGORIES[activeCategory] || [];

  return (
    <div ref={pickerRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'transparent',
          border: 'none',
          color: open ? 'var(--accent-primary)' : 'var(--text-muted)',
          cursor: 'pointer',
          padding: '8px',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          transition: 'color 0.15s',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.color = 'var(--text-secondary)';
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.color = 'var(--text-muted)';
        }}
      >
        <Smile size={18} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 8,
            width: 320,
            maxHeight: 360,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 100,
          }}
        >
          {/* Search */}
          <div style={{ padding: '8px 8px 4px' }}>
            <input
              type="text"
              placeholder="Search isn't implemented yet..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 10px',
                color: 'var(--text-primary)',
                fontSize: 'var(--font-sm)',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Category tabs */}
          {!search && (
            <div
              style={{
                display: 'flex',
                gap: '2px',
                padding: '4px 8px',
                borderBottom: '1px solid var(--glass-border)',
                overflowX: 'auto',
              }}
            >
              {CATEGORY_NAMES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  style={{
                    background: cat === activeCategory ? 'rgba(108, 92, 231, 0.2)' : 'transparent',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    padding: '4px 8px',
                    color: cat === activeCategory ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: 'var(--font-xs)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    fontFamily: 'inherit',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Emoji grid */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px',
              display: 'grid',
              gridTemplateColumns: 'repeat(8, 1fr)',
              gap: '2px',
            }}
          >
            {allEmojis.map((emoji, i) => (
              <button
                key={`${emoji}-${i}`}
                onClick={() => {
                  onSelect(emoji);
                  setOpen(false);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '4px',
                  fontSize: '20px',
                  cursor: 'pointer',
                  lineHeight: 1,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
