use futures_util::{SinkExt, StreamExt, stream::SplitSink, stream::SplitStream};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async, tungstenite::Message};

use crate::crypto::identity::DeviceIdentity;
use crate::gateway::handshake::{AuthCredential, HandshakeResult};
use crate::gateway::token_store;
use crate::state::app_state::{ConnectionPhase, GatewayInfo};

type WsStream = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;
type WsSink = SplitSink<WsStream, Message>;
type WsSource = SplitStream<WsStream>;
type PendingMap = HashMap<String, tokio::sync::oneshot::Sender<Result<serde_json::Value, String>>>;

// Reconnect timing per gateway protocol client guidance.
const INITIAL_BACKOFF_MS: u64 = 1_000;
const MAX_BACKOFF_MS: u64 = 30_000;

#[derive(Clone)]
struct ConnectContext {
    local_port: u16,
    gateway_token: String,
    host: String,
    config_dir: PathBuf,
}

pub struct GatewayConnection {
    sink: Arc<Mutex<Option<WsSink>>>,
    pending_requests: Arc<Mutex<PendingMap>>,
    shutdown_tx: tokio::sync::watch::Sender<bool>,
}

impl std::fmt::Debug for GatewayConnection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GatewayConnection").finish()
    }
}

impl GatewayConnection {
    pub async fn connect(
        local_port: u16,
        token: &str,
        host: &str,
        app_handle: AppHandle,
    ) -> Result<Self, crate::error::AppError> {
        let config_dir = app_handle
            .path()
            .app_config_dir()
            .map_err(|e| crate::error::AppError::Gateway(format!("config dir: {}", e)))?;

        let ctx = ConnectContext {
            local_port,
            gateway_token: token.to_string(),
            host: host.to_string(),
            config_dir,
        };

        // First connection: errors surface directly to the caller.
        let (ws_stream, hello) = Self::establish(&ctx, &app_handle).await?;
        let tick_ms = hello.tick_interval_ms;

        let (sink_half, stream_half) = ws_stream.split();
        let sink = Arc::new(Mutex::new(Some(sink_half)));
        let pending_requests: Arc<Mutex<PendingMap>> = Arc::new(Mutex::new(HashMap::new()));
        let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);

        tokio::spawn(Self::manager_loop(
            stream_half,
            sink.clone(),
            pending_requests.clone(),
            app_handle,
            ctx,
            tick_ms,
            shutdown_rx,
        ));

