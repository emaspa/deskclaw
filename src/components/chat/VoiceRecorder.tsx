import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

// Chromium SpeechRecognition (available in Tauri WebView2 on Windows)
const SpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition
  || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

// WebKitGTK (Linux) has no SpeechRecognition; fall back to recording with
// MediaRecorder and transcribing on the gateway host (openclaw audio transcribe).
const hasMediaRecorder =
  typeof navigator !== 'undefined'
  && !!navigator.mediaDevices?.getUserMedia
  && typeof (window as unknown as Record<string, unknown>).MediaRecorder !== 'undefined';

function pickMimeType(): { mime: string; ext: string } {
  const candidates: Array<{ mime: string; ext: string }> = [
    { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
    { mime: 'audio/ogg', ext: 'ogg' },
    { mime: 'audio/webm;codecs=opus', ext: 'webm' },
    { mime: 'audio/webm', ext: 'webm' },
    { mime: 'audio/mp4', ext: 'mp4' },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mime)) return c;
  }
  return { mime: '', ext: 'ogg' }; // let the browser pick its default container
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

interface Props {
  onTranscribed: (text: string) => void;
  onRecordingChange?: (recording: boolean) => void;
}

export function VoiceRecorder({ onTranscribed, onRecordingChange }: Props) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaExtRef = useRef('ogg');
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const transcriptRef = useRef('');

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
      }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (!SpeechRecognition && !hasMediaRecorder) return null; // No dictation path available

  const startTimer = () => {
    setSeconds(0);
    timerRef.current = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
  };

  const startRecording = () => {
    if (SpeechRecognition) {
      startSpeechRecognition();
    } else {
      void startMediaRecording();
    }
  };

  const startSpeechRecognition = () => {
    try {
      const recognition = new (SpeechRecognition as new () => SpeechRecognitionInstance)();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      let finalTranscript = '';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript + ' ';
          } else {
            interim += result[0].transcript;
          }
        }
        const full = (finalTranscript + interim).trim();
        transcriptRef.current = full;
        setTranscript(full);
      };

      recognition.onerror = (event: Event & { error?: string }) => {
        console.error('[deskclaw] speech recognition error:', event.error);
        // Don't stop on 'no-speech' — just keep listening
        if (event.error !== 'no-speech') {
          stopRecording();
        }
      };

      recognition.onend = () => {
        // If still recording, restart (recognition can stop after silence)
        if (recognitionRef.current && recording) {
          try { recognition.start(); } catch { /* ignore */ }
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
      transcriptRef.current = '';
      setTranscript('');
      setRecording(true);
      onRecordingChange?.(true);
      startTimer();
    } catch (err) {
      console.error('[deskclaw] speech recognition failed:', err);
    }
  };

  const startMediaRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const { mime, ext } = pickMimeType();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaExtRef.current = ext;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        const blob = new Blob(chunks, mime ? { type: mime } : undefined);
        void transcribeBlob(blob);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      mediaStreamRef.current = stream;
      setTranscript('');
      setRecording(true);
      onRecordingChange?.(true);
      startTimer();
    } catch (err) {
      console.error('[deskclaw] microphone capture failed:', err);
    }
  };

  const transcribeBlob = async (blob: Blob) => {
    if (blob.size === 0) {
      setTranscribing(false);
      return;
    }
    setTranscribing(true);
    try {
      const audioB64 = await blobToBase64(blob);
      const text = await invoke<string>('transcribe_audio', {
        audioB64,
        ext: mediaExtRef.current,
      });
      if (text.trim()) onTranscribed(text.trim());
    } catch (err) {
      console.error('[deskclaw] transcription failed:', err);
    } finally {
      setTranscribing(false);
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (recognitionRef.current) {
      const ref = recognitionRef.current;
      recognitionRef.current = null;
      try { ref.stop(); } catch { /* ignore */ }

      const text = transcriptRef.current.trim();
      if (text) {
        onTranscribed(text);
      }
    }

    if (mediaRecorderRef.current) {
      const rec = mediaRecorderRef.current;
      mediaRecorderRef.current = null;
      try {
        if (rec.state !== 'inactive') rec.stop(); // onstop kicks off transcription
      } catch { /* ignore */ }
    }

    setTranscript('');
    setSeconds(0);
    setRecording(false);
    onRecordingChange?.(false);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (recording) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--accent-danger)',
            animation: 'pulse 1s ease-in-out infinite',
            flexShrink: 0,
          }}
        />
        <span style={{
          fontSize: 'var(--font-sm)',
          color: 'var(--text-secondary)',
          fontVariantNumeric: 'tabular-nums',
          flexShrink: 0,
        }}>
          {formatTime(seconds)}
        </span>
        {transcript && (
          <span style={{
            fontSize: 'var(--font-sm)',
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            fontStyle: 'italic',
          }}>
            {transcript}
          </span>
        )}
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
            flexShrink: 0,
          }}
          title="Stop recording and send"
        >
          <Square size={14} />
        </button>
      </div>
    );
  }

  if (transcribing) {
    return (
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px',
          color: 'var(--text-muted)',
        }}
        title="Transcribing..."
      >
        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
      </span>
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
      title="Voice to text"
    >
      <Mic size={18} />
    </button>
  );
}

// Minimal type declarations for SpeechRecognition
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: { transcript: string };
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
}
