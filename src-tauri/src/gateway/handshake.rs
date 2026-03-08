use crate::crypto::identity::DeviceIdentity;
use crate::gateway::protocol::*;
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message;

pub async fn perform_handshake<S>(
    ws_stream: &mut S,
    identity: &DeviceIdentity,
    token: &str,
) -> Result<String, crate::error::AppError>
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

    let signing_payload = identity.build_signing_payload(token, &nonce, signed_at_ms);
    log::debug!("Signing payload length: {} bytes", signing_payload.len());
    let signature = identity.sign(signing_payload.as_bytes());
    let public_key = identity.public_key_base64url();
    let device_id = identity.device_id();

    log::info!("Device ID: {}", device_id);
    log::debug!("Public key (base64url): {}...", &public_key[..public_key.len().min(12)]);
    log::debug!("Signature: {} bytes", signature.len());

    // 3. Send connect request with proper structure
    let connect_req = GatewayMessage::Request {
        id: uuid::Uuid::new_v4().to_string(),
        method: "connect".to_string(),
        params: serde_json::json!({
            "minProtocol": 3,
            "maxProtocol": 3,
            "client": {
                "id": "gateway-client",
                "version": "0.1.0",
                "platform": "windows",
                "mode": "backend",
                "deviceFamily": "desktop"
            },
            "role": "operator",
            "scopes": ["operator.read", "operator.write", "operator.admin"],
            "auth": {
                "token": token
            },
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

    log::info!("Sending connect request (token redacted), {} bytes", req_text.len());

    ws_stream
        .send(Message::Text(req_text.into()))
        .await
        .map_err(|e| crate::error::AppError::Gateway(e.to_string()))?;

    // 4. Wait for hello-ok response
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
        } => {
            // Extract device token from payload.auth.deviceToken
            let device_token = payload
                .get("auth")
                .and_then(|a| a.get("deviceToken"))
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string();
            Ok(device_token)
        }
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
