import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SavedAccount } from '../lib/types';

interface SettingsState {
  // Form fields (current connection form state)
  host: string;
  port: number;
  username: string;
  authMethod: 'password' | 'key';
  keyPath: string;

  // Saved accounts
  accounts: SavedAccount[];
  activeAccountId: string | null;

  // Form actions
  setField: <K extends keyof SettingsState>(field: K, value: SettingsState[K]) => void;
  reset: () => void;

  // Account CRUD
  addAccount: (account: SavedAccount) => void;
  updateAccount: (id: string, updates: Partial<SavedAccount>) => void;
  deleteAccount: (id: string) => void;

  // Account loading
  loadAccount: (id: string) => void;
  clearActiveAccount: () => void;
}

const formDefaults = {
  host: '',
  port: 22,
  username: '',
  authMethod: 'password' as const,
  keyPath: '',
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...formDefaults,
      accounts: [],
      activeAccountId: null,

      setField: (field, value) => set({ [field]: value } as Partial<SettingsState>),
      reset: () => set({ ...formDefaults, activeAccountId: null }),

      addAccount: (account) =>
        set((s) => ({ accounts: [...s.accounts, account] })),

      updateAccount: (id, updates) =>
        set((s) => ({
          accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...updates } : a)),
        })),

      deleteAccount: (id) =>
        set((s) => ({
          accounts: s.accounts.filter((a) => a.id !== id),
          activeAccountId: s.activeAccountId === id ? null : s.activeAccountId,
        })),

      loadAccount: (id) => {
        const account = get().accounts.find((a) => a.id === id);
        if (!account) return;
        set({
          host: account.host,
          port: account.port,
          username: account.username,
          authMethod: account.authMethod,
          keyPath: account.keyPath || '',
          activeAccountId: id,
        });
      },

      clearActiveAccount: () => set({ ...formDefaults, activeAccountId: null }),
    }),
    {
      name: 'deskclaw-settings',
      version: 1,
      migrate: (persisted: unknown, version: number) => {
        if (version === 0 || !version) {
          // Old format: flat fields only, no accounts
          const old = persisted as Record<string, unknown>;
          return {
            host: (old.host as string) || '',
            port: (old.port as number) || 22,
            username: (old.username as string) || '',
            authMethod: (old.authMethod as string) || 'password',
            keyPath: (old.keyPath as string) || '',
            accounts: [],
            activeAccountId: null,
          };
        }
        return persisted as SettingsState;
      },
    }
  )
);
