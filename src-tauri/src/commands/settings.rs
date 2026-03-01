use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppSettings {
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub auth_method: Option<String>,
    pub key_path: Option<String>,
}

#[tauri::command]
pub async fn save_settings(
    settings: AppSettings,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let app_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    let path = app_dir.join("settings.json");
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn load_settings(app: tauri::AppHandle) -> Result<AppSettings, String> {
    let app_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let path = app_dir.join("settings.json");
    if path.exists() {
        let json = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&json).map_err(|e| e.to_string())
    } else {
        Ok(AppSettings::default())
    }
}
