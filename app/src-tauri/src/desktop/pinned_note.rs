use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri::window::Color;

#[cfg(target_os = "macos")]
tauri_nspanel::tauri_panel! {
    panel!(PinnedNotePanel {
        config: {
            can_become_key_window: true,
            can_become_main_window: false,
            is_floating_panel: true,
            hides_on_deactivate: false,
            works_when_modal: true
        }
    })
}

static EXPANDED_SIZES: LazyLock<Mutex<HashMap<String, (f64, f64)>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

/// Called only after the editor has settled pending writes. Restore Tao's
/// original native class before destruction; NSPanel close routing differs.
#[tauri::command]
pub fn close_pinned_note(window: WebviewWindow) -> Result<(), String> {
    if !window.label().starts_with("pinned-note-") { return Err("Not a desktop note window".into()); }
    let handle = window.clone();
    window.run_on_main_thread(move || {
        #[cfg(target_os = "macos")]
        {
            use tauri_nspanel::ManagerExt;
            if let Ok(panel) = handle.app_handle().get_webview_panel(handle.label()) {
                let _ = panel.to_window();
            }
        }
        let _ = handle.destroy();
    }).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_pinned_note(app: AppHandle, note_id: u32, title: String) -> Result<(), String> {
    if note_id == 0 { return Err("Invalid note id".into()); }
    // 只要有便签窗口在，就不让系统把 Ink nap 掉（见 disable_app_nap 注释）。
    #[cfg(target_os = "macos")]
    disable_app_nap();
    let label = format!("pinned-note-{}", note_id);
    if let Some(window) = app.get_webview_window(&label) {
        apply_note_layer(&window, true)?;
        window.show().map_err(|e| e.to_string())?;
        #[cfg(target_os = "macos")]
        return focus_note_panel(&window);
        #[cfg(not(target_os = "macos"))]
        return window.set_focus().map_err(|e| e.to_string());
    }
    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(format!("/desktop-note?id={}", note_id).into()))
        .title(format!("Ink · {}", title.chars().take(70).collect::<String>()))
        .inner_size(440.0, 520.0).min_inner_size(280.0, 56.0)
        .resizable(true).decorations(false).shadow(false).transparent(true)
        .always_on_top(true).visible_on_all_workspaces(true)
        .skip_taskbar(true).focused(false).visible(false)
        // 确保窗口背景完全透明，避免圆角处露出白色底板
        .background_color(Color(0, 0, 0, 0))
        .build().map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    configure_note_panel(&window)?;
    apply_note_layer(&window, true)?;
    window.show().map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    focus_note_panel(&window)?;
    let cleanup_label = label.clone();
    #[cfg(target_os = "macos")]
    let cleanup_app = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            if let Ok(mut sizes) = EXPANDED_SIZES.lock() { sizes.remove(&cleanup_label); }
            #[cfg(target_os = "macos")]
            {
                use tauri_nspanel::ManagerExt;
                let _ = cleanup_app.remove_webview_panel(&cleanup_label);
            }
        }
    });
    Ok(())
}

/**
 * macOS App Nap：进程退到后台（切到另一个 app 或另一个 Space）一段时间后，
 * 系统会节流它的定时器并回收 WKWebView 渲染进程。滑回来时页面已经没了，
 * 于是整张便签重新加载 —— 表现为"闪一下、内容重新出现"。
 *
 * 开一条进程级 activity 告诉系统"便签随时要响应"。token 故意泄漏：便签是
 * 常驻浮窗，这条 activity 本就该活到进程退出；而且
 * `Retained<ProtocolObject<dyn NSObjectProtocol>>` 不保证 Send，塞进 static
 * 反而要绕一层锁。
 */
