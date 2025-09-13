use tauri::{AppHandle, Manager, Emitter, WebviewWindowBuilder, WebviewUrl, Runtime, WindowEvent};

// QuickTool window dimensions - defined once for consistency
pub const QUICKTOOL_WIDTH: f64 = 190.0;
pub const QUICKTOOL_HEIGHT: f64 = 35.0;

/// Configuration for quick windows
struct QuickWindowConfig {
    label: &'static str,
    title: &'static str,
    url: &'static str,
    width: f64,
    height: f64,
    resizable: bool,
    skip_taskbar: bool,
}

/// Helper function to create a quick window with common settings
fn create_quick_window<R: Runtime>(
    app: &AppHandle<R>,
    config: QuickWindowConfig
) -> Result<(), String> {
    let window = WebviewWindowBuilder::new(app, config.label, WebviewUrl::App(config.url.into()))
        .title(config.title)
        .inner_size(config.width, config.height)
        .resizable(config.resizable)
        .focused(true)
        .visible(true)
        .always_on_top(true)
        .skip_taskbar(config.skip_taskbar)
        .decorations(false)
        .minimizable(false)
        .maximizable(false)
        .closable(false)
        .shadow(config.label == "quicktool") // Only quicktool needs shadow
        .build()
        .map_err(|e| format!("Failed to create {} window: {}", config.label, e))?;

    // Handle window close event - hide instead of close
    let window_clone = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window_clone.hide();
            println!("{} window hidden", config.label);
        }
    });

    Ok(())
}

/// Helper function to toggle a quick window
fn toggle_window<R: Runtime>(app: &AppHandle<R>, window_label: &str) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(window_label) {
        match window.is_visible() {
            Ok(true) => {
                let _ = window.hide();
                println!("{} window hidden", window_label);
                Ok(())
            }
            Ok(false) | Err(_) => {
                let _ = window.show();
                let _ = window.set_focus();
                println!("{} window shown", window_label);
                Ok(())
            }
        }
    } else {
        Err(format!("{} window not found", window_label))
    }
}

#[tauri::command]
pub fn toggle_editor_window<R: tauri::Runtime>(app: AppHandle<R>) -> Result<(), String> {
    match app.get_webview_window("main") {
        Some(window) => {
            match window.is_visible() {
                Ok(true) => {
                    if window.is_focused().unwrap_or(false) {
                        // If window is visible and focused, hide it
                        let _ = window.hide();
                    } else {
                        // If window is visible but not focused, focus it
                        let _ = window.set_focus();
                        let _ = window.emit("quicknote-triggered", ());
                    }
                },
                Ok(false) | Err(_) => {
                    // If window is hidden, show and focus it
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = window.emit("quicknote-triggered", ());
                }
            }
            Ok(())
        },
        None => Err("Main window not found".to_string())
    }
}

#[tauri::command]
pub fn resize_quicknote_window<R: tauri::Runtime>(app: AppHandle<R>, height: f64) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("quicknote") {
        let width = 600.0;
        // Limit max height to 600, min height to 100
        let constrained_height = height.max(100.0).min(600.0);
        
        // Use Tauri 2 LogicalSize
        let size = tauri::LogicalSize::new(width, constrained_height);
        window.set_size(size)
            .map_err(|e| format!("Failed to set size: {}", e))?;
        
        println!("Resized quicknote window to {}x{} (requested: {})", width, constrained_height, height);
        Ok(())
    } else {
        Err("Quicknote window not found".to_string())
    }
}

#[tauri::command]
pub fn toggle_quicknote_window<R: tauri::Runtime>(app: AppHandle<R>) -> Result<(), String> {
    // Try to toggle existing window first
    if let Ok(()) = toggle_window(&app, "quicknote") {
        return Ok(());
    }

    // Create new quicknote window if it doesn't exist
    let config = QuickWindowConfig {
        label: "quicknote",
        title: "Quick Note",
        url: "/quicknote",
        width: 600.0,
        height: 150.0,
        resizable: true,
        skip_taskbar: false,
    };

    create_quick_window(&app, config)
}

#[tauri::command]
pub fn resize_quickai_window<R: tauri::Runtime>(app: AppHandle<R>, height: f64) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("quickai") {
        let width = 600.0;
        // Limit max height to 600, min height to 100 (same as quicknote)
        let constrained_height = height.max(100.0).min(600.0);
        
        // Use Tauri 2 LogicalSize
        let size = tauri::LogicalSize::new(width, constrained_height);
        window.set_size(size)
            .map_err(|e| format!("Failed to set size: {}", e))?;
        
        println!("Resized quickai window to {}x{} (requested: {})", width, constrained_height, height);
        Ok(())
    } else {
        Err("Quickai window not found".to_string())
    }
}

#[tauri::command]
pub fn toggle_quickai_window<R: tauri::Runtime>(app: AppHandle<R>) -> Result<(), String> {
    // Try to toggle existing window first
    if let Ok(()) = toggle_window(&app, "quickai") {
        return Ok(());
    }

    // Create new quickai window if it doesn't exist
    let config = QuickWindowConfig {
        label: "quickai",
        title: "Quick AI",
        url: "/quickai",
        width: 600.0,
        height: 125.0,
        resizable: true,
        skip_taskbar: false,
    };

    create_quick_window(&app, config)
}

#[tauri::command]
pub fn navigate_main_to_ai_with_prompt<R: tauri::Runtime>(app: AppHandle<R>, prompt: String) -> Result<(), String> {
    // Show and focus main window
    let main_window = match app.get_webview_window("main") {
        Some(window) => window,
        None => return Err("Main window not found".to_string()),
    };

    // Show main window if it's hidden
    if let Err(e) = main_window.show() {
        eprintln!("Failed to show main window: {}", e);
    }

    // Focus main window
    if let Err(e) = main_window.set_focus() {
        eprintln!("Failed to focus main window: {}", e);
    }

    // Emit event to main window with the AI prompt
    if let Err(e) = main_window.emit("navigate-to-ai-with-prompt", prompt) {
        return Err(format!("Failed to emit navigation event: {}", e));
    }

    println!("Triggered main window navigation to AI with prompt");
    Ok(())
}

#[tauri::command]
pub fn toggle_quicktool_window<R: tauri::Runtime>(app: AppHandle<R>) -> Result<(), String> {
    // Try to toggle existing window first
    if let Ok(()) = toggle_window(&app, "quicktool") {
        return Ok(());
    }

    // Create new quicktool window if it doesn't exist
    let config = QuickWindowConfig {
        label: "quicktool",
        title: "Quick Tool",
        url: "/quicktool",
        width: QUICKTOOL_WIDTH,
        height: QUICKTOOL_HEIGHT,
        resizable: false,
        skip_taskbar: true,
    };

    create_quick_window(&app, config)
}

#[tauri::command]
pub fn hide_quicktool_window<R: tauri::Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("quicktool") {
        let _ = window.hide();
        println!("Quicktool window hidden");
        Ok(())
    } else {
        Err("Quicktool window not found".to_string())
    }
}