use crate::state::app_state::{AppState, ChatMessage};
use tauri::State;

#[derive(Debug, Clone, serde::Deserialize)]
pub struct Attachment {
    pub name: String,
    pub mime_type: String,
    pub data: String, // base64-encoded
}

/// Upload attachments to the remote server via SSH and return their absolute server-side paths.
/// Files are written to $HOME/.deskclaw/media/ on the server. A Python HTTP server on port 19284
/// serves these files so the agent can access them via URL.
async fn upload_attachments_ssh(
    attachments: &[Attachment],
    state: &State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let tunnel = state.ssh_tunnel.lock().await;
    let ssh = tunnel.as_ref().ok_or("SSH not connected")?;

    // Get the remote home directory for absolute paths
    let home_dir = ssh
        .exec("echo $HOME")
        .await
        .map_err(|e| format!("Failed to get remote HOME: {}", e))?;
    let home_dir = home_dir.trim().to_string();
    if home_dir.is_empty() {
        return Err("Could not determine remote home directory".into());
    }

    let media_dir = format!("{}/.deskclaw/media", home_dir);

    let mut paths = Vec::new();
    for att in attachments {
        let ext = att
            .name
            .rsplit('.')
            .next()
            .unwrap_or("bin")
            .to_lowercase();
        let uuid = uuid::Uuid::new_v4();
        let remote_path = format!("{}/{}.{}", media_dir, uuid, ext);

        // Decode base64 to raw bytes
        let raw_bytes = base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            &att.data,
        )
        .map_err(|e| format!("base64 decode error for {}: {}", att.name, e))?;

        log::info!(
            "Uploading attachment via SSH: {} -> {} ({} bytes)",
            att.name,
            remote_path,
            raw_bytes.len()
        );

        ssh.write_file(&remote_path, &raw_bytes)
            .await
            .map_err(|e| format!("SSH upload failed for {}: {}", att.name, e))?;

        // Verify file was written correctly
        let size_check = ssh
            .exec(&format!("stat -c%s {}", crate::ssh::tunnel::shell_escape(&remote_path)))
            .await
            .unwrap_or_default();
        let remote_size: usize = size_check.trim().parse().unwrap_or(0);
        if remote_size != raw_bytes.len() {
            log::error!(
                "SIZE MISMATCH for {}: wrote {} bytes, server has {} bytes",
                att.name, raw_bytes.len(), remote_size
            );
        } else {
            log::info!("Upload verified: {} bytes on server", remote_size);
        }

        paths.push(remote_path);
    }

    Ok(paths)
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

    // OpenClaw strips base64 RPC attachments for third-party gateway clients.
    // Instead, we upload files via SSH and serve them via a tunneled HTTP server.
    // The agent message includes the remote URL so the agent can fetch/read the image.
    let mut final_message = message.clone();
    let mut media_urls: Vec<String> = Vec::new();

    if let Some(atts) = &attachments {
        if !atts.is_empty() {
            match upload_attachments_ssh(atts, &state).await {
                Ok(paths) => {
                    // Get the local tunnel port for frontend display
                    let local_media_port = state.media_server_port.lock().await;

                    for (i, path) in paths.iter().enumerate() {
                        // Extract filename (uuid.ext) from the full path
                        let filename = path.rsplit('/').next().unwrap_or("");

                        log::info!("Attachment uploaded: {} -> {}", atts[i].name, path);

                        // Include the remote HTTP URL with context about file type
                        let url = format!("http://127.0.0.1:19284/{}", filename);
                        let mime = &atts[i].mime_type;
                        if mime.starts_with("audio/") {
                            final_message.push_str(
                                &format!("\n[Voice message (audio file): {}]", url)
                            );
                        } else if mime.starts_with("image/") {
                            final_message.push_str(&format!(" {}", url));
                        } else {
                            final_message.push_str(
                                &format!("\n[Attached file \"{}\": {}]", atts[i].name, url)
                            );
                        }

                        // Build local tunnel URL for the frontend to display
                        if let Some(port) = *local_media_port {
                            media_urls.push(
                                format!("http://127.0.0.1:{}/{}", port, filename)
                            );
                        }
                    }
                }
                Err(e) => {
                    log::warn!("SSH upload failed: {}", e);
                }
            }
        }
    }

    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Not connected")?;

    let params = serde_json::json!({
        "sessionKey": session_id,
        "message": final_message,
        "idempotencyKey": idempotency_key,
    });

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

    // Return the RPC result and tunneled media URLs for frontend inline rendering
    let mut response = serde_json::json!({ "rpc": result });
    if !media_urls.is_empty() {
        response.as_object_mut().unwrap().insert(
            "mediaUrls".into(),
            serde_json::Value::Array(media_urls.into_iter().map(serde_json::Value::String).collect()),
        );
    }
    Ok(response)
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
/// Used to display attachments in the chat that were previously uploaded.
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
    log::info!("chat.cancel: sessionKey={}, runId={}", session_id, run_id);

    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Not connected")?;

    gw.rpc(
        "chat.cancel",
        serde_json::json!({
            "sessionKey": session_id,
            "runId": run_id,
        }),
    )
    .await
    .map_err(|e| {
        log::error!("chat.cancel RPC error: {}", e);
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
