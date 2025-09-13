use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
use tauri_plugin_decorum::WebviewWindowExt;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri_plugin_global_shortcut::{ShortcutState, ShortcutEvent};

use crate::desktop::{HotkeyConfig, setup_default_shortcuts, setup_system_tray, toggle_quicknote_window, restore_main_window_state, setup_window_state_monitoring};

pub fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle();
    let main_window = app.get_webview_window("main").unwrap();

    // Set platform-specific window decorations
    #[cfg(target_os = "macos")]
    {
        // On macOS, use native decorations
        main_window.set_decorations(true).unwrap();
    }

    #[cfg(any(target_os = "windows", target_os = "linux"))]
    {
        // On Windows and Linux, hide decorations
        main_window.set_decorations(false).unwrap();
    }

    // Apply Windows-specific titlebar
    #[cfg(target_os = "windows")]
    {
        main_window.create_overlay_titlebar().unwrap();
    }

    // Restore window state first
    restore_main_window_state(&app_handle);
    
    // Setup window state monitoring
    setup_window_state_monitoring(&app_handle);

    // Set window close event handler to hide to tray instead of exit
    let window = main_window.clone();
    main_window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            // Prevent window close
            api.prevent_close();
            // Hide window to tray
            let _ = window.hide();
            println!("Window hidden to tray");
        }
    });

    // Setup default global shortcuts for desktop platforms
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let app_handle = app.handle().clone();
        let default_config = HotkeyConfig::default();
        
        // Setup default shortcuts
        if let Err(e) = setup_default_shortcuts(&app_handle) {
            eprintln!("Failed to setup default shortcuts: {}", e);
        }

        // Setup system tray
        if default_config.system_tray_enabled {
            if let Err(e) = setup_system_tray(&app_handle) {
                eprintln!("Failed to setup system tray: {}", e);
            } else {
                println!("System tray setup successfully");
            }
        }
    }

    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn create_global_shortcut_handler() -> impl Fn(&AppHandle<tauri::Wry>, &tauri_plugin_global_shortcut::Shortcut, ShortcutEvent) + Send + Sync + 'static {
    move |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            let _ = toggle_quicknote_window(app.clone());
        }
    }
}