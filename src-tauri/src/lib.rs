mod commands;
mod crypto;
mod error;
mod events;
mod gateway;
mod ssh;
mod state;

use std::sync::atomic::Ordering;
use state::app_state::AppState;
use tauri::Manager;
use tauri::tray::TrayIconBuilder;
use tauri::menu::{MenuBuilder, MenuItemBuilder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("deskclaw=debug"))
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .setup(|app| {
            // On macOS, enable decorations so native traffic light buttons appear.
            #[cfg(target_os = "macos")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_decorations(true);
                }
            }

            // System tray
            let show_item = MenuItemBuilder::with_id("show", "Show DeskClaw").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().unwrap())
                .tooltip("DeskClaw")
                .menu(&tray_menu)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                if state.close_to_tray.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
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
            commands::settings::set_close_to_tray,
            commands::crypto::encrypt_string,
            commands::crypto::decrypt_string,
            commands::updates::check_for_updates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running deskclaw");
}
