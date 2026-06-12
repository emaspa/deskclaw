use ed25519_dalek::{SigningKey, Signer};
use rand::rngs::OsRng;
use sha2::{Sha256, Digest};
use std::path::{Path, PathBuf};

// Gateway client identity constants. `client.id` must be one of the gateway's
// canonical ids (closed enum); "gateway-client" + mode "backend" is the designed
// path for local backend RPC clients connecting over the loopback tunnel, which
// skips device pairing approval when shared-secret auth succeeds.
pub const CLIENT_ID: &str = "gateway-client";
pub const CLIENT_MODE: &str = "backend";
pub const CLIENT_DISPLAY_NAME: &str = "DeskClaw";
pub const ROLE: &str = "operator";
pub const SCOPES: &[&str] = &["operator.read", "operator.write", "operator.admin"];
pub const DEVICE_FAMILY: &str = "desktop";

pub fn platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

pub struct DeviceIdentity {
    signing_key: SigningKey,
    device_id: String,
}

impl DeviceIdentity {
    fn from_signing_key(signing_key: SigningKey) -> Self {
        // Device ID = SHA-256(raw_public_key_bytes) as hex
        let pub_bytes = signing_key.verifying_key().to_bytes();
        let device_id = hex::encode(Sha256::digest(pub_bytes));
        Self { signing_key, device_id }
    }

    pub fn generate() -> Self {
        Self::from_signing_key(SigningKey::generate(&mut OsRng))
    }

    fn key_path(config_dir: &Path) -> PathBuf {
        config_dir.join(".device_key")
    }

    /// Load the persistent device key from the config dir, creating it on first
    /// run. A stable key gives the gateway a stable device id, so the pairing
    /// approval and issued device tokens survive across restarts.
    pub fn load_or_create(config_dir: &Path) -> Self {
        let path = Self::key_path(config_dir);

        if let Ok(bytes) = std::fs::read(&path) {
            if bytes.len() == 32 {
                let seed: [u8; 32] = bytes.try_into().unwrap();
                return Self::from_signing_key(SigningKey::from_bytes(&seed));
            }
            log::warn!("device key file has unexpected size, regenerating");
        }

        let identity = Self::generate();
        if let Err(e) = std::fs::create_dir_all(config_dir) {
            log::warn!("could not create config dir for device key: {}", e);
        }
        let seed = identity.signing_key.to_bytes();
        let write_result = {
            #[cfg(unix)]
            {
                use std::io::Write;
                use std::os::unix::fs::OpenOptionsExt;
                std::fs::OpenOptions::new()
                    .write(true)
                    .create(true)
                    .truncate(true)
                    .mode(0o600)
                    .open(&path)
                    .and_then(|mut f| f.write_all(&seed))
            }
            #[cfg(not(unix))]
            {
                std::fs::write(&path, seed)
            }
        };
        if let Err(e) = write_result {
            log::warn!("could not persist device key (using ephemeral identity): {}", e);
        } else {
            log::info!("generated new persistent device identity: {}", identity.device_id);
        }
        identity
    }

    pub fn device_id(&self) -> &str {
        &self.device_id
    }

    /// Build v3 pipe-delimited signing payload:
    /// v3|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce|platform|deviceFamily
    /// `token` must be whichever credential is sent in connect.params.auth
    /// (gateway token or device token) — the gateway compares byte-for-byte.
    pub fn build_signing_payload(
        &self,
        token: &str,
        nonce: &str,
        signed_at_ms: u64,
    ) -> String {
        format!(
            "v3|{}|{}|{}|{}|{}|{}|{}|{}|{}|{}",
            self.device_id,
            CLIENT_ID,
            CLIENT_MODE,
            ROLE,
            SCOPES.join(","),
            signed_at_ms,
            token,
            nonce,
            platform(),
            DEVICE_FAMILY
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
