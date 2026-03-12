import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { SessionInfo, ChatMessage, ConnectionPhase, ConnectParams, AppSettings, Attachment } from './types';

export async function connectSsh(params: ConnectParams): Promise<void> {
  return invoke('connect_ssh', { params });
}

export async function disconnectSsh(): Promise<void> {
  return invoke('disconnect_ssh');
}

export async function getConnectionStatus(): Promise<ConnectionPhase> {
  return invoke('get_connection_status');
}

export async function listSessions(): Promise<SessionInfo[]> {
  return invoke('list_sessions');
}

export async function getSessionPreview(sessionId: string): Promise<unknown> {
  return invoke('get_session_preview', { sessionId });
}

export async function getAgentIdentity(): Promise<Record<string, unknown>> {
  return invoke('get_agent_identity');
}

export async function listModels(): Promise<Record<string, unknown>> {
  return invoke('list_models');
}

export async function setModel(sessionId: string, model: string): Promise<unknown> {
  return invoke('set_model', { sessionId, model });
}

export async function sendMessage(
  sessionId: string,
  message: string,
  attachments?: Attachment[],
): Promise<unknown> {
  const params: Record<string, unknown> = { sessionId, message };
  if (attachments && attachments.length > 0) {
    // Convert camelCase to snake_case for Rust
    params.attachments = attachments.map((a) => ({
      name: a.name,
      mime_type: a.mimeType,
      data: a.data,
    }));
  }
  return invoke('send_message', params);
}

export async function getHistory(
  sessionId: string,
  limit?: number,
  before?: string,
): Promise<ChatMessage[]> {
  return invoke('get_history', { sessionId, limit, before });
}

export async function cancelRun(sessionId: string, runId: string): Promise<unknown> {
  return invoke('cancel_run', { sessionId, runId });
}

export async function injectMessage(
  sessionId: string,
  role: string,
  content: string,
): Promise<unknown> {
  return invoke('inject_message', { sessionId, role, content });
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke('save_settings', { settings });
}

export async function loadSettings(): Promise<AppSettings> {
  return invoke('load_settings');
}

export async function downloadRemoteFile(path: string): Promise<string> {
  return invoke('download_remote_file', { path });
}

export async function encryptString(value: string): Promise<string> {
  return invoke('encrypt_string', { value });
}

export async function decryptString(encrypted: string): Promise<string> {
  return invoke('decrypt_string', { encrypted });
}

export async function setCloseToTray(enabled: boolean): Promise<void> {
  return invoke('set_close_to_tray', { enabled });
}

export interface UpdateInfo {
  update_available: boolean;
  latest_version: string;
  current_version: string;
  release_url: string;
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  return invoke('check_for_updates');
}

export function hideWindow(): void {
  getCurrentWindow().hide();
}

export function showWindow(): void {
  const w = getCurrentWindow();
  w.show();
  w.setFocus();
}
