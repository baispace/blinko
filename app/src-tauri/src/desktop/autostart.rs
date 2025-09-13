use tauri::AppHandle;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AutoStartConfig {
    pub enabled: bool,
}

impl Default for AutoStartConfig {
    fn default() -> Self {
        Self {
            enabled: false,
        }
    }
}

// Check if autostart is enabled
#[tauri::command]
pub fn is_autostart_enabled() -> Result<bool, String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        use auto_launch::AutoLaunch;
        
        match create_auto_launch() {
            Ok(auto_launch) => {
                match auto_launch.is_enabled() {
                    Ok(enabled) => Ok(enabled),
                    Err(e) => Err(format!("Failed to check autostart status: {}", e))
                }
            }
            Err(e) => Err(e)
        }
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        Err("Autostart not supported on mobile platforms".to_string())
    }
}

// Enable autostart
#[tauri::command]
pub fn enable_autostart() -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        use auto_launch::AutoLaunch;
        
        match create_auto_launch() {
            Ok(auto_launch) => {
                match auto_launch.enable() {
                    Ok(_) => {
                        println!("Autostart enabled successfully");
                        Ok(())
                    }
                    Err(e) => Err(format!("Failed to enable autostart: {}", e))
                }
            }
            Err(e) => Err(e)
        }
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        Err("Autostart not supported on mobile platforms".to_string())
    }
}

// Disable autostart
#[tauri::command]
pub fn disable_autostart() -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        use auto_launch::AutoLaunch;
        
        match create_auto_launch() {
            Ok(auto_launch) => {
                match auto_launch.disable() {
                    Ok(_) => {
                        println!("Autostart disabled successfully");
                        Ok(())
                    }
                    Err(e) => Err(format!("Failed to disable autostart: {}", e))
                }
            }
            Err(e) => Err(e)
        }
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        Err("Autostart not supported on mobile platforms".to_string())
    }
}

// Create AutoLaunch instance
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn create_auto_launch() -> Result<auto_launch::AutoLaunch, String> {
    use auto_launch::AutoLaunch;
    
    #[cfg(target_os = "macos")]
    let auto_launch = AutoLaunch::new(
        "Blinko",                    // App name
        env!("CARGO_PKG_NAME"),      // App identifier
        false,                       // Use app path instead of executable path
        &[] as &[&str],              // No additional args needed
    );

    #[cfg(target_os = "windows")]
    let auto_launch = AutoLaunch::new(
        "Blinko",                    // App name
        env!("CARGO_PKG_NAME"),      // App identifier
        &[] as &[&str],              // No additional args needed
    );

    #[cfg(target_os = "linux")]
    let auto_launch = AutoLaunch::new(
        "Blinko",                    // App name
        env!("CARGO_PKG_NAME"),      // App identifier
        &[] as &[&str],              // No additional args needed
    );
    
    Ok(auto_launch)
}

// Toggle autostart
#[tauri::command]
pub fn toggle_autostart(enable: bool) -> Result<(), String> {
    if enable {
        enable_autostart()
    } else {
        disable_autostart()
    }
}