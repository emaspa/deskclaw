export type ConnectionPhase =
  | 'Disconnected'
  | 'ConnectingSsh'
  | 'SshConnected'
  | 'ConnectingGateway'
  | 'Handshaking'
  | 'Connected'
  | 'Reconnecting'
  | { Error: string };

/** Gateway features and limits from the hello-ok handshake */
export interface GatewayInfo {
  protocol: number;
  methods: string[];
  events: string[];
  max_payload: number;
  tick_interval_ms: number;
}

export interface AgentInfo {
  id: string;
  name?: string;
  emoji?: string;
  avatarUrl?: string;
  model?: string;
  isDefault: boolean;
}

export interface ConnectParams {
  host: string;
  port: number;
  username: string;
  auth_method: 'password' | 'key';
  password?: string;
  key_path?: string;
  key_passphrase?: string;
  token: string;
}

export interface SessionInfo {
  id: string;
  key: string;
  kind: string;
  model?: string;
  model_provider?: string;
  display_name?: string;
  last_channel?: string;
  updated_at?: number;
  total_tokens?: number;
  context_tokens?: number;
  context_window?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  session_id: string;
  message_type?: string;
  /** True while the message is being streamed via delta events */
  streaming?: boolean;
}

export interface AppSettings {
  host?: string;
  port?: number;
  username?: string;
  auth_method?: string;
  key_path?: string;
}

export interface Attachment {
  name: string;
  mimeType: string;
  data: string; // base64
}

export interface LayoutPrefs {
  sidebarCollapsed?: boolean;
  lastSessionKey?: string;
}

export interface SavedAccount {
  id: string;
  name: string;
  nickname?: string;
  avatar?: string; // base64 encoded, 128x128
  host: string;
  port: number;
  username: string;
  authMethod: 'password' | 'key';
  keyPath?: string;
  encryptedPassword?: string;
  encryptedToken?: string;
  encryptedKeyPassphrase?: string;
  layoutPrefs?: LayoutPrefs;
}
