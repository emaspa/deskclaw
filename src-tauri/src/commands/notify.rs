//! Native desktop notifications with proper app attribution.
//!
//! The notification plugin only sets an AppUserModelID when the exe runs from
//! an installed location, and Windows shows a friendly name for that ID only
//! if it's registered — otherwise toasts get attributed to "Windows
//! PowerShell". We register our own AUMID under HKCU (no admin needed) with a
//! display name that can be updated to the connected agent's name (e.g.
//! "Luna"), and send toasts through it directly.

use tauri::Manager;
#[cfg(windows)]
use tauri::Emitter;

const AUMID: &str = "com.deskclaw.app";
const DEFAULT_NAME: &str = "DeskClaw";

/// Current attribution name, shared with the Linux appname path.
pub struct NotifyIdentity(pub std::sync::Mutex<String>);

impl Default for NotifyIdentity {
    fn default() -> Self {
        Self(std::sync::Mutex::new(DEFAULT_NAME.to_string()))
    }
}

/// Write the bundled icon to the config dir so the registry can reference a
/// stable file path (toast icons must be file paths, not embedded resources).
fn ensure_icon(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    let path = dir.join("notification-icon.png");
    if !path.exists() {
        std::fs::write(&path, include_bytes!("../../icons/128x128.png")).ok()?;
    }
    Some(path)
}

/// Register (or update) the AUMID under HKCU so Windows attributes our toasts
/// to `display_name` instead of "Windows PowerShell".
#[cfg(windows)]
fn register_aumid(app: &tauri::AppHandle, display_name: &str) -> Result<(), String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey(format!(r"Software\Classes\AppUserModelId\{}", AUMID))
        .map_err(|e| format!("registry open failed: {}", e))?;
    key.set_value("DisplayName", &display_name)
        .map_err(|e| format!("registry write failed: {}", e))?;
    if let Some(icon) = ensure_icon(app) {
        let _ = key.set_value("IconUri", &icon.to_string_lossy().to_string());
    }
    Ok(())
}

/// Called from lib.rs setup so notifications are attributed correctly from
/// the first toast, before any agent identity is known.
pub fn init(app: &tauri::AppHandle) {
    #[cfg(windows)]
    if let Err(e) = register_aumid(app, DEFAULT_NAME) {
        log::warn!("notification AUMID registration failed: {}", e);
    }
    #[cfg(not(windows))]
    {
        let _ = ensure_icon(app);
    }
}

/// Update the attribution name to the connected agent's identity.
#[tauri::command]
pub async fn set_notification_identity(
    name: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, NotifyIdentity>,
) -> Result<(), String> {
    let name = name.trim();
    let name = if name.is_empty() { DEFAULT_NAME } else { name };
    *state.0.lock().unwrap() = name.to_string();
    #[cfg(windows)]
    register_aumid(&app, name)?;
    #[cfg(not(windows))]
    let _ = &app;
    log::info!("notification identity set to {}", name);
    Ok(())
}

#[tauri::command]
pub async fn send_native_notification(
    title: String,
    body: String,
    session_id: Option<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, NotifyIdentity>,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        let _ = &state;
        let app_handle = app.clone();
        tauri_winrt_notification::Toast::new(AUMID)
            .title(&title)
            .text1(&body)
            .on_activated(move |_action| {
                // Clicking the toast brings the chat window to the front and
                // navigates to the session the message arrived in.
                if let Some(w) = app_handle.get_webview_window("main") {
                    let _ = w.unminimize();
                    let _ = w.show();
                    let _ = w.set_focus();
                }
                if let Some(sid) = &session_id {
                    let _ = app_handle.emit("notification-clicked", sid.clone());
                }
                Ok(())
            })
            .show()
            .map_err(|e| format!("notification failed: {}", e))
    }

    #[cfg(not(windows))]
    {
        let _ = &session_id; // click-to-navigate is Windows-only for now
        let mut notification = notify_rust::Notification::new();
        notification.summary(&title).body(&body);
        #[cfg(all(unix, not(target_os = "macos")))]
        {
            notification.appname(&state.0.lock().unwrap().clone());
            if let Some(icon) = ensure_icon(&app) {
                notification.icon(&icon.to_string_lossy());
            }
        }
        #[cfg(target_os = "macos")]
        {
            let _ = (&state, &app);
        }
        notification
            .show()
            .map(|_| ())
            .map_err(|e| format!("notification failed: {}", e))
    }
}
