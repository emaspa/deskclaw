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
  agentPhase: Record<string, string | null>;
  pendingQueue: Record<string, PendingMessage[]>;
  scrollVersion: number;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  updateMessageContent: (sessionId: string, messageId: string, content: string) => void;
  applyDelta: (sessionId: string, streamId: string, deltaText: string, replace: boolean) => void;
  finalizeStream: (sessionId: string, streamId: string, final: ChatMessage | null) => void;
  setMessages: (sessionId: string, messages: ChatMessage[]) => void;
  addRun: (sessionId: string, runId: string) => void;
  removeRun: (sessionId: string, runId: string) => void;
  clearRuns: (sessionId: string) => void;
  setAgentPhase: (sessionId: string, phase: string | null) => void;
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
  agentPhase: {},
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
  // Progressive rendering for protocol v4 delta events: append (or replace,
  // when the gateway rewrites non-prefix content) into a streaming message
  // keyed by the run id, creating it on the first delta.
  applyDelta: (sessionId, streamId, deltaText, replace) =>
    set((state) => {
      const messages = state.messages[sessionId] || [];
      const existing = messages.find((m) => m.id === streamId);
      let next: ChatMessage[];
      if (existing) {
        next = messages.map((m) =>
          m.id === streamId
            ? { ...m, content: replace ? deltaText : m.content + deltaText }
            : m
        );
      } else {
        next = [...messages, {
          id: streamId,
          role: 'assistant' as const,
          content: deltaText,
          timestamp: new Date().toISOString(),
          session_id: sessionId,
          streaming: true,
        }];
      }
      return {
        scrollVersion: state.scrollVersion + 1,
        messages: { ...state.messages, [sessionId]: next },
      };
    }),
  // Swap the streaming placeholder for the final message (or drop it when the
  // run produced no final content, e.g. on abort).
  finalizeStream: (sessionId, streamId, final) =>
    set((state) => {
      const messages = state.messages[sessionId] || [];
      const idx = messages.findIndex((m) => m.id === streamId);
      let next: ChatMessage[];
      if (idx >= 0) {
        next = [...messages];
        if (final) {
          next[idx] = final;
        } else {
          next.splice(idx, 1);
        }
      } else if (final) {
        next = [...messages, final];
      } else {
        return state;
      }
      return {
        scrollVersion: state.scrollVersion + 1,
        messages: { ...state.messages, [sessionId]: next },
      };
    }),
  setMessages: (sessionId, messages) =>
    set((state) => ({
      scrollVersion: state.scrollVersion + 1,
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
  clearRuns: (sessionId) =>
    set((state) => ({
      activeRuns: { ...state.activeRuns, [sessionId]: new Set() },
      agentPhase: { ...state.agentPhase, [sessionId]: null },
    })),
  setAgentPhase: (sessionId, phase) =>
    set((state) => ({
      agentPhase: { ...state.agentPhase, [sessionId]: phase },
    })),
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
  clearAll: () => set({ messages: {}, activeRuns: {}, agentPhase: {}, pendingQueue: {} }),
}));
