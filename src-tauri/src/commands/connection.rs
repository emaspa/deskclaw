use crate::gateway::client::GatewayConnection;
use crate::ssh::auth::SshAuth;
use crate::ssh::tunnel::SshTunnel;
use crate::state::app_state::{AppState, ConnectionPhase};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(serde::Deserialize)]
pub struct ConnectParams {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    pub password: Option<String>,
    pub key_path: Option<String>,
    pub key_passphrase: Option<String>,
    pub token: String,
}

#[tauri::command]
pub async fn connect_ssh(
    params: ConnectParams,
    app: AppHandle,
) -> Result<(), String> {
    let state = app.state::<AppState>();

    // Phase 1: SSH connection
    *state.connection_phase.lock().await = ConnectionPhase::ConnectingSsh;
    let _ = app.emit("connection-status", "ConnectingSsh");

    let auth = match params.auth_method.as_str() {
        "password" => SshAuth::Password(params.password.ok_or("Password required")?),
        "key" => SshAuth::KeyFile {
            path: params.key_path.ok_or("Key path required")?,
            passphrase: params.key_passphrase,
        },
        _ => return Err("Invalid auth method".into()),
    };

    let tunnel = SshTunnel::connect(&params.host, params.port, &params.username, &auth, 18789)
        .await
        .map_err(|e| {
            let app2 = app.clone();
            tauri::async_runtime::spawn(async move {
                let state = app2.state::<AppState>();
                *state.connection_phase.lock().await = ConnectionPhase::Disconnected;
            });
            e.to_string()
        })?;

    let local_port = tunnel.local_port();

    // Start a lightweight HTTP server on the remote to serve uploaded media files.
    // This lets the agent access images via URL and DeskClaw display them via tunnel.
    const REMOTE_MEDIA_PORT: u16 = 19284;

    // Step 1: Ensure directory exists
    let _ = tunnel.exec("mkdir -p ~/.deskclaw/media").await;

    // Step 2: Start the HTTP server in a subshell so it fully detaches from the SSH channel.
    // Without the subshell wrapper, the backgrounded process holds the channel's fds open.
    let start_cmd = format!(
        "cd ~/.deskclaw/media && (python3 -m http.server {} --bind 127.0.0.1 </dev/null >/dev/null 2>&1 &) && echo OK",
        REMOTE_MEDIA_PORT
    );
    match tunnel.exec(&start_cmd).await {
        Ok(out) if out.contains("OK") => {
            log::info!("Media server started on remote:{}", REMOTE_MEDIA_PORT);

            // Step 3: Forward the remote port to a local port
            match tunnel.forward_local_port("127.0.0.1", REMOTE_MEDIA_PORT).await {
                Ok(local_media_port) => {
                    *state.media_server_port.lock().await = Some(local_media_port);
                    log::info!(
                        "Media server tunneled: remote:{} -> localhost:{}",
                        REMOTE_MEDIA_PORT, local_media_port
                    );
                }
                Err(e) => log::warn!("Media port forward failed: {}", e),
            }
        }
        Ok(out) => log::warn!("Media server output: {}", out),
        Err(e) => log::warn!("Media server start failed: {}", e),
    }

    *state.ssh_tunnel.lock().await = Some(tunnel);
    *state.local_port.lock().await = Some(local_port);
    *state.connection_phase.lock().await = ConnectionPhase::SshConnected;
    let _ = app.emit("connection-status", "SshConnected");

    // Phase 2: Gateway WebSocket connection + handshake
    *state.connection_phase.lock().await = ConnectionPhase::ConnectingGateway;
    let _ = app.emit("connection-status", "ConnectingGateway");

    let gateway = GatewayConnection::connect(local_port, &params.token, app.clone())
        .await
        .map_err(|e| {
            let app2 = app.clone();
            tauri::async_runtime::spawn(async move {
                let state = app2.state::<AppState>();
                if let Some(tunnel) = state.ssh_tunnel.lock().await.take() {
                    let _ = tunnel.disconnect().await;
                }
                *state.connection_phase.lock().await = ConnectionPhase::Disconnected;
            });
            e.to_string()
        })?;

    *state.gateway.lock().await = Some(gateway);
    *state.connection_phase.lock().await = ConnectionPhase::Connected;
    let _ = app.emit("connection-status", "Connected");

    Ok(())
}

#[tauri::command]
pub async fn disconnect_ssh(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if let Some(gw) = state.gateway.lock().await.take() {
        gw.disconnect().await;
    }
    if let Some(tunnel) = state.ssh_tunnel.lock().await.take() {
        tunnel.disconnect().await.map_err(|e| e.to_string())?;
    }
    *state.connection_phase.lock().await = ConnectionPhase::Disconnected;
    *state.local_port.lock().await = None;
    *state.media_server_port.lock().await = None;
    *state.device_token.lock().await = None;
    state.sessions.lock().await.clear();
    state.messages.lock().await.clear();
    let _ = app.emit("connection-status", "Disconnected");
    Ok(())
}

#[tauri::command]
pub async fn get_connection_status(
    state: State<'_, AppState>,
) -> Result<ConnectionPhase, String> {
    Ok(state.connection_phase.lock().await.clone())
}
