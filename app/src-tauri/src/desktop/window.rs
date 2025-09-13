use tauri::{AppHandle, Manager, Emitter};

#[tauri::command]
pub fn toggle_editor_window(app: AppHandle) -> Result<(), String> {
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
pub fn resize_quicknote_window(app: AppHandle, height: f64) -> Result<(), String> {
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
pub fn toggle_quicknote_window(app: AppHandle) -> Result<(), String> {
    // Try to get existing quicknote window
    if let Some(window) = app.get_webview_window("quicknote") {
        // Check if window is visible and toggle state
        match window.is_visible() {
            Ok(true) => {
                // If visible, hide it
                let _ = window.hide();
                println!("Quicknote window hidden");
                return Ok(());
            },
            Ok(false) | Err(_) => {
                // If hidden or error checking, show and focus it
                let _ = window.show();
                let _ = window.set_focus();
                println!("Quicknote window shown");
                return Ok(());
            }
        }
    }

    // Create new quicknote window
    let quicknote_window = tauri::WebviewWindowBuilder::new(&app, "quicknote", tauri::WebviewUrl::App("/quicknote".into()))
        .title("Quick Note")
        .inner_size(600.0, 150.0)
        .resizable(true)
        .focused(true)
        .visible(true)
        .always_on_top(true)
        .skip_taskbar(false)
        .decorations(false)
        .minimizable(false)
        .maximizable(false)
        .closable(false)
        .build()
        .map_err(|e| format!("Failed to create quicknote window: {}", e))?;

    // Handle window close event - hide instead of close
    let window_clone = quicknote_window.clone();
    quicknote_window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window_clone.hide();
            println!("Quicknote window hidden");
        }
    });

    Ok(())
}