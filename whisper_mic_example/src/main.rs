use std::sync::Arc;
use std::thread;
use std::time::Duration;
use std::io;
use crossbeam_channel::{unbounded, Receiver, Sender};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::Stream;
use parking_lot::Mutex;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperState};

use enigo::{Enigo, Keyboard, Settings};
#[cfg(target_os = "windows")]
use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
#[cfg(target_os = "windows")]
use windows::Win32::UI::Input::KeyboardAndMouse::VK_F2;


struct AudioRecorder {
    is_recording: Arc<Mutex<bool>>,
    audio_data: Arc<Mutex<Vec<f32>>>,
    _stream: Stream,
}

impl AudioRecorder {
    fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let host = cpal::default_host();
        let device = host.default_input_device()
            .ok_or("No voice input device found!")?;

        println!("Using audio device: {}", device.name()?);

        let config = device.default_input_config()?;
        let sample_rate = config.sample_rate().0;
        let channels = config.channels();

        println!("Audio config: {} Hz, {} channels", sample_rate, channels);

        let is_recording = Arc::new(Mutex::new(false));
        let audio_data = Arc::new(Mutex::new(Vec::new()));

        let is_recording_clone = is_recording.clone();
        let audio_data_clone = audio_data.clone();

        // Use device's default config, resample during processing
        let stream_config = config.into();

        let stream = device.build_input_stream(
            &stream_config,
            move |data: &[f32], _| {
                let recording = *is_recording_clone.lock();
                if recording {
                    let mut audio_buffer = audio_data_clone.lock();
                    audio_buffer.extend_from_slice(data);
                }
            },
            |err| {
                eprintln!("Audio stream error: {}", err);
            },
            None,
        )?;

        stream.play()?;

        Ok(AudioRecorder {
            is_recording,
            audio_data,
            _stream: stream,
        })
    }

    fn start_recording(&self) {
        *self.is_recording.lock() = true;
        self.audio_data.lock().clear();
        println!("🎤 Recording started...");
    }

    fn stop_recording(&self) -> Vec<f32> {
        *self.is_recording.lock() = false;
        let data = self.audio_data.lock().clone();
        println!("⏹️  Recording stopped, recorded {:.2} seconds of audio", data.len() as f32 / 48000.0);

        // Resample to 16kHz (simple downsampling)
        let resample_ratio = 48000.0 / 16000.0; // 3:1
        let new_length = (data.len() as f32 / resample_ratio) as usize;
        let mut resampled = Vec::with_capacity(new_length);

        for i in 0..new_length {
            let index = (i as f32 * resample_ratio) as usize;
            if index < data.len() {
                resampled.push(data[index]);
            }
        }

        println!("After resampling: {:.2} seconds of audio (16kHz)", resampled.len() as f32 / 16000.0);
        resampled
    }

    fn is_recording(&self) -> bool {
        *self.is_recording.lock()
    }
}

