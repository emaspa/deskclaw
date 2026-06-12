use crate::state::app_state::{AppState, ChatMessage};
use tauri::State;

#[derive(Debug, Clone, serde::Deserialize)]
pub struct Attachment {
    pub name: String,
    pub mime_type: String,
    pub data: String, // base64-encoded
}

#[tauri::command]
pub async fn send_message(
    session_id: String,
    message: String,
    attachments: Option<Vec<Attachment>>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let idempotency_key = uuid::Uuid::new_v4().to_string();
    log::info!(
        "chat.send: sessionKey={}, message={}, attachments={}, idempotencyKey={}",
        session_id,
        &message[..message.len().min(100)],
        attachments.as_ref().map_or(0, |a| a.len()),
        idempotency_key
    );

    let mut params = serde_json::json!({
        "sessionKey": session_id,
        "message": message,
        "idempotencyKey": idempotency_key,
    });

    // Protocol v4 gateways accept inline base64 attachments on chat.send and
    // stage them into the agent workspace — no out-of-band upload needed.
    if let Some(atts) = &attachments {
        if !atts.is_empty() {
            let max_payload = state
                .gateway_info
                .lock()
                .await
                .as_ref()
                .map(|i| i.max_payload)
                .unwrap_or(25 * 1024 * 1024);
            let total: usize = atts.iter().map(|a| a.data.len()).sum();
            // Leave headroom for the JSON envelope around the base64 bodies.
            if total as u64 + 64 * 1024 > max_payload {
                return Err(format!(
                    "Attachments too large: {} bytes exceeds the gateway payload limit of {} bytes",
                    total, max_payload
                ));
            }

            let wire_attachments: Vec<serde_json::Value> = atts
                .iter()
                .map(|a| {
                    serde_json::json!({
                        "mimeType": a.mime_type,
                        "fileName": a.name,
                        "content": a.data,
                    })
                })
                .collect();
            params
                .as_object_mut()
                .unwrap()
                .insert("attachments".into(), serde_json::Value::Array(wire_attachments));
        }
    }

    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Not connected")?;

    let result = gw
        .rpc("chat.send", params)
        .await
        .map_err(|e| {
            log::error!("chat.send RPC error: {}", e);
            e.to_string()
        })?;

    log::info!(
        "chat.send response: {}",
        &result.to_string()[..result.to_string().len().min(500)]
    );

    Ok(serde_json::json!({ "rpc": result }))
}

/// Steer a running agent: injects guidance into the active run instead of
/// queueing a new turn (sessions.steer interrupts; sessions.send waits).
#[tauri::command]
pub async fn steer_message(
    session_id: String,
    message: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Not connected")?;

    log::info!("sessions.steer: key={}", session_id);

    gw.rpc(
        "sessions.steer",
        serde_json::json!({
            "key": session_id,
            "message": message,
            "idempotencyKey": uuid::Uuid::new_v4().to_string(),
        }),
    )
    .await
    .map_err(|e| {
        log::error!("sessions.steer RPC error: {}", e);
        e.to_string()
    })
}

