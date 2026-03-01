use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::RngCore;

/// Encrypt plaintext with a 32-byte key using AES-256-GCM.
/// Returns hex-encoded `nonce(12 bytes) || ciphertext || tag`.
pub fn encrypt(plaintext: &[u8], key: &[u8; 32]) -> Result<String, String> {
    let cipher = Aes256Gcm::new(key.into());

    let mut nonce_bytes = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("encryption failed: {}", e))?;

    let mut combined = Vec::with_capacity(12 + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);

    Ok(hex::encode(combined))
}

/// Decrypt a hex-encoded `nonce || ciphertext || tag` with a 32-byte key.
pub fn decrypt(hex_data: &str, key: &[u8; 32]) -> Result<Vec<u8>, String> {
    let data = hex::decode(hex_data).map_err(|e| format!("hex decode failed: {}", e))?;

    if data.len() < 12 {
        return Err("encrypted data too short".into());
    }

    let (nonce_bytes, ciphertext) = data.split_at(12);
    let cipher = Aes256Gcm::new(key.into());
    let nonce = Nonce::from_slice(nonce_bytes);

    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("decryption failed: {}", e))
}
