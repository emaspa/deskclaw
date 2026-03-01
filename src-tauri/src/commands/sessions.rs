use crate::state::app_state::{AppState, SessionInfo};
use tauri::State;

#[tauri::command]
pub async fn list_sessions(state: State<'_, AppState>) -> Result<Vec<SessionInfo>, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Not connected")?;

    let result = gw
        .rpc("sessions.list", serde_json::json!({}))
        .await
        .map_err(|e| {
            log::error!("sessions.list RPC error: {}", e);
            e.to_string()
        })?;

    log::info!("sessions.list response: {}", result);

    // Try to parse as structured result, fall back to raw
    let sessions: Vec<SessionInfo> = if let Some(sessions_arr) = result.get("sessions") {
        let parsed: crate::gateway::protocol::SessionListResult =
            serde_json::from_value(serde_json::json!({"sessions": sessions_arr}))
                .map_err(|e| {
                    log::error!("Failed to parse sessions: {}", e);
                    e.to_string()
                })?;
        parsed
            .sessions
            .into_iter()
            .map(|s| SessionInfo {
                id: s.session_id,
                key: s.key,
                kind: s.kind,
                model: s.model,
                display_name: s.display_name,
                last_channel: s.last_channel,
                updated_at: s.updated_at,
                total_tokens: s.total_tokens,
                context_tokens: s.context_tokens,
                context_window: s.context_window,
                model_provider: s.model_provider,
            })
            .collect()
    } else {
        Vec::new()
    };

    *state.sessions.lock().await = sessions.clone();
    Ok(sessions)
}

#[tauri::command]
pub async fn list_models(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Not connected")?;

    let result = gw
        .rpc("models.list", serde_json::json!({}))
        .await
        .map_err(|e| {
            log::error!("models.list RPC error: {}", e);
            e.to_string()
        })?;

    log::info!("models.list response: {}", &result.to_string()[..result.to_string().len().min(1000)]);
    Ok(result)
}

#[tauri::command]
pub async fn get_agent_identity(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Not connected")?;

    let result = gw
        .rpc("agent.identity.get", serde_json::json!({}))
        .await
        .map_err(|e| {
            log::error!("agent.identity.get RPC error: {}", e);
            e.to_string()
        })?;

    log::info!("agent.identity.get response: {}", &result.to_string()[..result.to_string().len().min(500)]);
    Ok(result)
}

#[tauri::command]
pub async fn get_session_preview(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Not connected")?;

    gw.rpc(
        "sessions.preview",
        serde_json::json!({ "sessionId": session_id }),
    )
    .await
    .map_err(|e| e.to_string())
}
