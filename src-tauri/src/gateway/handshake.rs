use crate::crypto::identity::{self, DeviceIdentity};
use crate::gateway::protocol::*;
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message;

/// Gateway protocol version this client speaks. Current gateways require v4
/// (MIN_CLIENT_PROTOCOL_VERSION = 4) and reject anything older.
pub const PROTOCOL_VERSION: u64 = 4;

/// Parsed hello-ok payload returned by a successful connect.
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct HandshakeResult {
    pub device_token: String,
    pub protocol: u64,
    pub methods: Vec<String>,
    pub events: Vec<String>,
    pub max_payload: u64,
    pub tick_interval_ms: u64,
}

/// Which credential to present in connect.params.auth. The signing payload
/// must embed the same value the gateway resolves for signature checking.
pub enum AuthCredential<'a> {
    GatewayToken(&'a str),
    DeviceToken(&'a str),
}

pub async fn perform_handshake<S>(
    ws_stream: &mut S,
    identity: &DeviceIdentity,
    credential: &AuthCredential<'_>,
) -> Result<HandshakeResult, crate::error::AppError>
where
    S: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>>
        + SinkExt<Message>
        + Unpin,
    <S as futures_util::Sink<Message>>::Error: std::fmt::Display,
{
    // 1. Wait for connect.challenge event
    let challenge_msg = ws_stream
        .next()
        .await
        .ok_or(crate::error::AppError::Gateway(
            "No challenge received".into(),
        ))?
        .map_err(|e| crate::error::AppError::Gateway(e.to_string()))?;

    let challenge_text = challenge_msg
        .to_text()
        .map_err(|e| crate::error::AppError::Gateway(e.to_string()))?;

    log::info!("Challenge received: {}", challenge_text);

    let challenge: GatewayMessage = serde_json::from_str(challenge_text)
        .map_err(|e| crate::error::AppError::Gateway(format!("Parse challenge: {}", e)))?;

    let nonce = match &challenge {
        GatewayMessage::Event { event, payload } if event == "connect.challenge" => payload
            .get("nonce")
            .and_then(|n| n.as_str())
            .ok_or(crate::error::AppError::Gateway("Missing nonce in challenge".into()))?
            .to_string(),
        _ => {
            return Err(crate::error::AppError::Gateway(
                format!("Expected connect.challenge event, got: {}", challenge_text),
            ))
        }
    };

    // 2. Build signing payload and sign it
    let signed_at_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    let signing_token = match credential {
        AuthCredential::GatewayToken(t) | AuthCredential::DeviceToken(t) => *t,
    };
    let signing_payload = identity.build_signing_payload(signing_token, &nonce, signed_at_ms);
    let signature = identity.sign(signing_payload.as_bytes());
    let public_key = identity.public_key_base64url();
    let device_id = identity.device_id();

    log::info!("Device ID: {}", device_id);

    let auth = match credential {
        AuthCredential::GatewayToken(t) => serde_json::json!({ "token": t }),
        AuthCredential::DeviceToken(t) => serde_json::json!({ "deviceToken": t }),
    };

    // 3. Send connect request
    let connect_req = GatewayMessage::Request {
        id: uuid::Uuid::new_v4().to_string(),
        method: "connect".to_string(),
        params: serde_json::json!({
            "minProtocol": PROTOCOL_VERSION,
            "maxProtocol": PROTOCOL_VERSION,
            "client": {
                "id": identity::CLIENT_ID,
                "displayName": identity::CLIENT_DISPLAY_NAME,
                "version": env!("CARGO_PKG_VERSION"),
                "platform": identity::platform(),
                "mode": identity::CLIENT_MODE,
                "deviceFamily": identity::DEVICE_FAMILY
            },
            "role": identity::ROLE,
            "scopes": identity::SCOPES,
            "auth": auth,
            "device": {
                "id": device_id,
                "publicKey": public_key,
                "signature": signature,
                "signedAt": signed_at_ms,
                "nonce": nonce
            }
        }),
    };

    let req_text = serde_json::to_string(&connect_req)
        .map_err(|e| crate::error::AppError::Gateway(e.to_string()))?;

    log::info!("Sending connect request (protocol v{}, credentials redacted)", PROTOCOL_VERSION);

    ws_stream
        .send(Message::Text(req_text.into()))
        .await
        .map_err(|e| crate::error::AppError::Gateway(e.to_string()))?;

    // 4. Wait for the connect response (a res frame whose payload is hello-ok)
    let response_msg = ws_stream
        .next()
        .await
        .ok_or(crate::error::AppError::Gateway(
            "No response received after connect".into(),
        ))?
        .map_err(|e| crate::error::AppError::Gateway(e.to_string()))?;

    let response_text = response_msg
        .to_text()
        .map_err(|e| crate::error::AppError::Gateway(e.to_string()))?;

    log::info!("Connect response received, {} bytes", response_text.len());

    let response: GatewayMessage = serde_json::from_str(response_text)
        .map_err(|e| crate::error::AppError::Gateway(format!("Parse response: {}", e)))?;

    match response {
        GatewayMessage::Response {
            ok: true,
            payload: Some(payload),
            ..
        } => Ok(parse_hello_ok(&payload)),
        GatewayMessage::Response {
            ok: false,
            error: Some(err),
            ..
        } => Err(crate::error::AppError::Gateway(format!(
            "Handshake failed: {}",
            extract_error_message(&err)
        ))),
        GatewayMessage::Response {
            ok: false,
            error: None,
            payload,
            ..
        } => {
            let detail = payload
                .map(|p| p.to_string())
                .unwrap_or_else(|| "unknown error".into());
            Err(crate::error::AppError::Gateway(format!(
                "Handshake rejected: {}",
                detail
            )))
        }
        _ => Err(crate::error::AppError::Gateway(format!(
            "Unexpected response: {}",
            response_text
        ))),
    }
}

fn parse_hello_ok(payload: &serde_json::Value) -> HandshakeResult {
    let str_array = |v: Option<&serde_json::Value>| -> Vec<String> {
        v.and_then(|a| a.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|s| s.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default()
    };

    HandshakeResult {
        device_token: payload
            .get("auth")
            .and_then(|a| a.get("deviceToken"))
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .to_string(),
        protocol: payload.get("protocol").and_then(|p| p.as_u64()).unwrap_or(0),
        methods: str_array(payload.get("features").and_then(|f| f.get("methods"))),
        events: str_array(payload.get("features").and_then(|f| f.get("events"))),
        max_payload: payload
            .get("policy")
            .and_then(|p| p.get("maxPayload"))
            .and_then(|v| v.as_u64())
            .unwrap_or(25 * 1024 * 1024),
        tick_interval_ms: payload
            .get("policy")
            .and_then(|p| p.get("tickIntervalMs"))
            .and_then(|v| v.as_u64())
            .unwrap_or(30_000),
    }
}
