use russh_keys::key::KeyPair;
use std::path::Path;
use std::sync::Arc;

pub enum SshAuth {
    Password(String),
    KeyFile {
        path: String,
        passphrase: Option<String>,
    },
}

pub fn load_private_key(
    path: &str,
    passphrase: Option<&str>,
) -> Result<Arc<KeyPair>, crate::error::AppError> {
    let key = russh_keys::load_secret_key(Path::new(path), passphrase)
        .map_err(|e: russh_keys::Error| crate::error::AppError::SshKey(e.to_string()))?;
    Ok(Arc::new(key))
}
