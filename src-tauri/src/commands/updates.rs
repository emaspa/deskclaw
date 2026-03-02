use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
    pub update_available: bool,
    pub latest_version: String,
    pub current_version: String,
    pub release_url: String,
}

#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION");

    let client = reqwest::Client::builder()
        .user_agent("deskclaw-update-checker")
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let resp = client
        .get("https://api.github.com/repos/emaspa/deskclaw/releases/latest")
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API returned {}", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("JSON parse error: {e}"))?;

    let tag = body["tag_name"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches('v');
    let release_url = body["html_url"]
        .as_str()
        .unwrap_or("https://github.com/emaspa/deskclaw/releases")
        .to_string();

    let update_available = version_is_newer(tag, current);

    Ok(UpdateInfo {
        update_available,
        latest_version: format!("v{tag}"),
        current_version: format!("v{current}"),
        release_url,
    })
}

fn version_is_newer(latest: &str, current: &str) -> bool {
    let parse = |v: &str| -> Vec<u32> {
        v.split('.').filter_map(|s| s.parse().ok()).collect()
    };
    parse(latest) > parse(current)
}
