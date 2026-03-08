use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum GatewayMessage {
    #[serde(rename = "req")]
    Request {
        id: String,
        method: String,
        #[serde(default)]
        params: Value,
    },
    #[serde(rename = "res")]
    Response {
        id: String,
        #[serde(default)]
        ok: bool,
        #[serde(default)]
        payload: Option<Value>,
        #[serde(default)]
        error: Option<Value>,
    },
    #[serde(rename = "event")]
    Event {
        event: String,
        #[serde(default)]
        payload: Value,
    },
}

/// Extract a human-readable error message from the gateway error value.
/// The error can be structured as:
///   { "message": "...", "details": { "code": "STRING_CODE", "reason": "..." } }
/// or any other shape - we try our best to extract useful info.
pub fn extract_error_message(error: &Value) -> String {
    if let Some(msg) = error.get("message").and_then(|v| v.as_str()) {
        let code = error
            .get("details")
            .and_then(|d| d.get("code"))
            .and_then(|c| c.as_str())
            .unwrap_or("");
        if code.is_empty() {
            msg.to_string()
        } else {
            format!("{}: {}", code, msg)
        }
    } else if let Some(s) = error.as_str() {
        s.to_string()
    } else {
        error.to_string()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionListResult {
    pub sessions: Vec<SessionEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionEntry {
    #[serde(default, rename = "sessionId")]
    pub session_id: String,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default, alias = "modelId")]
    pub model: Option<String>,
    #[serde(default, rename = "modelProvider", alias = "provider")]
    pub model_provider: Option<String>,
    #[serde(default, rename = "displayName")]
    pub display_name: Option<String>,
    #[serde(default, rename = "lastChannel")]
    pub last_channel: Option<String>,
    #[serde(default, rename = "updatedAt")]
    pub updated_at: Option<u64>,
    #[serde(default, rename = "totalTokens")]
    pub total_tokens: Option<u64>,
    #[serde(default, rename = "contextTokens")]
    pub context_tokens: Option<u64>,
    #[serde(default, rename = "contextWindow")]
    pub context_window: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatHistoryResult {
    pub messages: Vec<ChatMessageEntry>,
    #[serde(default, rename = "hasMore")]
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessageEntry {
    pub id: String,
    pub role: String,
    pub content: String,
    pub timestamp: String,
    #[serde(default, rename = "messageType")]
    pub message_type: Option<String>,
}
