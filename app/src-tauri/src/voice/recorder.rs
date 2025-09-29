use std::sync::Arc;
use std::error::Error;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::Stream;
use parking_lot::Mutex;

pub struct AudioRecorder {
    is_recording: Arc<Mutex<bool>>,
    audio_data: Arc<Mutex<Vec<f32>>>,
    _stream: Stream,
    sample_rate: u32,
    channels: u16,
}

impl AudioRecorder {
    pub fn new() -> Result<Self, Box<dyn Error>> {
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
            sample_rate,
            channels,
        })
    }

    pub fn start_recording(&self) {
        *self.is_recording.lock() = true;
        self.audio_data.lock().clear();
        println!("🎤 Recording started...");
    }

    pub fn stop_recording(&self) -> Vec<f32> {
        *self.is_recording.lock() = false;
        let data = self.audio_data.lock().clone();
        println!("⏹️  Recording stopped, recorded {:.2} seconds of audio",
                data.len() as f32 / self.sample_rate as f32);

        // Resample to 16kHz for Whisper (simple downsampling)
        let target_sample_rate = 16000.0;
        let resample_ratio = self.sample_rate as f32 / target_sample_rate;
        let new_length = (data.len() as f32 / resample_ratio) as usize;
        let mut resampled = Vec::with_capacity(new_length);

        for i in 0..new_length {
            let index = (i as f32 * resample_ratio) as usize;
            if index < data.len() {
                // Convert stereo to mono if needed
                if self.channels == 2 && index + 1 < data.len() {
                    let mono_sample = (data[index] + data[index + 1]) / 2.0;
                    resampled.push(mono_sample);
                } else {
                    resampled.push(data[index]);
                }
            }
        }

        println!("After resampling: {:.2} seconds of audio (16kHz)",
                resampled.len() as f32 / target_sample_rate);
        resampled
    }

    pub fn is_recording(&self) -> bool {
        *self.is_recording.lock()
    }

    pub fn get_audio_level(&self) -> f32 {
        let data = self.audio_data.lock();
        if data.is_empty() {
            return 0.0;
        }

        // Calculate RMS level for the last 1024 samples
        let samples_to_check = std::cmp::min(1024, data.len());
        let start_idx = data.len() - samples_to_check;

        let rms: f32 = data[start_idx..]
            .iter()
            .map(|sample| sample * sample)
            .sum::<f32>() / samples_to_check as f32;

        rms.sqrt()
    }
}