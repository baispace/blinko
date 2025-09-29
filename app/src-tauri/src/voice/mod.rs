pub mod config;
pub mod recorder;
pub mod transcriber;
pub mod processor;
pub mod commands;

pub use config::*;
pub use recorder::*;
pub use transcriber::*;
pub use processor::*;
pub use commands::*;

use std::sync::Arc;
use parking_lot::Mutex;

// Voice recognition state
pub struct VoiceRecognitionState {
    pub config: Arc<Mutex<VoiceConfig>>,
    pub processor: Option<Arc<VoiceProcessor>>,
    pub is_initialized: bool,
}

impl VoiceRecognitionState {
    pub fn new() -> Self {
        Self {
            config: Arc::new(Mutex::new(VoiceConfig::default())),
            processor: None,
            is_initialized: false,
        }
    }
}

impl Default for VoiceRecognitionState {
    fn default() -> Self {
        Self::new()
    }
}

// Global voice state
pub static VOICE_STATE: std::sync::LazyLock<Arc<Mutex<VoiceRecognitionState>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(VoiceRecognitionState::new())));