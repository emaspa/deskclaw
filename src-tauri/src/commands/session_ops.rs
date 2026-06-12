//! Session lifecycle, usage, agent, and TTS commands built on the v4 gateway
//! method surface. All return raw gateway payloads; the frontend parses
//! defensively so schema drift degrades gracefully.

use crate::state::app_state::AppState;
use tauri::State;

async fn rpc(
    state: &State<'_, AppState>,
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let gateway = state.gateway.lock().await;
    let gw = gateway.as_ref().ok_or("Not connected")?;
    gw.rpc(method, params).await.map_err(|e| {
        log::error!("{} RPC error: {}", method, e);
        e.to_string()
    })
}

#[tauri::command]
pub async fn create_session(
    label: Option<String>,
    agent_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let mut params = serde_json::Map::new();
    if let Some(l) = label.filter(|l| !l.is_empty()) {
        params.insert("label".into(), serde_json::json!(l));
    }
    if let Some(a) = agent_id.filter(|a| !a.is_empty()) {
        params.insert("agentId".into(), serde_json::json!(a));
    }
    rpc(&state, "sessions.create", serde_json::Value::Object(params)).await
}

#[tauri::command]
pub async fn delete_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    rpc(
        &state,
        "sessions.delete",
        serde_json::json!({ "key": session_id, "deleteTranscript": true }),
    )
    .await
}

#[tauri::command]
pub async fn reset_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    rpc(&state, "sessions.reset", serde_json::json!({ "key": session_id })).await
}

#[tauri::command]
pub async fn compact_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    rpc(&state, "sessions.compact", serde_json::json!({ "key": session_id })).await
}

#[tauri::command]
pub async fn get_session_usage(
    session_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let mut params = serde_json::Map::new();
    if let Some(key) = session_id.filter(|k| !k.is_empty()) {
        params.insert("key".into(), serde_json::json!(key));
    } else {
        params.insert("agentScope".into(), serde_json::json!("all"));
    }
    rpc(&state, "sessions.usage", serde_json::Value::Object(params)).await
}

#[tauri::command]
pub async fn get_usage_cost(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    rpc(&state, "usage.cost", serde_json::json!({ "agentScope": "all" })).await
}

#[tauri::command]
pub async fn list_agents(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    rpc(&state, "agents.list", serde_json::json!({})).await
}

/// One-shot text-to-speech. Returns `{ audioPath, provider, outputFormat, ... }`
/// where audioPath is a file on the gateway host (fetch via download_remote_file).
#[tauri::command]
pub async fn tts_convert(
    text: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    rpc(&state, "tts.convert", serde_json::json!({ "text": text })).await
}

/// Gateway features and limits captured from the hello-ok handshake.
#[tauri::command]
pub async fn get_gateway_info(
    state: State<'_, AppState>,
) -> Result<Option<crate::state::app_state::GatewayInfo>, String> {
    Ok(state.gateway_info.lock().await.clone())
}
