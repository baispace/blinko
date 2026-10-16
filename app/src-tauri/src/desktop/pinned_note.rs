use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri::window::Color;

static EXPANDED_SIZES: LazyLock<Mutex<HashMap<String, (f64, f64)>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

#[tauri::command]
pub fn open_pinned_note(app: AppHandle, note_id: u32, title: String) -> Result<(), String> {
    if note_id == 0 { return Err("Invalid note id".into()); }
    let label = format!("pinned-note-{}", note_id);
    if let Some(window) = app.get_webview_window(&label) {
        apply_note_layer(&window, true)?;
        window.show().map_err(|e| e.to_string())?;
        return window.set_focus().map_err(|e| e.to_string());
    }
    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(format!("/desktop-note?id={}", note_id).into()))
        .title(format!("Ink · {}", title.chars().take(70).collect::<String>()))
        .inner_size(440.0, 520.0).min_inner_size(280.0, 56.0)
        .resizable(true).decorations(false).shadow(false).transparent(true)
        .always_on_top(true).visible_on_all_workspaces(true)
        .skip_taskbar(true).focused(true)
        // 确保窗口背景完全透明，避免圆角处露出白色底板
        .background_color(Color(0, 0, 0, 0))
        .build().map_err(|e| e.to_string())?;
    apply_note_layer(&window, true)?;
    let cleanup_label = label.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            if let Ok(mut sizes) = EXPANDED_SIZES.lock() { sizes.remove(&cleanup_label); }
        }
    });
    Ok(())
}

#[tauri::command]
pub fn resize_pinned_note(window: WebviewWindow, collapsed: bool) -> Result<(), String> {
    if !window.label().starts_with("pinned-note-") { return Err("Not a desktop note window".into()); }
    let size = if collapsed {
        let size = window.inner_size().map_err(|e| e.to_string())?;
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        EXPANDED_SIZES.lock().map_err(|e| e.to_string())?.entry(window.label().to_string()).or_insert((size.width as f64 / scale, size.height as f64 / scale));
        (320.0, 72.0)
    } else {
        EXPANDED_SIZES.lock().map_err(|e| e.to_string())?.remove(window.label()).unwrap_or((440.0,520.0))
    };
    window.set_resizable(!collapsed).map_err(|e| e.to_string())?;
    window.set_size(tauri::LogicalSize::new(size.0,size.1)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_pinned_note_top(window: WebviewWindow, pinned: bool) -> Result<(), String> {
    if !window.label().starts_with("pinned-note-") { return Err("Not a desktop note window".into()); }
    apply_note_layer(&window, pinned)
}

// Apply AppKit behavior explicitly: a desktop note remains visible when Ink
// deactivates, when the main application hides, and in full-screen Spaces.
fn apply_note_layer(window: &WebviewWindow, pinned: bool) -> Result<(), String> {
    window.set_always_on_top(pinned).map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    {
        let handle = window.clone();
        window.run_on_main_thread(move || unsafe {
            use objc2::{msg_send, runtime::{AnyObject, Bool}};
            let Ok(address) = handle.ns_window() else { return; };
            let ns = address as *mut AnyObject;
            
            // 1. 阻止窗口在应用失去激活时隐藏
            let _: () = msg_send![ns, setHidesOnDeactivate: Bool::NO];
            
            // 2. 置顶时禁止隐藏，非置顶时允许
            let _: () = msg_send![ns, setCanHide: Bool::new(!pinned)];
            
            // 3. 获取并设置窗口行为标志
            let behavior: usize = msg_send![ns, collectionBehavior];
            let modern = objc2::available!(macos = 13.0);
            let behavior = note_collection_behavior(behavior, modern);
            let _: () = msg_send![ns, setCollectionBehavior: behavior];
            
            // 4. 设置窗口层级 - 使用正确的浮窗层级
            let level: isize = if pinned { 
                // NSFloatingWindowLevel = 3, 但需要保持在所有应用之上
                // 使用更高的层级确保在其他应用窗口之上
                3 
            } else { 
                // NSNormalWindowLevel = 0
                0 
            };
            let _: () = msg_send![ns, setLevel: level];
            
            // 5. 置顶时确保窗口始终显示在其他窗口之上
            if pinned { 
                let _: () = msg_send![ns, orderFrontRegardless]; 
                
                // 额外的保险：设置窗口风格为浮动面板
                let style_mask: usize = msg_send![ns, styleMask];
                // NSWindowStyleMaskNonactivatingPanel = 1 << 7
                let floating_panel_mask = style_mask | (1usize << 7);
                let _: () = msg_send![ns, setStyleMask: floating_panel_mask];
            }
        }).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn note_collection_behavior(current: usize, modern: bool) -> usize {
    // Clear mutually exclusive Spaces/Mission Control/full-screen flags first.
    let conflicting = (1usize << 1) | (1usize << 2) | (1usize << 3)
        | (1usize << 7) | (1usize << 9) | (1usize << 16) | (1usize << 17) | (1usize << 18);
    let mut value = (current & !conflicting) | 1 | (1usize << 4) | (1usize << 8);
    // Ventura+: Stage Manager must allow the note to join other applications.
    if modern { value |= 1usize << 18; }
    value
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::note_collection_behavior;
    #[test]
    fn joins_other_apps_without_mutually_exclusive_flags() {
        let original = (1 << 1) | (1 << 2) | (1 << 7) | (1 << 9) | (1 << 16) | (1 << 17);
        let value = note_collection_behavior(original, true);
        assert_eq!(value & original, 0);
        assert_ne!(value & (1 << 18), 0);
        assert_ne!(value & (1 << 8), 0);
        assert_ne!(value & 1, 0);
        assert_eq!(note_collection_behavior(value, true), value);
    }
    #[test]
    fn older_macos_uses_only_legacy_floating_space_flags() {
        let value = note_collection_behavior(0, false);
        assert_eq!(value & (1 << 18), 0);
        assert_ne!(value & (1 << 8), 0);
    }
}
