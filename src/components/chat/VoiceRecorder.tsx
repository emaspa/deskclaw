import { useState, useRef, useEffect } from 'react';
import { Mic, Square } from 'lucide-react';
import type { Attachment } from '../../lib/types';

interface Props {
  onRecorded: (attachment: Attachment) => void;
}

export function VoiceRecorder({ onRecorded }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        recorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);

        const blob = new Blob(chunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1] || '';
          onRecorded({
            name: `voice-${Date.now()}.webm`,
            mimeType: mimeType.split(';')[0],
            data: base64,
          });
        };
        reader.readAsDataURL(blob);

        setSeconds(0);
        setRecording(false);
      };

      recorder.start(250); // collect chunks every 250ms
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);

      timerRef.current = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.error('[deskclaw] mic access denied:', err);
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (recording) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--accent-danger)',
            animation: 'pulse 1s ease-in-out infinite',
          }}
        />
        <span style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {formatTime(seconds)}
        </span>
        <button
          onClick={stopRecording}
          style={{
            background: 'var(--accent-danger)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            padding: '4px',
            cursor: 'pointer',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Stop recording"
        >
          <Square size={14} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={startRecording}
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
      title="Record voice message"
    >
      <Mic size={18} />
    </button>
  );
}
