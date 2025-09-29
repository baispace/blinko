use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const VOICE_CONFIG_FILE: &str = "voice_config.json";

/// Detect system language and map to Whisper language code
fn detect_system_language() -> String {
    match sys_locale::get_locale() {
        Some(locale) => {
            let locale = locale.to_lowercase();
            // Map system locale to Whisper language codes
            if locale.starts_with("zh") {
                "zh".to_string() // Chinese
            } else if locale.starts_with("ja") {
                "ja".to_string() // Japanese
            } else if locale.starts_with("ko") {
                "ko".to_string() // Korean
            } else if locale.starts_with("fr") {
                "fr".to_string() // French
            } else if locale.starts_with("de") {
                "de".to_string() // German
            } else if locale.starts_with("es") {
                "es".to_string() // Spanish
            } else if locale.starts_with("ru") {
                "ru".to_string() // Russian
            } else if locale.starts_with("ar") {
                "ar".to_string() // Arabic
            } else if locale.starts_with("pt") {
                "pt".to_string() // Portuguese
            } else if locale.starts_with("it") {
                "it".to_string() // Italian
            } else if locale.starts_with("hi") {
                "hi".to_string() // Hindi
            } else if locale.starts_with("th") {
                "th".to_string() // Thai
            } else if locale.starts_with("en") || locale.contains("en") {
                "en".to_string() // English
            } else {
                // Default to auto-detect for unsupported languages
                "auto".to_string()
            }
        }
        None => {
            // Fallback to auto-detect if system locale cannot be determined
            "auto".to_string()
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VoiceConfig {
    /// Whether voice recognition is enabled
    pub enabled: bool,

    /// Voice recognition hotkey (default: F2)
    pub hotkey: String,

    /// Whether GPU acceleration is enabled (Windows only)
    #[serde(rename = "gpuAcceleration")]
    pub gpu_acceleration: bool,

    /// Model download path
    #[serde(rename = "modelPath")]
    pub model_path: String,

    /// Language for voice recognition (default: auto)
    pub language: String,

    /// Voice recognition sensitivity (0.0 - 1.0)
    pub sensitivity: f32,

    /// Minimum audio duration in seconds before processing
    #[serde(rename = "minDuration")]
    pub min_duration: f32,

    /// Maximum audio duration in seconds before auto-stop
    #[serde(rename = "maxDuration")]
    pub max_duration: f32,

    /// Sample rate for audio processing
    #[serde(rename = "sampleRate")]
    pub sample_rate: u32,

    /// Auto-detect GPU capabilities
    #[serde(rename = "autoGpuDetection")]
    pub auto_gpu_detection: bool,
}

impl Default for VoiceConfig {
    fn default() -> Self {
        let system_language = detect_system_language();
        println!("🌍 Detected system language for voice recognition: {}", system_language);

        Self {
            enabled: false,
            hotkey: "F2".to_string(),
            gpu_acceleration: cfg!(target_os = "windows"), // Default GPU on Windows
            model_path: String::new(), // User must select model path
            language: system_language, // Use detected system language
            sensitivity: 0.6,
            min_duration: 0.1, // 100ms minimum
            max_duration: 30.0, // 30 seconds maximum
            sample_rate: 16000, // 16kHz for Whisper
            auto_gpu_detection: true,
        }
    }
}

impl VoiceConfig {
    /// Get supported languages (kept for potential future use)
    pub fn get_supported_languages() -> Vec<(&'static str, &'static str)> {
        vec![
            ("auto", "Auto-detect"),
            ("en", "English"),
            ("zh", "Chinese"),
            ("ja", "Japanese"),
            ("ko", "Korean"),
            ("fr", "French"),
            ("de", "German"),
            ("es", "Spanish"),
            ("ru", "Russian"),
            ("ar", "Arabic"),
            ("pt", "Portuguese"),
            ("it", "Italian"),
            ("hi", "Hindi"),
            ("th", "Thai"),
        ]
    }
}

/// Get voice config file path
fn get_voice_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    // Ensure directory exists
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }

    Ok(app_data_dir.join(VOICE_CONFIG_FILE))
}

/// Load voice config from file
pub fn load_voice_config(app: &AppHandle) -> VoiceConfig {
    match get_voice_config_path(app) {
        Ok(path) => {
            if path.exists() {
                match fs::read_to_string(&path) {
                    Ok(content) => {
                        match serde_json::from_str::<VoiceConfig>(&content) {
                            Ok(config) => {
                                println!("📁 Loaded existing voice config from: {}", path.display());
                                return config;
                            }
                            Err(e) => {
                                eprintln!("Failed to parse voice config: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to read voice config file: {}", e);
                    }
                }
            } else {
                println!("🆕 Voice config file does not exist, creating with system language defaults");
            }
        }
        Err(e) => {
            eprintln!("Failed to get voice config path: {}", e);
        }
    }

    // Create default config with system language detection
    let default_config = VoiceConfig::default();

    // Save the default config so it persists for next time
    if let Err(e) = save_voice_config(app, &default_config) {
        eprintln!("Failed to save default voice config: {}", e);
    }

    default_config
}

/// Save voice config to file
pub fn save_voice_config(app: &AppHandle, config: &VoiceConfig) -> Result<(), String> {
    let path = get_voice_config_path(app)?;

    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize voice config: {}", e))?;

    fs::write(&path, content)
        .map_err(|e| format!("Failed to write voice config to file: {}", e))?;

    println!("Saved voice config to: {}", path.display());
    Ok(())
}

/// Validate voice config
pub fn validate_voice_config(config: &VoiceConfig) -> Result<(), String> {
    // Check if model file path is provided and exists
    if config.model_path.is_empty() {
        return Err("Model file path is not set. Please select a Whisper model file.".to_string());
    }

    if !std::path::Path::new(&config.model_path).exists() {
        return Err(format!("Model file not found: {}", config.model_path));
    }

    // Check sensitivity range
    if config.sensitivity < 0.0 || config.sensitivity > 1.0 {
        return Err("Sensitivity must be between 0.0 and 1.0".to_string());
    }

    // Check duration ranges
    if config.min_duration <= 0.0 {
        return Err("Minimum duration must be positive".to_string());
    }

    if config.max_duration <= config.min_duration {
        return Err("Maximum duration must be greater than minimum duration".to_string());
    }

    // Check sample rate
    if config.sample_rate < 8000 || config.sample_rate > 48000 {
        return Err("Sample rate must be between 8000 and 48000 Hz".to_string());
    }

    Ok(())
}