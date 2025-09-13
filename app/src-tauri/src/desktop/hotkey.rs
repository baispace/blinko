use tauri::AppHandle;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use serde::{Deserialize, Serialize};

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri_plugin_global_shortcut::Shortcut;

// Global state for managing shortcuts
static REGISTERED_SHORTCUTS: LazyLock<Mutex<HashMap<String, String>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Serialize, Deserialize)]
pub struct HotkeyConfig {
    pub quick_note: String,
    pub enabled: bool,
    pub system_tray_enabled: bool,
    pub window_behavior: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WindowConfig {
    pub width: f64,
    pub height: f64,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub maximized: bool,
}

impl Default for HotkeyConfig {
    fn default() -> Self {
        Self {
            quick_note: "Shift+Space".to_string(),
            enabled: true,
            system_tray_enabled: true,
            window_behavior: "show".to_string(),
        }
    }
}

impl Default for WindowConfig {
    fn default() -> Self {
        Self {
            width: 1024.0,
            height: 768.0,
            x: None,  // Always center, don't save position
            y: None,  // Always center, don't save position
            maximized: false,
        }
    }
}

#[tauri::command]
pub fn register_hotkey(app: AppHandle, shortcut: String, command: String) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
        
        // Parse the shortcut string
        let parsed_shortcut = shortcut.parse::<Shortcut>()
            .map_err(|e| format!("Invalid shortcut format: {}", e))?;
        
        // Register with Tauri global shortcut system
        app.global_shortcut().register(parsed_shortcut)
            .map_err(|e| format!("Failed to register shortcut: {}", e))?;
        
        // Store command for the shortcut handler
        let mut shortcuts = REGISTERED_SHORTCUTS.lock().unwrap();
        shortcuts.insert(shortcut.clone(), command.clone());
        
        println!("Successfully registered shortcut: {} for command: {}", shortcut, command);
        Ok(())
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        Err("Global shortcuts not supported on mobile".to_string())
    }
}

#[tauri::command]
pub fn unregister_hotkey(app: AppHandle, shortcut: String) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
        
        // Parse the shortcut string
        let parsed_shortcut = shortcut.parse::<Shortcut>()
            .map_err(|e| format!("Invalid shortcut format: {}", e))?;
        
        // Unregister from Tauri global shortcut system
        app.global_shortcut().unregister(parsed_shortcut)
            .map_err(|e| format!("Failed to unregister shortcut: {}", e))?;
        
        // Remove from local storage
        let mut shortcuts = REGISTERED_SHORTCUTS.lock().unwrap();
        shortcuts.remove(&shortcut);
        
        println!("Successfully unregistered shortcut: {}", shortcut);
        Ok(())
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        Err("Global shortcuts not supported on mobile".to_string())
    }
}

#[tauri::command]
pub fn get_registered_shortcuts() -> HashMap<String, String> {
    REGISTERED_SHORTCUTS.lock().unwrap().clone()
}

pub fn setup_default_shortcuts(app_handle: &AppHandle) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;
        
        let default_config = HotkeyConfig::default();
        
        // Register default quick note shortcut
        if let Ok(parsed_shortcut) = default_config.quick_note.parse::<Shortcut>() {
            if let Err(e) = app_handle.global_shortcut().register(parsed_shortcut) {
                eprintln!("Failed to register default hotkey: {}", e);
            } else {
                // Store the registered shortcut
                let mut shortcuts = REGISTERED_SHORTCUTS.lock().unwrap();
                shortcuts.insert(default_config.quick_note.clone(), "quicknote".to_string());
                println!("Registered default shortcut: {}", default_config.quick_note);
            }
        }
    }
    
    Ok(())
}