#[tauri::command]
pub async fn get_history(
    session_id: String,
    limit: Option<u32>,
    before: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<ChatMessage>, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Not connected")?;

    let mut params = serde_json::json!({
        "sessionKey": session_id,
        "limit": limit.unwrap_or(50),
    });
    if let Some(b) = before {
        params
            .as_object_mut()
            .unwrap()
            .insert("before".into(), serde_json::json!(b));
    }

    let result = gw
        .rpc("chat.history", params)
        .await
        .map_err(|e| {
            log::error!("chat.history RPC error: {}", e);
            e.to_string()
        })?;

    log::debug!(
        "chat.history response keys: {:?}",
        result
            .as_object()
            .map(|o| o.keys().collect::<Vec<_>>())
    );

    let messages: Vec<ChatMessage> = if let Some(msgs) = result.get("messages") {
        if let Some(arr) = msgs.as_array() {
            arr.iter()
                .filter_map(|m| {
                    let role = m
                        .get("role")
                        .and_then(|r| r.as_str())
                        .unwrap_or("assistant");
                    let content = m.get("content").or_else(|| m.get("text"));
                    let content_str = match content {
                        Some(serde_json::Value::String(s)) => s.clone(),
                        Some(serde_json::Value::Array(arr)) => {
                            // Content can be array of {type: "text", text: "..."}
                            arr.iter()
                                .filter_map(|item| {
                                    item.get("text")
                                        .and_then(|t| t.as_str())
                                        .map(|s| s.to_string())
                                })
                                .collect::<Vec<_>>()
                                .join("\n")
                        }
                        _ => return None,
                    };
                    if content_str.is_empty() {
                        return None;
                    }
                    let timestamp = m
                        .get("timestamp")
                        .or_else(|| m.get("ts"))
                        .map(|t| match t {
                            serde_json::Value::String(s) => s.clone(),
                            serde_json::Value::Number(n) => n.to_string(),
                            _ => String::new(),
                        })
                        .unwrap_or_default();
                    Some(ChatMessage {
                        id: m
                            .get("id")
                            .and_then(|i| i.as_str())
                            .unwrap_or("")
                            .to_string(),
                        role: role.to_string(),
                        content: content_str,
                        timestamp,
                        session_id: session_id.clone(),
                        message_type: m
                            .get("type")
                            .and_then(|t| t.as_str())
                            .map(|s| s.to_string()),
                    })
                })
                .collect()
        } else {
            Vec::new()
        }
    } else {
        log::warn!("chat.history: no 'messages' key in response");
        Vec::new()
    };

    state
        .messages
        .lock()
        .await
        .insert(session_id, messages.clone());

    Ok(messages)
}

#[tauri::command]
pub async fn set_model(
    session_id: String,
    model: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Not connected")?;

    log::info!("sessions.patch: key={}, model={}", session_id, model);

    let result = gw
        .rpc(
            "sessions.patch",
            serde_json::json!({
                "key": session_id,
                "model": model,
            }),
        )
        .await
        .map_err(|e| {
            log::error!("sessions.patch RPC error: {}", e);
            e.to_string()
        })?;

    log::info!(
        "sessions.patch response: {}",
        &result.to_string()[..result.to_string().len().min(500)]
    );
    Ok(result)
}

/// Download a file from the remote server via SSH and return its base64-encoded content.
/// Used for legacy media paths in old messages and for fetching tts.convert output.
#[tauri::command]
pub async fn download_remote_file(
    path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let tunnel = state.ssh_tunnel.lock().await;
    let ssh = tunnel.as_ref().ok_or("SSH not connected")?;

    // Reject paths with traversal attempts
    if path.contains("..") {
        return Err("Path traversal not allowed".into());
    }

    // Expand ~ to $HOME so it works with shell_escape
    let resolved_path = if path.starts_with("~/") {
        // Can't shell_escape $HOME expansion, so resolve it first
        let home = ssh
            .exec("echo $HOME")
            .await
            .map_err(|e| format!("Failed to get HOME: {}", e))?;
        format!("{}/{}", home.trim(), &path[2..])
    } else {
        path.clone()
    };

    // Read file and base64-encode it on the server (avoids binary over SSH exec)
    let cmd = format!("base64 -w0 {}", crate::ssh::tunnel::shell_escape(&resolved_path));
    let b64 = ssh
        .exec(&cmd)
        .await
        .map_err(|e| format!("download failed: {}", e))?;

    if b64.is_empty() {
        return Err(format!("File not found or empty: {}", path));
    }

    Ok(b64)
}

#[tauri::command]
pub async fn cancel_run(
    session_id: String,
    run_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Not connected")?;

    // Protocol v4 renamed chat.cancel to chat.abort; fall back for older gateways.
    let method = {
        let info = state.gateway_info.lock().await;
        match info.as_ref() {
            Some(i) if !i.has_method("chat.abort") && i.has_method("chat.cancel") => "chat.cancel",
            _ => "chat.abort",
        }
    };

    log::info!("{}: sessionKey={}, runId={}", method, session_id, run_id);

    gw.rpc(
        method,
        serde_json::json!({
            "sessionKey": session_id,
            "runId": run_id,
        }),
    )
    .await
    .map_err(|e| {
        log::error!("{} RPC error: {}", method, e);
        e.to_string()
    })
}

#[tauri::command]
pub async fn inject_message(
    session_id: String,
    role: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Not connected")?;

    gw.rpc(
        "chat.inject",
        serde_json::json!({
            "sessionId": session_id,
            "role": role,
            "content": content,
        }),
    )
    .await
    .map_err(|e| e.to_string())
}
