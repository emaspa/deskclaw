use ed25519_dalek::{SigningKey, Signer};
use rand::rngs::OsRng;
use sha2::{Sha256, Digest};

pub struct DeviceIdentity {
    signing_key: SigningKey,
    device_id: String,
}

impl DeviceIdentity {
    pub fn generate() -> Self {
        let signing_key = SigningKey::generate(&mut OsRng);
        // Device ID = SHA-256(raw_public_key_bytes) as hex
        let pub_bytes = signing_key.verifying_key().to_bytes();
        let device_id = hex::encode(Sha256::digest(pub_bytes));
        Self { signing_key, device_id }
    }

    pub fn device_id(&self) -> &str {
        &self.device_id
    }

    /// Build v3 pipe-delimited signing payload:
    /// v3|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce|platform|deviceFamily
    pub fn build_signing_payload(
        &self,
        token: &str,
        nonce: &str,
        signed_at_ms: u64,
    ) -> String {
        format!(
            "v3|{}|gateway-client|backend|operator|operator.read,operator.write,operator.admin|{}|{}|{}|windows|desktop",
            self.device_id, signed_at_ms, token, nonce
        )
    }

    pub fn sign(&self, message: &[u8]) -> String {
        use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
        let signature = self.signing_key.sign(message);
        URL_SAFE_NO_PAD.encode(signature.to_bytes())
    }

    pub fn public_key_base64url(&self) -> String {
        use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
        URL_SAFE_NO_PAD.encode(self.signing_key.verifying_key().to_bytes())
    }
}
