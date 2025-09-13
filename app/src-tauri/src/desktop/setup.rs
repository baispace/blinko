use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
use tauri_plugin_decorum::WebviewWindowExt;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri_plugin_global_shortcut::{ShortcutState, ShortcutEvent};

use crate::desktop::{HotkeyConfig, setup_default_shortcuts, setup_system_tray, toggle_quicknote_window, toggle_quickai_window, restore_main_window_state, setup_window_state_monitoring};

pub fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle();
    let main_window = app.get_webview_window("main").unwrap();

    // Restore window state before applying decorations
    restore_main_window_state(&app_handle);

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

    // Setup system tray for desktop platforms (shortcuts will be registered by frontend)
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let default_config = HotkeyConfig::default();
        
        // Setup system tray
        if default_config.system_tray_enabled {
            if let Err(e) = setup_system_tray(&app_handle) {
                eprintln!("Failed to setup system tray: {}", e);
            } else {
                println!("System tray setup successfully");
            }
        }
        
        // Note: Shortcuts will be registered when frontend loads user configuration
        // This prevents conflicts between default and user-configured shortcuts
        println!("Waiting for frontend to register shortcuts based on user configuration...");
    }

    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn shortcuts_match(actual: &str, registered: &str) -> bool {
    // Normalize both shortcuts for comparison
    let normalize = |s: &str| -> String {
        let mut normalized = s.to_lowercase();
        
        // Handle CommandOrControl -> control mapping
        normalized = normalized.replace("commandorcontrol", "control");
        
        // Remove "key" prefix from key names (control+KeyG -> control+g)
        normalized = normalized.replace("key", "");
        
        // Ensure consistent casing for modifiers
        normalized = normalized.replace("shift+", "shift+");
        normalized = normalized.replace("control+", "control+");
        normalized = normalized.replace("alt+", "alt+");
        normalized = normalized.replace("cmd+", "control+");
        normalized = normalized.replace("command+", "control+");
        
        // Sort modifiers to ensure consistent order
        let parts: Vec<&str> = normalized.split('+').collect();
        if parts.len() > 1 {
            let mut modifiers: Vec<&str> = parts[..parts.len()-1].to_vec();
            let key = parts[parts.len()-1];
            modifiers.sort();
            format!("{}+{}", modifiers.join("+"), key)
        } else {
            normalized
        }
    };
    
    let normalized_actual = normalize(actual);
    let normalized_registered = normalize(registered);
    
    println!("Shortcut match comparison: '{}' (from '{}') == '{}' (from '{}') -> {}", 
             normalized_actual, actual, normalized_registered, registered,
             normalized_actual == normalized_registered);
    
    normalized_actual == normalized_registered
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn create_global_shortcut_handler() -> impl Fn(&AppHandle<tauri::Wry>, &tauri_plugin_global_shortcut::Shortcut, ShortcutEvent) + Send + Sync + 'static {
    move |app, shortcut, event| {
        if event.state == ShortcutState::Pressed {
            let shortcut_str = shortcut.to_string();
            
            // Get the command mapped to this shortcut from our registration map
            let shortcuts_map = crate::desktop::get_registered_shortcuts();
            
            // Try direct match first
            if let Some(command) = shortcuts_map.get(&shortcut_str) {
                match command.as_str() {
                    "quicknote" => {
                        let _ = toggle_quicknote_window(app.clone());
                        println!("Triggered quicknote window via shortcut: {}", shortcut_str);
                        return;
                    },
                    "quickai" => {
                        let _ = toggle_quickai_window(app.clone());
                        println!("Triggered quickai window via shortcut: {}", shortcut_str);
                        return;
                    },
                    _ => {
                        println!("Unknown command for shortcut {}: {}", shortcut_str, command);
                    }
                }
            }
            
            // If no direct match, try to find by matching against all registered shortcuts
            for (registered_shortcut, command) in shortcuts_map.iter() {
                if shortcuts_match(&shortcut_str, registered_shortcut) {
                    match command.as_str() {
                        "quicknote" => {
                            let _ = toggle_quicknote_window(app.clone());
                            println!("Triggered quicknote window via matched shortcut: {} -> {}", shortcut_str, registered_shortcut);
                            return;
                        },
                        "quickai" => {
                            let _ = toggle_quickai_window(app.clone());
                            println!("Triggered quickai window via matched shortcut: {} -> {}", shortcut_str, registered_shortcut);
                            return;
                        },
                        _ => {}
                    }
                }
            }
            
            println!("No command mapped for shortcut: {}", shortcut_str);
        }
    }
}