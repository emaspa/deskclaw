mod commands;
mod crypto;
mod error;
mod events;
mod gateway;
mod ssh;
mod state;

use state::app_state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("deskclaw=debug"))
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .setup(|app| {
            // On macOS, enable decorations so native traffic light buttons appear.
            // titleBarStyle "overlay" in tauri.conf.json makes them overlay our content.
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_decorations(true);
                }
            }
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::connection::connect_ssh,
            commands::connection::disconnect_ssh,
            commands::connection::get_connection_status,
            commands::sessions::list_sessions,
            commands::sessions::get_session_preview,
            commands::sessions::get_agent_identity,
            commands::sessions::list_models,
            commands::chat::send_message,
            commands::chat::get_history,
            commands::chat::inject_message,
            commands::chat::set_model,
            commands::chat::download_remote_file,
            commands::settings::save_settings,
            commands::settings::load_settings,
            commands::crypto::encrypt_string,
            commands::crypto::decrypt_string,
        ])
        .run(tauri::generate_context!())
        .expect("error while running deskclaw");
}