#[cfg(target_os = "macos")]
fn disable_app_nap() {
    use objc2_foundation::{NSActivityOptions, NSString, NSProcessInfo};
    static INIT: std::sync::Once = std::sync::Once::new();
    INIT.call_once(|| {
        let info = NSProcessInfo::processInfo();
        let reason = NSString::from_str("Ink desktop notes stay responsive");
        // UserInitiated 保住定时器/IO 精度；LatencyCritical 阻止被 nap；
        // Automatic/SuddenTerminationDisabled 阻止系统回收进程。
        let options = NSActivityOptions::UserInitiated
            | NSActivityOptions::LatencyCritical
            | NSActivityOptions::AutomaticTerminationDisabled
            | NSActivityOptions::SuddenTerminationDisabled;
        std::mem::forget(info.beginActivityWithOptions_reason(options, &reason));
    });
}

#[cfg(target_os = "macos")]
fn configure_note_panel(window: &WebviewWindow) -> Result<(), String> {
    let handle = window.clone();
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    window.run_on_main_thread(move || {
        let result = configure_note_panel_on_main(&handle);
        let _ = sender.send(result);
    }).map_err(|error| error.to_string())?;
    receiver.recv().map_err(|error| error.to_string())?
}

#[cfg(target_os = "macos")]
fn focus_note_panel(window: &WebviewWindow) -> Result<(), String> {
    let handle = window.clone();
    window.run_on_main_thread(move || {
        use tauri_nspanel::ManagerExt;
        if let Ok(panel) = handle.app_handle().get_webview_panel(handle.label()) {
            panel.order_front_regardless();
            panel.make_key_window();
        }
    }).map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn configure_note_panel_on_main(window: &WebviewWindow) -> Result<(), String> {
    use tauri_nspanel::{PanelLevel, WebviewWindowExt, StyleMask};
    use tauri_nspanel::objc2_app_kit::NSWindowCollectionBehavior as Behavior;

    // A regular NSWindow cannot reliably enter another application's exclusive
    // full-screen Space. Swizzle it once to a key-capable NSPanel, the native
    // AppKit surface intended for editable floating tools and overlays.
    let panel = window
        .to_panel::<PinnedNotePanel>()
        .map_err(|error| format!("Failed to create pinned note panel: {error}"))?;
    // Nonactivating does not mean non-key: canBecomeKeyWindow remains true,
    // allowing text input without activating Ink and leaving the full-screen app.
    panel.add_style_mask(StyleMask::empty().nonactivating_panel().value())
        .map_err(|error| error.to_string())?;
    panel.set_floating_panel(true);
    panel.set_hides_on_deactivate(false);
    panel.set_works_when_modal(true);
    panel.set_becomes_key_only_if_needed(false);
    panel.set_level(PanelLevel::Dock.value());
    panel.set_collection_behavior(
        Behavior::CanJoinAllSpaces
            | Behavior::Stationary
            | Behavior::FullScreenAuxiliary
            | Behavior::CanJoinAllApplications,
    );
    panel.set_has_shadow(false);
    panel.set_transparent(true);
    panel.order_front_regardless();
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
                // NSDockWindowLevel. A real NSPanel at this level remains over
                // another application's exclusive full-screen window.
                20
            } else { 
                // NSNormalWindowLevel = 0
                0 
            };
            let _: () = msg_send![ns, setLevel: level];
            
            // 5. 置顶时立即把窗口放到浮动层。保持普通可激活窗口样式，
            // 否则文本编辑器在其他应用前方时无法正常获得键盘焦点。
            if pinned { 
                let _: () = msg_send![ns, orderFrontRegardless]; 
            }

            // 6. 保持窗口对象常驻：AppKit 默认会在窗口 order out 时释放 NSWindow
            //    及它的 WKWebView，回到这个 Space 时就要重新加载页面（表现为便签
            //    闪一下、内容重新出现）。releasedWhenClosed=NO 让它保持存活，
            //    oneShot=NO 阻止 AppKit 把它当作可优化掉的一次性窗口。
            let _: () = msg_send![ns, setReleasedWhenClosed: Bool::NO];
            let _: () = msg_send![ns, setOneShot: Bool::NO];
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
