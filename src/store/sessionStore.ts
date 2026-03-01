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
}

export const useSessionStore = create<SessionState>((set) => ({
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
}));
