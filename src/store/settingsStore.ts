import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SavedAccount, LayoutPrefs } from '../lib/types';

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

  // App behavior settings
  closeToTray: boolean;
  minimizeToTray: boolean;
  autoLogin: boolean;
  lastAccountId: string | null;
  checkForUpdates: boolean;
  notifyOnMessage: boolean;
  lastUpdateCheck: number;
  dismissedVersion: string | null;

  // Form actions
  setField: <K extends keyof SettingsState>(field: K, value: SettingsState[K]) => void;
  reset: () => void;

  // App setting actions
  setAppSetting: <K extends 'closeToTray' | 'minimizeToTray' | 'autoLogin' | 'checkForUpdates' | 'notifyOnMessage'>(key: K, value: SettingsState[K]) => void;
  setLastAccountId: (id: string | null) => void;
  setUpdateCheck: (timestamp: number) => void;
  dismissUpdate: (version: string) => void;

  // Account CRUD
  addAccount: (account: SavedAccount) => void;
  updateAccount: (id: string, updates: Partial<SavedAccount>) => void;
  deleteAccount: (id: string) => void;

  // Account loading
  loadAccount: (id: string) => void;
  clearActiveAccount: () => void;

  // Layout persistence per account
  updateAccountLayout: (id: string, prefs: Partial<LayoutPrefs>) => void;
  getActiveAccountLayout: () => LayoutPrefs | undefined;
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
      closeToTray: true,
      minimizeToTray: false,
      autoLogin: false,
      lastAccountId: null,
      checkForUpdates: true,
      notifyOnMessage: true,
      lastUpdateCheck: 0,
      dismissedVersion: null,

      setField: (field, value) => set({ [field]: value } as Partial<SettingsState>),
      reset: () => set({ ...formDefaults, activeAccountId: null }),

      setAppSetting: (key, value) => set({ [key]: value } as Partial<SettingsState>),
      setLastAccountId: (id) => set({ lastAccountId: id }),
      setUpdateCheck: (timestamp) => set({ lastUpdateCheck: timestamp }),
      dismissUpdate: (version) => set({ dismissedVersion: version }),

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

      updateAccountLayout: (id, prefs) =>
        set((s) => ({
          accounts: s.accounts.map((a) =>
            a.id === id ? { ...a, layoutPrefs: { ...a.layoutPrefs, ...prefs } } : a
          ),
        })),

      getActiveAccountLayout: () => {
        const { activeAccountId, accounts } = get();
        if (!activeAccountId) return undefined;
        return accounts.find((a) => a.id === activeAccountId)?.layoutPrefs;
      },
    }),
    {
      name: 'deskclaw-settings',
      version: 4,
      migrate: (persisted: unknown, version: number) => {
        const old = persisted as Record<string, unknown>;
        if (version === 0 || !version) {
          return {
            host: (old.host as string) || '',
            port: (old.port as number) || 22,
            username: (old.username as string) || '',
            authMethod: (old.authMethod as string) || 'password',
            keyPath: (old.keyPath as string) || '',
            accounts: [],
            activeAccountId: null,
            closeToTray: true,
            minimizeToTray: false,
            autoLogin: false,
            lastAccountId: null,
          };
        }
        if (version === 1) {
          return {
            ...old,
            closeToTray: true,
            minimizeToTray: false,
            autoLogin: false,
            lastAccountId: null,
            checkForUpdates: true,
            lastUpdateCheck: 0,
            dismissedVersion: null,
          };
        }
        if (version === 2) {
          return {
            ...old,
            checkForUpdates: true,
            lastUpdateCheck: 0,
            dismissedVersion: null,
            notifyOnMessage: true,
          };
        }
        if (version === 3) {
          return {
            ...old,
            notifyOnMessage: true,
          };
        }
        return persisted as SettingsState;
      },
    }
  )
);
