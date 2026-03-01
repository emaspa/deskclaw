export type ConnectionPhase =
  | 'Disconnected'
  | 'ConnectingSsh'
  | 'SshConnected'
  | 'ConnectingGateway'
  | 'Handshaking'
  | 'Connected'
  | { Error: string };

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
}
