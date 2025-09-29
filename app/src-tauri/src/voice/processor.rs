use std::sync::Arc;
use std::thread;
use std::time::Instant;
use parking_lot::Mutex;
use crossbeam_channel::{unbounded, Receiver, Sender};
use enigo::{Enigo, Keyboard, Settings};
use rdev::{listen, Event, EventType, Key};

use super::{AudioRecorder, WhisperTranscriber, VoiceConfig};

pub struct VoiceProcessor {
    recorder: Arc<AudioRecorder>,
    pub transcriber: Arc<WhisperTranscriber>,
    config: Arc<Mutex<VoiceConfig>>,
    tx: Sender<Vec<f32>>,
    is_running: Arc<Mutex<bool>>,
}

impl VoiceProcessor {
    pub fn new(config: VoiceConfig) -> Result<Self, Box<dyn std::error::Error>> {
        // Initialize audio recorder with error handling
        let recorder = match AudioRecorder::new() {
            Ok(recorder) => {
                Arc::new(recorder)
            }
            Err(e) => {
                let error_msg = format!("Failed to initialize audio recorder: {}", e);
                eprintln!("❌ {}", error_msg);
                return Err(error_msg.into());
            }
        };

        // Initialize transcriber with error handling
        let transcriber = match WhisperTranscriber::new(&config.model_path, config.gpu_acceleration) {
            Ok(transcriber) => {
                Arc::new(transcriber)
            }
            Err(e) => {
                let error_msg = format!("Failed to initialize Whisper transcriber: {}", e);
                eprintln!("❌ {}", error_msg);
                return Err(error_msg.into());
            }
        };

        // Create communication channel
        let (tx, rx): (Sender<Vec<f32>>, Receiver<Vec<f32>>) = unbounded();

        let config_arc = Arc::new(Mutex::new(config));
        let is_running = Arc::new(Mutex::new(false));

        // Start transcription processing thread with error handling
        let transcriber_clone = transcriber.clone();
        let config_clone = config_arc.clone();
        thread::spawn(move || {
            Self::transcription_loop(rx, transcriber_clone, config_clone);
        });

        println!("✅ Voice processor initialized successfully");
        println!("🎵 Using transcriber mode: {}", transcriber.get_mode_info());

        Ok(VoiceProcessor {
            recorder,
            transcriber,
            config: config_arc,
            tx,
            is_running,
        })
    }

    /// Start the voice recognition service
    pub fn start(&self) -> Result<(), Box<dyn std::error::Error>> {
        *self.is_running.lock() = true;

        // Start global keyboard event monitoring thread
        let recorder = self.recorder.clone();
        let tx = self.tx.clone();
        let is_running = self.is_running.clone();
        let config_arc = self.config.clone();

        thread::spawn(move || {
            Self::global_keyboard_event_loop(recorder, tx, is_running, config_arc);
        });

        println!("🚀 Voice recognition service started successfully");
        Ok(())
    }

    /// Stop the voice recognition service
    pub fn stop(&self) {
        *self.is_running.lock() = false;
    }

    /// Update configuration
    pub fn update_config(&self, new_config: VoiceConfig) {
        *self.config.lock() = new_config;
    }

    /// Get current configuration
    pub fn get_config(&self) -> VoiceConfig {
        self.config.lock().clone()
    }

    /// Check if the processor is running
    pub fn is_running(&self) -> bool {
        *self.is_running.lock()
    }

    /// Get current audio level (for UI feedback)
    pub fn get_audio_level(&self) -> f32 {
        self.recorder.get_audio_level()
    }

