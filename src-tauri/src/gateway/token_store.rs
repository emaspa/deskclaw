//! Persists gateway-issued device tokens per host so reconnects reuse the
//! paired identity (and its approved scope set) instead of re-pairing.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

fn store_path(config_dir: &Path) -> PathBuf {
    config_dir.join("device_tokens.json")
}

fn read_all(config_dir: &Path) -> HashMap<String, String> {
    let path = store_path(config_dir);
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_all(config_dir: &Path, tokens: &HashMap<String, String>) {
    let path = store_path(config_dir);
    if let Err(e) = std::fs::create_dir_all(config_dir) {
        log::warn!("could not create config dir for device tokens: {}", e);
        return;
    }
    match serde_json::to_string_pretty(tokens) {
        Ok(json) => {
            if let Err(e) = std::fs::write(&path, json) {
                log::warn!("could not persist device tokens: {}", e);
            }
        }
        Err(e) => log::warn!("could not serialize device tokens: {}", e),
    }
}

pub fn load(config_dir: &Path, host: &str) -> Option<String> {
    read_all(config_dir).get(host).cloned().filter(|t| !t.is_empty())
}

pub fn save(config_dir: &Path, host: &str, token: &str) {
    if token.is_empty() {
        return;
    }
    let mut tokens = read_all(config_dir);
    if tokens.get(host).map(|t| t.as_str()) == Some(token) {
        return;
    }
    tokens.insert(host.to_string(), token.to_string());
    write_all(config_dir, &tokens);
}

pub fn clear(config_dir: &Path, host: &str) {
    let mut tokens = read_all(config_dir);
    if tokens.remove(host).is_some() {
        write_all(config_dir, &tokens);
    }
}
