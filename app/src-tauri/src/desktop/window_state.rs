use tauri::{AppHandle, Manager};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use crate::desktop::hotkey::WindowConfig;

const WINDOW_STATE_FILE: &str = "window_state.json";

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AppWindowState {
    main_window: Option<WindowConfig>,
    quicknote_window: Option<WindowConfig>,
}

impl Default for AppWindowState {
    fn default() -> Self {
        Self {
            main_window: Some(WindowConfig::default()),
            quicknote_window: None,
        }
    }
}

// Get window state file path
fn get_window_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    
    // Ensure directory exists
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }
    
    Ok(app_data_dir.join(WINDOW_STATE_FILE))
}

// Load window state from file
pub fn load_window_state(app: &AppHandle) -> AppWindowState {
    match get_window_state_path(app) {
        Ok(path) => {
            if path.exists() {
                match fs::read_to_string(&path) {
                    Ok(content) => {
                        match serde_json::from_str::<AppWindowState>(&content) {
                            Ok(state) => {
                                println!("Loaded window state from: {}", path.display());
                                return state;
                            }
                            Err(e) => {
                                eprintln!("Failed to parse window state: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to read window state file: {}", e);
                    }
                }
            } else {
                println!("Window state file does not exist, using defaults");
            }
        }
        Err(e) => {
            eprintln!("Failed to get window state path: {}", e);
        }
    }
    
    AppWindowState::default()
}

// Save window state to file
pub fn save_window_state(app: &AppHandle, state: &AppWindowState) {
    match get_window_state_path(app) {
        Ok(path) => {
            match serde_json::to_string_pretty(state) {
                Ok(content) => {
                    if let Err(e) = fs::write(&path, content) {
                        eprintln!("Failed to write window state to file: {}", e);
                    } else {
                        println!("Saved window state to: {}", path.display());
                    }
                }
                Err(e) => {
                    eprintln!("Failed to serialize window state: {}", e);
                }
            }
        }
        Err(e) => {
            eprintln!("Failed to get window state path: {}", e);
        }
    }
}

// Apply window state to main window
pub fn restore_main_window_state(app: &AppHandle) {
    let window_state = load_window_state(app);
    
    if let Some(window) = app.get_webview_window("main") {
        if let Some(config) = window_state.main_window {
            // Restore window size
            let size = tauri::LogicalSize::new(config.width, config.height);
            if let Err(e) = window.set_size(size) {
                eprintln!("Failed to restore window size: {}", e);
            }
            
            // Restore window position if available
            if let (Some(x), Some(y)) = (config.x, config.y) {
                let position = tauri::LogicalPosition::new(x, y);
                if let Err(e) = window.set_position(position) {
                    eprintln!("Failed to restore window position: {}", e);
                }
            }
            
            // Restore maximized state
            if config.maximized {
                if let Err(e) = window.maximize() {
                    eprintln!("Failed to maximize window: {}", e);
                }
            }
            
            println!("Restored main window state: {}x{} at ({:?}, {:?}), maximized: {}", 
                     config.width, config.height, config.x, config.y, config.maximized);
        }
    }
}

// Save current main window state
pub fn save_main_window_state(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let mut window_state = load_window_state(app);
        
        // Get current window state
        if let (Ok(size), Ok(position), Ok(is_maximized)) = (
            window.inner_size(),
            window.outer_position(),
            window.is_maximized()
        ) {
            let config = WindowConfig {
                width: size.width as f64,
                height: size.height as f64,
                x: Some(position.x),
                y: Some(position.y),
                maximized: is_maximized,
            };
            
            window_state.main_window = Some(config.clone());
            save_window_state(app, &window_state);
            
            // println!("Saved main window state: {}x{} at ({}, {}), maximized: {}", 
            //          config.width, config.height, config.x.unwrap_or(0), config.y.unwrap_or(0), config.maximized);
        }
    }
}

// Setup window state monitoring
pub fn setup_window_state_monitoring(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let app_handle = app.clone();
        
        window.on_window_event(move |event| {
            match event {
                tauri::WindowEvent::Resized(_) | 
                tauri::WindowEvent::Moved(_) => {
                    // Save state on resize or move
                    save_main_window_state(&app_handle);
                }
                tauri::WindowEvent::CloseRequested { .. } => {
                    // Save state before closing
                    save_main_window_state(&app_handle);
                }
                _ => {}
            }
        });
        
        println!("Window state monitoring setup for main window");
    }
}