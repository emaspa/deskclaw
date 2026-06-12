import { create } from 'zustand';
import type { SessionInfo, AgentInfo, GatewayInfo } from '../lib/types';

export interface AgentIdentity {
  name: string;
  persona?: string;
  emoji?: string;
}

interface SessionState {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  agentIdentity: AgentIdentity | null;
  agents: AgentInfo[];
  gatewayInfo: GatewayInfo | null;
  setSessions: (sessions: SessionInfo[]) => void;
  setActiveSession: (id: string | null) => void;
  setAgentIdentity: (identity: AgentIdentity | null) => void;
  setAgents: (agents: AgentInfo[]) => void;
  setGatewayInfo: (info: GatewayInfo | null) => void;
  hasGatewayMethod: (method: string) => boolean;
  updateSession: (id: string, update: Partial<SessionInfo>) => void;
  findSession: (id: string) => SessionInfo | undefined;
}

/** Extract session ID from event payload — handles multiple field names from the gateway */
export function extractSessionId(data: Record<string, unknown>): string {
  return (data.sessionKey as string) || (data.sessionId as string) || (data.session_id as string) || (data.key as string) || '';
}

/** Derive the owning agent id from a session key (e.g. "agent:knox:whatsapp:..." → "knox") */
export function agentIdFromKey(key: string): string {
  const parts = key.split(':');
  return parts[0] === 'agent' && parts[1] ? parts[1] : 'main';
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  agentIdentity: null,
  agents: [],
  gatewayInfo: null,
  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (id) => set({ activeSessionId: id }),
  setAgentIdentity: (identity) => set({ agentIdentity: identity }),
  setAgents: (agents) => set({ agents }),
  setGatewayInfo: (info) => set({ gatewayInfo: info }),
  hasGatewayMethod: (method) => {
    const info = get().gatewayInfo;
    // Be permissive when the handshake info isn't loaded (older backend)
    return !info || info.methods.includes(method);
  },
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
