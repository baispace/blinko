use tauri::{AppHandle, Manager};



#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri_plugin_global_shortcut::{ShortcutState, ShortcutEvent};

use crate::desktop::{HotkeyConfig, setup_system_tray, toggle_quicknote_window, toggle_quickai_window, toggle_quicktool_window, restore_main_window_state, setup_window_state_monitoring};
use crate::voice::{load_voice_config, VoiceProcessor, VOICE_STATE};

pub fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle();
    let main_window = app.get_webview_window("main").unwrap();

    // Check if launched via autostart
    let args: Vec<String> = std::env::args().collect();
    let is_autostart = args.iter().any(|arg| arg == "--autostart");

    if is_autostart {
        println!("Application launched via autostart, hiding window to tray");
        // Hide window immediately on autostart
        let _ = main_window.hide();
    } else {
        println!("Application launched normally");
        // Restore window state before applying decorations only for normal launches
        restore_main_window_state(&app_handle);
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

        // Initialize voice recognition if enabled (Windows only, non-blocking)
        #[cfg(target_os = "windows")]
        {
            let voice_config = load_voice_config(&app_handle);
            if voice_config.enabled && std::path::Path::new(&voice_config.model_path).exists() {
                println!("🎤 Voice recognition enabled, initializing in background...");

                // Clone voice config for the background thread
                let voice_config_clone = voice_config.clone();

                // Use std::thread::spawn instead of tokio::spawn to avoid runtime issues
                std::thread::spawn(move || {
                    match VoiceProcessor::new(voice_config_clone.clone()) {
                        Ok(processor) => {
                            println!("✅ Voice recognition initialized successfully");

                            // Update global state
                            {
                                let mut state = VOICE_STATE.lock();
                                state.processor = Some(std::sync::Arc::new(processor));
                                state.is_initialized = true;
                                *state.config.lock() = voice_config_clone.clone();
                            }

                            // Start the voice recognition service
                            if let Some(ref processor) = VOICE_STATE.lock().processor {
                                if let Err(e) = processor.start() {
                                    eprintln!("❌ Failed to start voice recognition: {}", e);
                                    println!("💡 Voice recognition failed to start, but application will continue normally");
                                } else {
                                    println!("🚀 Voice recognition service started successfully");
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("❌ Failed to initialize voice recognition: {}", e);
                            println!("💡 Please check model path and configuration in voice settings");
                            println!("💡 Application will continue to run normally without voice recognition");
                        }
                    }
                });
            } else if voice_config.enabled && !std::path::Path::new(&voice_config.model_path).exists() {
                println!("⚠️ Voice recognition enabled but model file not found: {}", voice_config.model_path);
                println!("💡 Please download a model file and update the path in voice settings");
                println!("💡 Application will continue to run normally without voice recognition");
            } else {
                println!("🔇 Voice recognition disabled in configuration");
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            println!("🔇 Voice recognition not available on this platform (only supported on Windows)");
        }
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

            println!("🔥 Global shortcut triggered: {}", shortcut_str);

            // Check for text selection trigger combinations
            // Handle different representations of backtick/grave accent
            if shortcut_str.contains("Control") && (shortcut_str.contains("`") || shortcut_str.contains("Backquote") || shortcut_str.contains("Grave")) {
                println!("🎹 Text selection trigger pressed: {} (ctrl + `)", shortcut_str);
                let is_enabled = crate::desktop::is_text_selection_enabled_for("ctrl");
                println!("🔍 Text selection enabled for ctrl: {}", is_enabled);
                if is_enabled {
                    println!("🚀 Triggering text selection via Ctrl + `");
                    crate::desktop::handle_text_selection(app);
                    return;
                } else {
                    println!("⚠️ Text selection not enabled for ctrl, ignoring shortcut");
                }
            } else if shortcut_str.contains("Shift") && (shortcut_str.contains("`") || shortcut_str.contains("Backquote") || shortcut_str.contains("Grave")) {
                println!("🎹 Text selection trigger pressed: {} (shift + `)", shortcut_str);
                let is_enabled = crate::desktop::is_text_selection_enabled_for("shift");
                println!("🔍 Text selection enabled for shift: {}", is_enabled);
                if is_enabled {
                    println!("🚀 Triggering text selection via Shift + `");
                    crate::desktop::handle_text_selection(app);
                    return;
                } else {
                    println!("⚠️ Text selection not enabled for shift, ignoring shortcut");
                }
            } else if shortcut_str.contains("Alt") && (shortcut_str.contains("`") || shortcut_str.contains("Backquote") || shortcut_str.contains("Grave")) {
                println!("🎹 Text selection trigger pressed: {} (alt + `)", shortcut_str);
                let is_enabled = crate::desktop::is_text_selection_enabled_for("alt");
                println!("🔍 Text selection enabled for alt: {}", is_enabled);
                if is_enabled {
                    println!("🚀 Triggering text selection via Alt + `");
                    crate::desktop::handle_text_selection(app);
                    return;
                } else {
                    println!("⚠️ Text selection not enabled for alt, ignoring shortcut");
                }
            }

            // Get the command mapped to this shortcut from our registration map
            let shortcuts_map = crate::desktop::get_registered_shortcuts();
            println!("📋 Available shortcuts: {:?}", shortcuts_map);

            // Try direct match first (normalize to lowercase)
            if let Some(command) = shortcuts_map.get(&shortcut_str.to_lowercase()) {
                println!("🎯 Direct match found: {} -> {}", shortcut_str, command);
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
                    "quicktool" => {
                        let _ = toggle_quicktool_window(app.clone());
                        println!("Triggered quicktool window via shortcut: {}", shortcut_str);
                        return;
                    },
                    "text-selection" => {
                        println!("🚀 Triggering text selection via direct shortcut: {}", shortcut_str);
                        crate::desktop::handle_text_selection(app);
                        return;
                    },
                    _ => {
                        println!("Unknown command for shortcut {}: {}", shortcut_str, command);
                    }
                }
            } else {
                println!("❌ No direct match for shortcut: {}", shortcut_str);
            }

            // If no direct match, try to find by matching against all registered shortcuts
            for (registered_shortcut, command) in shortcuts_map.iter() {
                println!("🔍 Checking registered shortcut: '{}' -> '{}'", registered_shortcut, command);
                if shortcuts_match(&shortcut_str, registered_shortcut) {
                    println!("✅ Found matching shortcut: {} -> {}", shortcut_str, registered_shortcut);
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
                        "quicktool" => {
                            let _ = toggle_quicktool_window(app.clone());
                            println!("Triggered quicktool window via matched shortcut: {} -> {}", shortcut_str, registered_shortcut);
                            return;
                        },
                        "text-selection" => {
                            println!("🚀 Triggering text selection via matched shortcut: {} -> {}", shortcut_str, registered_shortcut);
                            crate::desktop::handle_text_selection(app);
                            return;
                        },
                        _ => {
                            println!("⚠️ Unknown command '{}' for shortcut {}", command, registered_shortcut);
                        }
                    }
                } else {
                    println!("❌ No match for shortcut: {} vs {}", shortcut_str, registered_shortcut);
                }
            }

            println!("No command mapped for shortcut: {}", shortcut_str);
        }
    }
}