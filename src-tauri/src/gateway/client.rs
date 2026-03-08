use futures_util::{SinkExt, StreamExt, stream::SplitSink};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async, tungstenite::Message};

type WsSink = SplitSink<WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>, Message>;

pub struct GatewayConnection {
    sink: Arc<Mutex<WsSink>>,
    pending_requests:
        Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<serde_json::Value>>>>,
    _shutdown_tx: tokio::sync::oneshot::Sender<()>,
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
        app_handle: AppHandle,
    ) -> Result<Self, crate::error::AppError> {
        let url = format!("ws://127.0.0.1:{}", local_port);
        let (mut ws_stream, _) = connect_async(&url)
            .await
            .map_err(|e| crate::error::AppError::Gateway(e.to_string()))?;

        // Perform handshake
        let identity = crate::crypto::identity::DeviceIdentity::generate();
        let device_token =
            crate::gateway::handshake::perform_handshake(&mut ws_stream, &identity, token)
                .await?;

        // Store device token
        let state = app_handle.state::<crate::state::app_state::AppState>();
        *state.device_token.lock().await = Some(device_token);

        // Split into read/write halves
        let (sink, mut stream) = ws_stream.split();
        let sink = Arc::new(Mutex::new(sink));
        let pending_requests: Arc<
            Mutex<HashMap<String, tokio::sync::oneshot::Sender<serde_json::Value>>>,
        > = Arc::new(Mutex::new(HashMap::new()));

        let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel::<()>();

        // Spawn the read loop with periodic heartbeat
        let pending_clone = pending_requests.clone();
        let sink_clone = sink.clone();
        let app_clone = app_handle.clone();
        tokio::spawn(async move {
            let mut heartbeat_interval = tokio::time::interval(
                std::time::Duration::from_secs(30),
            );
            // First tick completes immediately — skip it
            heartbeat_interval.tick().await;

            loop {
                tokio::select! {
                    msg = stream.next() => {
                        match msg {
                            Some(Ok(Message::Text(text))) => {
                                Self::handle_message(
                                    &text,
                                    &pending_clone,
                                    &app_clone,
                                ).await;
                            }
                            Some(Ok(Message::Pong(_))) => {
                                log::debug!("WebSocket pong received");
                            }
                            Some(Ok(Message::Close(_))) | None => {
                                let _ = app_clone.emit("connection-status", "disconnected");
                                break;
                            }
                            Some(Err(e)) => {
                                log::error!("WebSocket read error: {}", e);
                                let _ = app_clone.emit("connection-status", "disconnected");
                                break;
                            }
                            _ => {}
                        }
                    }
                    _ = heartbeat_interval.tick() => {
                        // Send WebSocket ping to detect dead connections
                        let ping_result = sink_clone
                            .lock()
                            .await
                            .send(Message::Ping(vec![].into()))
                            .await;
                        if let Err(e) = ping_result {
                            log::warn!("WebSocket heartbeat ping failed: {}", e);
                            let _ = app_clone.emit("connection-status", "disconnected");
                            break;
                        }
                    }
                    _ = &mut shutdown_rx => {
                        break;
                    }
                }
            }
        });

        Ok(Self {
            sink,
            pending_requests,
            _shutdown_tx: shutdown_tx,
        })
    }

    async fn handle_message(
        text: &str,
        pending: &Arc<
            Mutex<HashMap<String, tokio::sync::oneshot::Sender<serde_json::Value>>>,
        >,
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
                payload,
                error,
                ..
            } => {
                let mut map = pending.lock().await;
                if let Some(tx) = map.remove(&id) {
                    let value = if let Some(r) = payload {
                        r
                    } else if let Some(e) = error {
                        serde_json::json!({"error": crate::gateway::protocol::extract_error_message(&e)})
                    } else {
                        serde_json::Value::Null
                    };
                    let _ = tx.send(value);
                }
            }
            crate::gateway::protocol::GatewayMessage::Event { event, payload } => {
                log::info!("Gateway event: {} — payload keys: {:?}", event, payload.as_object().map(|o| o.keys().collect::<Vec<_>>()));
                match event.as_str() {
                    "chat" => {
                        log::info!("Chat event payload: {}", &payload.to_string()[..payload.to_string().len().min(500)]);
                        let _ = app.emit("new-message", payload);
                    }
                    "agent" => {
                        let data_str = payload.get("data").map(|d| {
                            let s = d.to_string();
                            if s.len() > 1000 { format!("{}…", &s[..1000]) } else { s }
                        }).unwrap_or_default();
                        log::info!("Agent event: stream={:?} sessionKey={:?} data={}",
                            payload.get("stream").and_then(|v| v.as_str()),
                            payload.get("sessionKey").and_then(|v| v.as_str()),
                            data_str);
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

        self.sink
            .lock()
            .await
            .send(Message::Text(text.into()))
            .await
            .map_err(|e| crate::error::AppError::Gateway(e.to_string()))?;

        // Timeout after 30 seconds (use 60s for chat.send which may have large attachments)
        let timeout_secs = if method == "chat.send" { 60 } else { 30 };
        let result = tokio::time::timeout(std::time::Duration::from_secs(timeout_secs), rx)
            .await
            .map_err(|_| {
                log::error!("RPC timeout: {} (id={})", method, id);
                crate::error::AppError::Gateway(format!("RPC timeout: {}", method))
            })?
            .map_err(|_| crate::error::AppError::Gateway("Request cancelled".into()))?;

        log::debug!("RPC response for {}: {}", method, result);
        Ok(result)
    }

    pub async fn disconnect(self) {
        drop(self._shutdown_tx);
        let _ = self.sink.lock().await.send(Message::Close(None)).await;
    }
}
