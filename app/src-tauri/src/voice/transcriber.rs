use std::error::Error;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

pub struct WhisperTranscriber {
    context: WhisperContext,
    mode_info: String,
}

impl WhisperTranscriber {
    /// Create a new WhisperTranscriber with automatic GPU/CPU fallback
    pub fn new(model_path: &str, use_gpu: bool) -> Result<Self, Box<dyn Error>> {
        let (context, mode_info) = create_whisper_context_with_auto_fallback(model_path, use_gpu)?;
        Ok(Self { context, mode_info })
    }

    /// Get the current mode info (GPU/CPU)
    pub fn get_mode_info(&self) -> &str {
        &self.mode_info
    }

    /// Transcribe audio data to text
    pub fn transcribe(
        &self,
        audio_data: &[f32],
        language: Option<&str>,
    ) -> Result<String, Box<dyn Error>> {
        if audio_data.len() < 1600 {
            // At least 0.1 seconds of audio at 16kHz
            return Ok(String::new());
        }

        // Create state
        let mut state = self.context.create_state()?;

        // Create parameters
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

        // Set language if specified
        if let Some(lang) = language {
            if lang != "auto" {
                params.set_language(Some(lang));
            }
        }

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

        Ok(result.trim().to_string())
    }
}

/// Detect CUDA support (Windows specific)
fn detect_cuda_support() -> (bool, String) {
    #[cfg(target_os = "windows")]
    {
        // Detect CUDA runtime
        match std::process::Command::new("nvidia-smi")
            .arg("--query-gpu=name")
            .arg("--format=csv,noheader,nounits")
            .output()
        {
            Ok(output) if output.status.success() => {
                let gpu_names = String::from_utf8_lossy(&output.stdout);
                let gpu_list: Vec<&str> = gpu_names.lines().collect();
                if !gpu_list.is_empty() {
                    (true, format!("NVIDIA GPU: {}", gpu_list.join(", ")))
                } else {
                    (
                        false,
                        "NVIDIA driver installed but no GPU detected".to_string(),
                    )
                }
            }
            _ => (false, "NVIDIA GPU or driver not detected".to_string()),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        (false, "CUDA support only available on Windows".to_string())
    }
}

/// Detect Metal support (macOS specific)
#[cfg(target_os = "macos")]
fn detect_metal_support() -> (bool, String) {
    // For now, we don't use Metal feature as it's not available in whisper-rs
    (false, "Metal support not enabled in this build".to_string())
}

#[cfg(not(target_os = "macos"))]
fn detect_metal_support() -> (bool, String) {
    (false, "Metal support only available on macOS".to_string())
}

/// Detect GPU capabilities
fn detect_gpu_capabilities() -> (bool, String) {
    let mut gpu_info = Vec::new();
    let mut detailed_info = Vec::new();

    // Detect CUDA
    let (has_cuda, cuda_info) = detect_cuda_support();
    if has_cuda {
        gpu_info.push("CUDA");
        detailed_info.push(cuda_info);
    }

    // Detect Metal (macOS)
    let (has_metal, metal_info) = detect_metal_support();
    if has_metal {
        gpu_info.push("Metal");
        detailed_info.push(metal_info);
    }

    // Detect OpenCL (simple check)
    #[cfg(target_os = "windows")]
    if std::path::Path::new("C:\\Windows\\System32\\OpenCL.dll").exists() {
        gpu_info.push("OpenCL");
        detailed_info.push("OpenCL runtime available".to_string());
    }

    let has_gpu = !gpu_info.is_empty();
    let info = if has_gpu {
        format!(
            "GPU support detected: {} | {}",
            gpu_info.join(", "),
            detailed_info.join(" | ")
        )
    } else {
        "No GPU support detected".to_string()
    };

    (has_gpu, info)
}

/// Create WhisperContext with automatic GPU/CPU fallback
fn create_whisper_context_with_auto_fallback(
    model_path: &str,
    prefer_gpu: bool,
) -> Result<(WhisperContext, String), Box<dyn Error>> {
    let (has_gpu, gpu_info) = detect_gpu_capabilities();
    println!("🔍 {}", gpu_info);

    // Try GPU first if preferred and available
    if prefer_gpu && has_gpu {
        println!("🚀 GPU support detected, attempting to enable GPU acceleration...");

        // Check which GPU features are compiled in
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
        if prefer_gpu && has_gpu {
            println!("⚡ GPU hardware detected, but CUDA feature not enabled");
            println!("💡 To enable GPU acceleration on Windows:");
            println!("   Add 'cuda' feature to build");
            println!("🔄 Using CPU mode");
        }
    } else if prefer_gpu && !has_gpu {
        println!("🔧 GPU acceleration requested but no GPU support detected, using CPU mode");
    } else {
        println!("🔧 CPU mode selected");
    }

    // Fallback to CPU mode
    println!("🔧 Initializing CPU mode...");
    let ctx_params = WhisperContextParameters::default();
    let ctx = WhisperContext::new_with_params(model_path, ctx_params)?;
    println!("✅ CPU mode enabled successfully");
    Ok((ctx, "CPU".to_string()))
}
