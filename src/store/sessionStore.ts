import { create } from 'zustand';
import type { SessionInfo } from '../lib/types';

export interface AgentIdentity {
  name: string;
  persona?: string;
  emoji?: string;
}

interface SessionState {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  agentIdentity: AgentIdentity | null;
  setSessions: (sessions: SessionInfo[]) => void;
  setActiveSession: (id: string | null) => void;
  setAgentIdentity: (identity: AgentIdentity | null) => void;
  updateSession: (id: string, update: Partial<SessionInfo>) => void;
  findSession: (id: string) => SessionInfo | undefined;
}

/** Extract session ID from event payload — handles multiple field names from the gateway */
export function extractSessionId(data: Record<string, unknown>): string {
  return (data.sessionKey as string) || (data.sessionId as string) || (data.session_id as string) || (data.key as string) || '';
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  agentIdentity: null,
  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (id) => set({ activeSessionId: id }),
  setAgentIdentity: (identity) => set({ agentIdentity: identity }),
  updateSession: (id, update) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id || s.key === id ? { ...s, ...update } : s
      ),
    })),
  findSession: (id) => {
    const state = get();
    return state.sessions.find((s) => s.id === id || s.key === id);
  },
}));
