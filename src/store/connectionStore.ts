import { create } from 'zustand';
import type { ConnectionPhase } from '../lib/types';

interface ConnectionState {
  phase: ConnectionPhase;
  setPhase: (phase: ConnectionPhase) => void;
  isConnected: () => boolean;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  phase: 'Disconnected',
  setPhase: (phase) => set({ phase }),
  isConnected: () => get().phase === 'Connected',
}));