fn detect_cuda_support() -> (bool, String) {
    #[cfg(target_os = "windows")]
    {
        // Detect CUDA runtime
        match std::process::Command::new("nvidia-smi")
            .arg("--query-gpu=name")
            .arg("--format=csv,noheader,nounits")
            .output() {
            Ok(output) if output.status.success() => {
                let gpu_names = String::from_utf8_lossy(&output.stdout);
                let gpu_list: Vec<&str> = gpu_names.lines().collect();
                if !gpu_list.is_empty() {
                    (true, format!("NVIDIA GPU: {}", gpu_list.join(", ")))
                } else {
                    (false, "NVIDIA driver installed but no GPU detected".to_string())
                }
            }
            _ => (false, "NVIDIA GPU or driver not detected".to_string())
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        (false, "CUDA support only available on Windows".to_string())
    }
}

fn detect_gpu_capabilities() -> (bool, String) {
    let mut gpu_info = Vec::new();
    let mut detailed_info = Vec::new();

    // Detect CUDA
    let (has_cuda, cuda_info) = detect_cuda_support();
    if has_cuda {
        gpu_info.push("CUDA");
        detailed_info.push(cuda_info);
    }

    // Detect OpenCL (simple check)
    if std::path::Path::new("C:\\Windows\\System32\\OpenCL.dll").exists() {
        gpu_info.push("OpenCL");
        detailed_info.push("OpenCL runtime available".to_string());
    }

    let has_gpu = !gpu_info.is_empty();
    let info = if has_gpu {
        format!("GPU support detected: {} | {}", gpu_info.join(", "), detailed_info.join(" | "))
    } else {
        if !has_cuda {
            format!("No GPU support detected | {}", detect_cuda_support().1)
        } else {
            "No GPU support detected".to_string()
        }
    };

    (has_gpu, info)
}

fn create_whisper_context_with_auto_fallback(model_path: &str) -> Result<(WhisperContext, String), Box<dyn std::error::Error>> {
    let (has_gpu, gpu_info) = detect_gpu_capabilities();
    println!("🔍 {}", gpu_info);

    // Try CUDA by default if available
    if has_gpu {
        println!("🚀 GPU support detected, attempting to enable GPU acceleration...");

        #[cfg(any(feature = "cuda", feature = "metal", feature = "opencl"))]
        {
            let mut ctx_params = WhisperContextParameters::default();
            ctx_params.use_gpu(true);

            match WhisperContext::new_with_params(model_path, ctx_params) {
                Ok(ctx) => {
                    println!("✅ GPU mode enabled successfully (CUDA acceleration)");
                    return Ok((ctx, "GPU (CUDA)".to_string()));
                }
                Err(e) => {
                    println!("⚠️ GPU mode failed: {}", e);
                    println!("💡 Possible reasons:");
                    println!("   - Incompatible CUDA runtime version");
                    println!("   - Insufficient GPU memory");
                    println!("   - Model file incompatible with GPU version");
                    println!("🔄 Auto-fallback to CPU mode");
                }
            }
        }
        #[cfg(not(any(feature = "cuda", feature = "metal", feature = "opencl")))]
        {
            println!("⚡ GPU hardware detected, but current build does not enable GPU support");
            println!("💡 To enable GPU acceleration (5-10x speed boost):");
            println!("   NVIDIA GPU: cargo build --release --features cuda");
            println!("   AMD/Intel:  cargo build --release --features opencl");
            println!("   Apple M1/M2: cargo build --release --features metal");
            println!("   Universal:   cargo build --release --features all-gpu");
            println!("🔄 Using CPU mode");
        }
    } else {
        println!("🔧 No GPU support detected, using CPU mode");
    }

    // Fallback to CPU mode
    println!("🔧 Initializing CPU mode...");
    let ctx_params = WhisperContextParameters::default();
    let ctx = WhisperContext::new_with_params(model_path, ctx_params)?;
    println!("✅ CPU mode enabled successfully");
    Ok((ctx, "CPU (auto-fallback)".to_string()))
}

fn send_text_to_active_window(text: &str) -> Result<(), Box<dyn std::error::Error>> {
    let mut enigo = Enigo::new(&Settings::default())?;
    enigo.text(text)?;
    Ok(())
}

fn transcribe_audio(ctx: &WhisperContext, audio_data: &[f32]) -> Result<String, Box<dyn std::error::Error>> {
    if audio_data.len() < 1600 { // At least 0.1 seconds of audio
        return Ok(String::new());
    }

    // Create state
    let mut state = ctx.create_state()?;

    // Create parameters
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(Some("zh"));
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    // Perform transcription
    state.full(params, audio_data)?;

    // Get transcription result
    let mut result = String::new();
    let num_segments = state.full_n_segments();

    for i in 0..num_segments {
        let segment = state.get_segment(i).ok_or("segment not found")?;
        let text = segment.to_str_lossy()?;
        result.push_str(&text);
    }

    Ok(result)
}



fn main() {
    println!("🚀 Whisper Microphone Transcription Program (Smart GPU/CPU Mode)");
    println!("=========================================");

    // Load model - smart GPU/CPU selection
    let model_path = r"C:\Users\94972\Downloads\ggml-large-v2-q5_0.bin";
    println!("📂 Loading model: {}", model_path);
    println!("🔍 Detecting system GPU support...");

    let (ctx, mode_info) = match create_whisper_context_with_auto_fallback(model_path) {
        Ok((ctx, info)) => {
            println!("✅ Model loaded successfully! Current mode: {}", info);
            (ctx, info)
        }
        Err(e) => {
            eprintln!("❌ Model loading failed: {}", e);
            println!("💡 Please ensure:");
            println!("   - Model file exists at the specified path");
            println!("   - Sufficient memory/VRAM available");
            println!("   - If using GPU, check CUDA drivers");
            return;
        }
    };

    // Create audio recorder
    let recorder = match AudioRecorder::new() {
        Ok(r) => Arc::new(r),
        Err(e) => {
            eprintln!("❌ Audio recorder initialization failed: {}", e);
            return;
        }
    };
    println!("🎵 Audio recorder initialized successfully");

    // 创建通信通道
    let (tx, rx): (Sender<Vec<f32>>, Receiver<Vec<f32>>) = unbounded();

    // Start transcription processing thread
    thread::spawn(move || {
        while let Ok(audio_data) = rx.recv() {
            if audio_data.len() < 1600 {
                continue;
            }

            println!("🔄 Transcribing audio... (using {})", mode_info);

            let start_time = std::time::Instant::now();
            match transcribe_audio(&ctx, &audio_data) {
                Ok(text) => {
                    let duration = start_time.elapsed();
                    if !text.trim().is_empty() {
                        println!("📝 Transcription result: {}", text.trim());
                        println!("⏱️  Transcription time: {:.2} seconds", duration.as_secs_f32());
                        if mode_info.contains("GPU") {
                            println!("🚀 GPU acceleration enabled");
                        }
                        // Send text to active window
                        if let Err(e) = send_text_to_active_window(text.trim()) {
                            eprintln!("❌ Failed to send text: {}", e);
                        }
                    } else {
                        println!("⚠️  No speech content detected");
                    }
                }
                Err(e) => {
                    eprintln!("❌ Transcription failed: {}", e);
                }
            }
        }
    });

    println!();
    println!("📋 Usage Instructions:");
    #[cfg(target_os = "windows")]
    {
        println!("   - Hold F2 key to start recording");
        println!("   - Release F2 key to stop recording and start transcription");
    }
    #[cfg(not(target_os = "windows"))]
    {
        println!("   - Recording functionality not implemented for this platform");
    }
    println!("   - Press Ctrl+C to exit the program");
    println!();
    #[cfg(target_os = "windows")]
    println!("🚀 Program started, waiting for F2 key press...");
    #[cfg(not(target_os = "windows"))]
    println!("🚀 Program started...");

    let mut last_f2_state = false;

    loop {
        // Check F2 key state
        #[cfg(target_os = "windows")]
        let f2_pressed = unsafe { GetAsyncKeyState(VK_F2.0 as i32) & 0x8000u16 as i16 != 0 };
        #[cfg(not(target_os = "windows"))]
        let f2_pressed = false; // Placeholder for non-Windows

        if f2_pressed != last_f2_state {
            if f2_pressed {
                // F2 pressed
                if !recorder.is_recording() {
                    recorder.start_recording();
                }
            } else {
                // F2 released
                if recorder.is_recording() {
                    let audio_data = recorder.stop_recording();
                    if !audio_data.is_empty() {
                        let _ = tx.send(audio_data);
                    }
                }
            }
            last_f2_state = f2_pressed;
        }

        // Sleep briefly to avoid high CPU usage
        thread::sleep(Duration::from_millis(10));
    }
}