    /// Global keyboard event monitoring loop using rdev
    fn global_keyboard_event_loop(
        recorder: Arc<AudioRecorder>,
        tx: Sender<Vec<f32>>,
        is_running: Arc<Mutex<bool>>,
        config: Arc<Mutex<VoiceConfig>>
    ) {
        use std::sync::LazyLock;

        // Use static variables to avoid closure capture issues
        static GLOBAL_RECORDER: LazyLock<Mutex<Option<Arc<AudioRecorder>>>> = LazyLock::new(|| Mutex::new(None));
        static GLOBAL_TX: LazyLock<Mutex<Option<Sender<Vec<f32>>>>> = LazyLock::new(|| Mutex::new(None));
        static GLOBAL_CONFIG: LazyLock<Mutex<Option<Arc<Mutex<VoiceConfig>>>>> = LazyLock::new(|| Mutex::new(None));
        static GLOBAL_IS_RUNNING: LazyLock<Mutex<Option<Arc<Mutex<bool>>>>> = LazyLock::new(|| Mutex::new(None));
        static TARGET_KEY: LazyLock<Mutex<Key>> = LazyLock::new(|| Mutex::new(Key::F2));
        static RECORDING_START_TIME: LazyLock<Mutex<Option<Instant>>> = LazyLock::new(|| Mutex::new(None));

        // Set global values
        {
            let config_snapshot = config.lock().clone();
            let target_key = Self::parse_hotkey(&config_snapshot.hotkey).unwrap_or(Key::F2);

            *GLOBAL_RECORDER.lock() = Some(recorder);
            *GLOBAL_TX.lock() = Some(tx);
            *GLOBAL_CONFIG.lock() = Some(config);
            *GLOBAL_IS_RUNNING.lock() = Some(is_running);
            *TARGET_KEY.lock() = target_key;
        }

        // Start listening for global keyboard events
        if let Err(e) = listen(|event| {
            // Get global values
            let recorder = if let Some(ref recorder) = *GLOBAL_RECORDER.lock() {
                recorder.clone()
            } else {
                return;
            };

            let tx = if let Some(ref tx) = *GLOBAL_TX.lock() {
                tx.clone()
            } else {
                return;
            };

            let config = if let Some(ref config) = *GLOBAL_CONFIG.lock() {
                config.clone()
            } else {
                return;
            };

            let is_running = if let Some(ref is_running) = *GLOBAL_IS_RUNNING.lock() {
                is_running.clone()
            } else {
                return;
            };

            let target_key = *TARGET_KEY.lock();

            // Check if we should still be running
            if !*is_running.lock() {
                return;
            }

            let config_snapshot = config.lock().clone();

            // Check if voice recognition is enabled
            if !config_snapshot.enabled {
                return;
            }

            // Simple key press/release detection
            let Event { event_type, .. } = event;
            match event_type {
                EventType::KeyPress(key) => {
                    if key == target_key {
                        // Start recording immediately when target key is pressed
                        if !recorder.is_recording() {
                            *RECORDING_START_TIME.lock() = Some(Instant::now());
                            recorder.start_recording();
                        }
                    }
                }
                EventType::KeyRelease(key) => {
                    if key == target_key {
                        // Stop recording when target key is released
                        if recorder.is_recording() {
                            // Check if recording duration is at least 500ms
                            if let Some(start_time) = *RECORDING_START_TIME.lock() {
                                let recording_duration = start_time.elapsed();
                                if recording_duration.as_millis() >= 500 {
                                    let audio_data = recorder.stop_recording();
                                    if !audio_data.is_empty() &&
                                       audio_data.len() as f32 / 16000.0 >= config_snapshot.min_duration {
                                        if let Err(e) = tx.send(audio_data) {
                                            eprintln!("Failed to send audio data for processing: {}", e);
                                        }
                                    }
                                } else {
                                    recorder.stop_recording(); // Discard the recording
                                }
                            } else {
                                recorder.stop_recording(); // Fallback if start time not recorded
                            }
                            // Clear the recording start time
                            *RECORDING_START_TIME.lock() = None;
                        }
                    }
                }
                _ => {}
            }
        }) {
            eprintln!("❌ Failed to start global keyboard listener: {:?}", e);
        }
    }

    /// Parse hotkey string to rdev Key
    fn parse_hotkey(hotkey_str: &str) -> Option<Key> {
        match hotkey_str.to_uppercase().as_str() {
            // Function keys F1-F12
            "F1" => Some(Key::F1),
            "F2" => Some(Key::F2),
            "F3" => Some(Key::F3),
            "F4" => Some(Key::F4),
            "F5" => Some(Key::F5),
            "F6" => Some(Key::F6),
            "F7" => Some(Key::F7),
            "F8" => Some(Key::F8),
            "F9" => Some(Key::F9),
            "F10" => Some(Key::F10),
            "F11" => Some(Key::F11),
            "F12" => Some(Key::F12),

            // Special keys
            "ALT" => Some(Key::Alt),
            "OPTION" => Some(Key::Alt), // macOS Option key (same as Alt)
            "WIN" | "WINDOWS" | "CMD" | "META" => Some(Key::MetaLeft), // Windows key / Cmd key
            "CTRL" | "CONTROL" => Some(Key::ControlLeft),
            "TAB" => Some(Key::Tab),
            "SPACE" => Some(Key::Space),

            // Removed keys that interfere with text input:
            // "ENTER" => Some(Key::Return), // Interferes with text input
            // "~" | "TILDE" | "`" | "GRAVE" => Some(Key::BackQuote), // Interferes with text input
            "ESC" | "ESCAPE" => Some(Key::Escape),
            "SHIFT" => Some(Key::ShiftLeft),
            "CAPS" | "CAPSLOCK" => Some(Key::CapsLock),

            _ => {
                None
            }
        }
    }


    /// Transcription processing loop
    fn transcription_loop(
        rx: Receiver<Vec<f32>>,
        transcriber: Arc<WhisperTranscriber>,
        config: Arc<Mutex<VoiceConfig>>
    ) {
        while let Ok(audio_data) = rx.recv() {
            let config_snapshot = config.lock().clone();

            if audio_data.len() < (config_snapshot.min_duration * 16000.0) as usize {
                continue;
            }

            let language = if config_snapshot.language == "auto" {
                None
            } else {
                Some(config_snapshot.language.as_str())
            };

            match transcriber.transcribe(&audio_data, language) {
                Ok(text) => {
                    if !text.trim().is_empty() {
                        println!("📝 {}", text.trim());

                        // Send text to active window
                        if let Err(e) = Self::send_text_to_active_window(&text.trim()) {
                            eprintln!("❌ Failed to send text: {}", e);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("❌ Transcription failed: {}", e);
                }
            }
        }
    }

    /// Send transcribed text to the active window
    fn send_text_to_active_window(text: &str) -> Result<(), Box<dyn std::error::Error>> {
        let mut enigo = Enigo::new(&Settings::default())?;
        enigo.text(text)?;
        Ok(())
    }
}