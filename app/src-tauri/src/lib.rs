mod desktop;
use desktop::*;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}



#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_upload::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_blinko::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(create_global_shortcut_handler())
                    .build()
            );
    }

    #[cfg(target_os = "windows")]
    {
        builder = builder.plugin(tauri_plugin_decorum::init());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            greet,
            toggle_editor_window,
            register_hotkey,
            unregister_hotkey,
            get_registered_shortcuts,
            toggle_quicknote_window,
            resize_quicknote_window,
            toggle_quickai_window,
            resize_quickai_window,
            navigate_main_to_ai_with_prompt,
            is_autostart_enabled,
            enable_autostart,
            disable_autostart,
            toggle_autostart
        ])
        .setup(|app| {
            setup_app(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}