        Ok(Self {
            sink,
            pending_requests,
            shutdown_tx,
        })
    }

    /// Open a WebSocket and perform the v4 handshake. Tries the stored device
    /// token first (preserves the paired identity and approved scopes); falls
    /// back to the shared gateway token, clearing a rejected device token.
    /// On success, persists the (possibly rotated) device token and publishes
    /// hello-ok features/policy to AppState.
    async fn establish(
        ctx: &ConnectContext,
        app: &AppHandle,
    ) -> Result<(WsStream, HandshakeResult), crate::error::AppError> {
        let identity = DeviceIdentity::load_or_create(&ctx.config_dir);
        let url = format!("ws://127.0.0.1:{}", ctx.local_port);

        let stored_token = token_store::load(&ctx.config_dir, &ctx.host);
        let mut attempt_creds: Vec<AuthCredential> = Vec::new();
        if let Some(dt) = &stored_token {
            attempt_creds.push(AuthCredential::DeviceToken(dt));
        }
        attempt_creds.push(AuthCredential::GatewayToken(&ctx.gateway_token));

        let mut last_err =
            crate::error::AppError::Gateway("no credentials available".into());

        for (i, cred) in attempt_creds.iter().enumerate() {
            let is_device_token = matches!(cred, AuthCredential::DeviceToken(_));
            let (mut ws_stream, _) = connect_async(&url)
                .await
                .map_err(|e| crate::error::AppError::Gateway(e.to_string()))?;

            match crate::gateway::handshake::perform_handshake(&mut ws_stream, &identity, cred)
                .await
            {
                Ok(hello) => {
                    if !hello.device_token.is_empty() {
                        token_store::save(&ctx.config_dir, &ctx.host, &hello.device_token);
                    }
                    let state = app.state::<crate::state::app_state::AppState>();
                    *state.device_token.lock().await = Some(hello.device_token.clone());
                    *state.gateway_info.lock().await = Some(GatewayInfo {
                        protocol: hello.protocol,
                        methods: hello.methods.clone(),
                        events: hello.events.clone(),
                        max_payload: hello.max_payload,
                        tick_interval_ms: hello.tick_interval_ms,
                    });
                    log::info!(
                        "Gateway handshake OK (protocol v{}, {} methods, tick {}ms)",
                        hello.protocol,
                        hello.methods.len(),
                        hello.tick_interval_ms
                    );
                    return Ok((ws_stream, hello));
                }
                Err(e) => {
                    if is_device_token {
                        log::warn!("device token handshake failed ({}), retrying with gateway token", e);
                        token_store::clear(&ctx.config_dir, &ctx.host);
                    }
                    last_err = e;
                    let _ = i; // next credential
                }
            }
        }

        Err(last_err)
    }

    /// Owns the read half: pumps messages, detects dead connections via tick
    /// silence, and reconnects with exponential backoff until shutdown.
    async fn manager_loop(
        mut stream: WsSource,
        sink: Arc<Mutex<Option<WsSink>>>,
        pending: Arc<Mutex<PendingMap>>,
        app: AppHandle,
        ctx: ConnectContext,
        mut tick_ms: u64,
        mut shutdown_rx: tokio::sync::watch::Receiver<bool>,
    ) {
        loop {
            let shutdown =
                Self::read_loop(&mut stream, &sink, &pending, &app, tick_ms, &mut shutdown_rx)
                    .await;

            *sink.lock().await = None;
            Self::fail_pending(&pending, "connection lost").await;

            if shutdown {
                return;
            }

            log::warn!("Gateway connection lost — reconnecting");
            Self::set_phase(&app, ConnectionPhase::Reconnecting, "Reconnecting").await;

            let mut delay_ms = INITIAL_BACKOFF_MS;
            let reconnected = loop {
                tokio::select! {
                    _ = tokio::time::sleep(std::time::Duration::from_millis(delay_ms)) => {}
                    _ = shutdown_rx.changed() => {}
                }
                if *shutdown_rx.borrow() {
                    break None;
                }

                match Self::establish(&ctx, &app).await {
                    Ok((ws_stream, hello)) => break Some((ws_stream, hello)),
                    Err(e) => {
                        log::warn!("reconnect attempt failed: {} (next in {}ms)", e, delay_ms);
                        delay_ms = (delay_ms * 2).min(MAX_BACKOFF_MS);
                    }
                }
            };

            let Some((ws_stream, hello)) = reconnected else {
                return; // shut down while reconnecting
            };

            tick_ms = hello.tick_interval_ms;
            let (sink_half, stream_half) = ws_stream.split();
            *sink.lock().await = Some(sink_half);
            stream = stream_half;

            log::info!("Gateway reconnected");
            Self::set_phase(&app, ConnectionPhase::Connected, "Connected").await;
            // Session state may have changed while we were away.
            let _ = app.emit("sessions-changed", serde_json::json!({ "reason": "reconnected" }));
        }
    }

    async fn set_phase(app: &AppHandle, phase: ConnectionPhase, label: &str) {
        let state = app.state::<crate::state::app_state::AppState>();
        *state.connection_phase.lock().await = phase;
        let _ = app.emit("connection-status", label);
    }

    /// Pump messages until the connection dies or shutdown is requested.
    /// Returns true when exiting due to shutdown.
    async fn read_loop(
        stream: &mut WsSource,
        sink: &Arc<Mutex<Option<WsSink>>>,
        pending: &Arc<Mutex<PendingMap>>,
        app: &AppHandle,
        tick_ms: u64,
        shutdown_rx: &mut tokio::sync::watch::Receiver<bool>,
    ) -> bool {
        // Gateway closes silent connections after tickIntervalMs * 2; mirror
        // that on the client (plus slack) to detect dead tunnels quickly. The
        // deadline is anchored to the last received frame so heartbeat sends
        // don't reset it.
        let silence_limit = std::time::Duration::from_millis(tick_ms.saturating_mul(2) + 5_000);
        let mut last_rx = tokio::time::Instant::now();
        let mut heartbeat_interval =
            tokio::time::interval(std::time::Duration::from_secs(30));
        heartbeat_interval.tick().await; // first tick completes immediately

        loop {
            tokio::select! {
                msg = stream.next() => {
                    last_rx = tokio::time::Instant::now();
                    match msg {
                        Some(Ok(Message::Text(text))) => {
                            Self::handle_message(&text, pending, app).await;
                        }
                        Some(Ok(Message::Pong(_))) => {
                            log::debug!("WebSocket pong received");
                        }
                        Some(Ok(Message::Close(_))) | None => {
                            return false;
                        }
                        Some(Err(e)) => {
                            log::error!("WebSocket read error: {}", e);
                            return false;
                        }
                        _ => {}
                    }
                }
                _ = tokio::time::sleep_until(last_rx + silence_limit) => {
                    log::warn!("no gateway traffic for {:?} — assuming dead connection", silence_limit);
                    return false;
                }
                _ = heartbeat_interval.tick() => {
                    let mut guard = sink.lock().await;
                    if let Some(s) = guard.as_mut() {
                        if let Err(e) = s.send(Message::Ping(vec![].into())).await {
                            log::warn!("WebSocket heartbeat ping failed: {}", e);
                            return false;
                        }
                    }
                }
                _ = shutdown_rx.changed() => {
                    if *shutdown_rx.borrow() {
                        return true;
                    }
                }
            }
        }
    }

    async fn fail_pending(pending: &Arc<Mutex<PendingMap>>, reason: &str) {
        let mut map = pending.lock().await;
        for (_, tx) in map.drain() {
            let _ = tx.send(Err(reason.to_string()));
        }
    }

    async fn handle_message(
        text: &str,
        pending: &Arc<Mutex<PendingMap>>,
        app: &AppHandle,
    ) {
        let msg: crate::gateway::protocol::GatewayMessage = match serde_json::from_str(text) {
            Ok(m) => m,
            Err(e) => {
                log::warn!("Failed to parse gateway message: {} — raw: {}...", e, &text[..text.len().min(500)]);
                return;
            }
        };

        match msg {
            crate::gateway::protocol::GatewayMessage::Response {
                id,
                ok,
                payload,
                error,
            } => {
                let mut map = pending.lock().await;
                if let Some(tx) = map.remove(&id) {
                    let value = if ok {
                        Ok(payload.unwrap_or(serde_json::Value::Null))
                    } else {
                        Err(error
                            .as_ref()
                            .map(crate::gateway::protocol::extract_error_message)
                            .unwrap_or_else(|| "unknown gateway error".into()))
                    };
                    let _ = tx.send(value);
                }
            }
            crate::gateway::protocol::GatewayMessage::Event { event, payload } => {
                match event.as_str() {
                    "chat" => {
                        let _ = app.emit("new-message", payload);
                    }
                    "agent" => {
                        let _ = app.emit("agent-update", payload);
                    }
                    "presence" => {
                        let _ = app.emit("presence-update", payload);
                    }
                    "tick" => {}
                    "health" => {
                        let _ = app.emit("health-update", payload);
                    }
                    "shutdown" => {
                        let _ = app.emit("gateway-shutdown", payload);
                    }
                    "session" => {
                        let _ = app.emit("session-update", payload);
                    }
                    "sessions.changed" => {
                        let _ = app.emit("sessions-changed", payload);
                    }
                    _ => {
                        let _ = app.emit(&format!("gateway-{}", event), payload);
                    }
                }
            }
            _ => {}
        }
    }

    pub async fn rpc(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, crate::error::AppError> {
        let id = uuid::Uuid::new_v4().to_string();
        let (tx, rx) = tokio::sync::oneshot::channel();

        self.pending_requests.lock().await.insert(id.clone(), tx);

        let req = crate::gateway::protocol::GatewayMessage::Request {
            id: id.clone(),
            method: method.to_string(),
            params,
        };

        let text = serde_json::to_string(&req)
            .map_err(|e| crate::error::AppError::Gateway(e.to_string()))?;

        log::info!("RPC send: {} (id={}, payload_bytes={})", method, id, text.len());

        {
            let mut guard = self.sink.lock().await;
            let sink = guard.as_mut().ok_or_else(|| {
                crate::error::AppError::Gateway("Gateway reconnecting — try again shortly".into())
            })?;
            sink.send(Message::Text(text.into()))
                .await
                .map_err(|e| crate::error::AppError::Gateway(e.to_string()))?;
        }

        // chat.send may carry large inline attachments through the tunnel.
        let timeout_secs = if method == "chat.send" { 120 } else { 30 };
        let result = tokio::time::timeout(std::time::Duration::from_secs(timeout_secs), rx)
            .await
            .map_err(|_| {
                log::error!("RPC timeout: {} (id={})", method, id);
                crate::error::AppError::Gateway(format!("RPC timeout: {}", method))
            })?
            .map_err(|_| crate::error::AppError::Gateway("Request cancelled".into()))?;

        match result {
            Ok(value) => Ok(value),
            Err(e) => Err(crate::error::AppError::Gateway(e)),
        }
    }

    pub async fn disconnect(self) {
        let _ = self.shutdown_tx.send(true);
        if let Some(sink) = self.sink.lock().await.as_mut() {
            let _ = sink.send(Message::Close(None)).await;
        }
    }
}
