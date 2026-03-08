use sha2::{Sha256, Digest};
use std::path::PathBuf;
use tauri::Manager;
use zeroize::Zeroize;

/// Get or create a stable machine-local encryption key seed.
/// Stored in the app's config directory so it persists across sessions.
fn get_key_seed_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("failed to get config dir: {}", e))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("failed to create config dir: {}", e))?;
    Ok(dir.join(".vault_seed"))
}

fn get_encryption_key(app: &tauri::AppHandle) -> Result<[u8; 32], String> {
    let seed_path = get_key_seed_path(app)?;

    let seed = if seed_path.exists() {
        std::fs::read(&seed_path).map_err(|e| format!("failed to read seed: {}", e))?
    } else {
        use rand::RngCore;
        let mut seed = vec![0u8; 64];
        rand::rngs::OsRng.fill_bytes(&mut seed);

        // Write seed with restrictive permissions (owner-only on Unix)
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            use std::io::Write;
            let mut file = std::fs::OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .mode(0o600)
                .open(&seed_path)
                .map_err(|e| format!("failed to create seed file: {}", e))?;
            file.write_all(&seed)
                .map_err(|e| format!("failed to write seed: {}", e))?;
        }
        #[cfg(not(unix))]
        {
            std::fs::write(&seed_path, &seed)
                .map_err(|e| format!("failed to write seed: {}", e))?;
        }
        seed
    };

    // Derive a 32-byte AES key from the seed via SHA-256
    let key: [u8; 32] = Sha256::digest(&seed).into();
    Ok(key)
}

#[tauri::command]
pub async fn encrypt_string(
    app: tauri::AppHandle,
    value: String,
) -> Result<String, String> {
    let mut key = get_encryption_key(&app)?;
    let result = crate::crypto::vault::encrypt(value.as_bytes(), &key);
    key.zeroize();
    result
}

#[tauri::command]
pub async fn decrypt_string(
    app: tauri::AppHandle,
    encrypted: String,
) -> Result<String, String> {
    let mut key = get_encryption_key(&app)?;
    let result = crate::crypto::vault::decrypt(&encrypted, &key);
    key.zeroize();
    let plaintext = result?;
    String::from_utf8(plaintext).map_err(|e| format!("invalid utf-8: {}", e))
}
