import { create } from 'zustand';
import type { ChatMessage } from '../lib/types';

export interface PendingMessage {
  id: string;
  content: string;
  timestamp: string;
}

interface ChatState {
  messages: Record<string, ChatMessage[]>;
  activeRuns: Record<string, Set<string>>;
  pendingQueue: Record<string, PendingMessage[]>;
  scrollVersion: number;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  updateMessageContent: (sessionId: string, messageId: string, content: string) => void;
  setMessages: (sessionId: string, messages: ChatMessage[]) => void;
  addRun: (sessionId: string, runId: string) => void;
  removeRun: (sessionId: string, runId: string) => void;
  isTyping: (sessionId: string) => boolean;
  addPending: (sessionId: string, msg: PendingMessage) => void;
  updatePending: (sessionId: string, msgId: string, content: string) => void;
  removePending: (sessionId: string, msgId: string) => void;
  shiftPending: (sessionId: string) => PendingMessage | undefined;
  clearMessages: (sessionId: string) => void;
  clearAll: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: {},
  activeRuns: {},
  pendingQueue: {},
  scrollVersion: 0,
  addMessage: (sessionId, message) =>
    set((state) => ({
      scrollVersion: state.scrollVersion + 1,
      messages: {
        ...state.messages,
        [sessionId]: [...(state.messages[sessionId] || []), message],
      },
    })),
  updateMessageContent: (sessionId, messageId, content) =>
    set((state) => ({
      scrollVersion: state.scrollVersion + 1,
      messages: {
        ...state.messages,
        [sessionId]: (state.messages[sessionId] || []).map((m) =>
          m.id === messageId ? { ...m, content } : m
        ),
      },
    })),
  setMessages: (sessionId, messages) =>
    set((state) => ({
      messages: { ...state.messages, [sessionId]: messages },
    })),
  addRun: (sessionId, runId) =>
    set((state) => {
      const runs = new Set(state.activeRuns[sessionId] || []);
      runs.add(runId);
      return { activeRuns: { ...state.activeRuns, [sessionId]: runs } };
    }),
  removeRun: (sessionId, runId) =>
    set((state) => {
      const runs = new Set(state.activeRuns[sessionId] || []);
      runs.delete(runId);
      return { activeRuns: { ...state.activeRuns, [sessionId]: runs } };
    }),
  isTyping: (sessionId) => {
    const runs = get().activeRuns[sessionId];
    return !!runs && runs.size > 0;
  },
  addPending: (sessionId, msg) =>
    set((state) => ({
      pendingQueue: {
        ...state.pendingQueue,
        [sessionId]: [...(state.pendingQueue[sessionId] || []), msg],
      },
    })),
  updatePending: (sessionId, msgId, content) =>
    set((state) => ({
      pendingQueue: {
        ...state.pendingQueue,
        [sessionId]: (state.pendingQueue[sessionId] || []).map((m) =>
          m.id === msgId ? { ...m, content } : m
        ),
      },
    })),
  removePending: (sessionId, msgId) =>
    set((state) => ({
      pendingQueue: {
        ...state.pendingQueue,
        [sessionId]: (state.pendingQueue[sessionId] || []).filter((m) => m.id !== msgId),
      },
    })),
  shiftPending: (sessionId) => {
    const queue = get().pendingQueue[sessionId] || [];
    if (queue.length === 0) return undefined;
    const [first, ...rest] = queue;
    set((state) => ({
      pendingQueue: { ...state.pendingQueue, [sessionId]: rest },
    }));
    return first;
  },
  clearMessages: (sessionId) =>
    set((state) => {
      const copy = { ...state.messages };
      delete copy[sessionId];
      return { messages: copy };
    }),
  clearAll: () => set({ messages: {}, activeRuns: {}, pendingQueue: {} }),
}));
