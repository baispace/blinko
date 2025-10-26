use tauri::AppHandle;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use super::{
    VoiceConfig, VoiceProcessor, VOICE_STATE,
    validate_voice_config
};

#[derive(Debug, Serialize, Deserialize)]
pub struct VoiceStatus {
    pub is_initialized: bool,
    pub is_running: bool,
    pub mode_info: Option<String>,
    pub audio_level: f32,
}


/// Get current voice configuration
#[tauri::command]
pub async fn get_voice_config(app: AppHandle) -> Result<VoiceConfig, String> {
    let config = super::load_voice_config(&app);
    Ok(config)
}

/// Save voice configuration
#[tauri::command]
pub async fn save_voice_config_cmd(
    app: AppHandle,
    config: VoiceConfig
) -> Result<(), String> {
    println!("Received voice config to save: {:?}", config);

    // Validate configuration
    if let Err(e) = validate_voice_config(&config) {
        println!("Voice config validation failed: {}", e);
        return Err(e);
    }

    // Save to file
    super::save_voice_config(&app, &config)?;
    println!("Voice config saved to file successfully");

    // Update the global state
    {
        let mut state = VOICE_STATE.lock();
        *state.config.lock() = config.clone();

        // If processor exists, update its config
        if let Some(ref processor) = state.processor {
            processor.update_config(config);
        }
    }

    Ok(())
}

/// Initialize voice recognition system
#[tauri::command]
pub async fn initialize_voice_recognition(app: AppHandle) -> Result<String, String> {
    // Stop existing voice recognition if running
    {
        let state = VOICE_STATE.lock();
        if let Some(ref processor) = state.processor {
            println!("🔄 Stopping existing voice recognition service...");
            processor.stop();
        }
    }

    let config = super::load_voice_config(&app);
    println!("🔧 Reinitializing voice recognition with updated config...");

    // Validate configuration first
    validate_voice_config(&config)?;

    match VoiceProcessor::new(config.clone()) {
        Ok(processor) => {
            let mode_info = processor.transcriber.get_mode_info().to_string();

            {
                let mut state = VOICE_STATE.lock();
                state.processor = Some(Arc::new(processor));
                state.is_initialized = true;
                *state.config.lock() = config.clone();
            }

            // Start the voice recognition service with new configuration
            if let Some(ref processor) = VOICE_STATE.lock().processor {
                if let Err(e) = processor.start() {
                    eprintln!("❌ Failed to start voice recognition service: {}", e);
                    return Err(format!("Failed to start voice recognition service: {}", e));
                } else {
                    println!("🚀 Voice recognition service restarted with updated hotkey: {}", config.hotkey);
                }
            }

            Ok(format!("Voice recognition reinitialized successfully ({}) with hotkey: {}", mode_info, config.hotkey))
        }
        Err(e) => {
            Err(format!("Failed to initialize voice recognition: {}", e))
        }
    }
}

/// Start voice recognition service
#[tauri::command]
pub async fn start_voice_recognition() -> Result<(), String> {
    let state = VOICE_STATE.lock();

    if let Some(ref processor) = state.processor {
        processor.start()
            .map_err(|e| format!("Failed to start voice recognition: {}", e))?;
        Ok(())
    } else {
        Err("Voice recognition not initialized. Call initialize_voice_recognition first.".to_string())
    }
}

/// Stop voice recognition service
#[tauri::command]
pub async fn stop_voice_recognition() -> Result<(), String> {
    let state = VOICE_STATE.lock();

    if let Some(ref processor) = state.processor {
        processor.stop();
        Ok(())
    } else {
        Err("Voice recognition not initialized.".to_string())
    }
}

/// Get voice recognition status
#[tauri::command]
pub async fn get_voice_status() -> Result<VoiceStatus, String> {
    let state = VOICE_STATE.lock();

    let (is_running, mode_info, audio_level) = if let Some(ref processor) = state.processor {
        (
            processor.is_running(),
            Some(processor.transcriber.get_mode_info().to_string()),
            processor.get_audio_level()
        )
    } else {
        (false, None, 0.0)
    };

    Ok(VoiceStatus {
        is_initialized: state.is_initialized,
        is_running,
        mode_info,
        audio_level,
    })
}

/// Check if CUDA support is available in this build
#[tauri::command]
pub async fn is_cuda_available() -> Result<bool, String> {
    // Return true if built with CUDA feature, false otherwise
    #[cfg(feature = "whisper-cuda")]
    return Ok(true);

    #[cfg(not(feature = "whisper-cuda"))]
    return Ok(false);
}

