use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use tokio::sync::Mutex;

use crate::gateway::client::GatewayConnection;
use crate::ssh::tunnel::SshTunnel;

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub enum ConnectionPhase {
    Disconnected,
    ConnectingSsh,
    SshConnected,
    ConnectingGateway,
    Handshaking,
    Connected,
    Error(String),
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub key: String,
    pub kind: String,
    pub model: Option<String>,
    pub display_name: Option<String>,
    pub last_channel: Option<String>,
    pub updated_at: Option<u64>,
    pub total_tokens: Option<u64>,
    pub context_tokens: Option<u64>,
    pub context_window: Option<u64>,
    pub model_provider: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub timestamp: String,
    pub session_id: String,
    pub message_type: Option<String>,
}

pub struct AppState {
    pub connection_phase: Mutex<ConnectionPhase>,
    pub ssh_tunnel: Mutex<Option<SshTunnel>>,
    pub gateway: Mutex<Option<GatewayConnection>>,
    pub sessions: Mutex<Vec<SessionInfo>>,
    pub active_session_id: Mutex<Option<String>>,
    pub messages: Mutex<HashMap<String, Vec<ChatMessage>>>,
    pub device_token: Mutex<Option<String>>,
    pub local_port: Mutex<Option<u16>>,
    /// Local port that tunnels to the remote HTTP media server (serves ~/.deskclaw/media/)
    pub media_server_port: Mutex<Option<u16>>,
    /// Whether the window should hide to tray instead of closing
    pub close_to_tray: AtomicBool,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            connection_phase: Mutex::new(ConnectionPhase::Disconnected),
            ssh_tunnel: Mutex::new(None),
            gateway: Mutex::new(None),
            sessions: Mutex::new(Vec::new()),
            active_session_id: Mutex::new(None),
            messages: Mutex::new(HashMap::new()),
            device_token: Mutex::new(None),
            local_port: Mutex::new(None),
            media_server_port: Mutex::new(None),
            close_to_tray: AtomicBool::new(true),
        }
    }
}
