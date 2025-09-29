# Whisper 麦克风转录程序

一个使用 F2 键控制的实时语音转录程序，支持智能 GPU/CPU 模式切换。

## 功能特点

- 🎤 **F2 键控制**: 按住 F2 开始录音，松开停止录音并自动转录
- 🚀 **GPU 加速支持**: 支持 CUDA、OpenCL、Metal GPU 加速
- 🔄 **智能回退**: GPU 不可用时自动回退到 CPU 模式
- ⚡ **实时转录**: 录音结束后立即开始转录
- 🌍 **多语言支持**: 支持中文、英文等多种语言

## 安装和使用

### 1. CPU 版本 (默认，推荐新手使用)

```bash
cd whisper_mic_example
cargo run --release
```

### 2. GPU 加速版本

#### NVIDIA GPU (CUDA)
```bash
cargo run --release --features cuda
```

#### AMD/Intel GPU (OpenCL)
```bash
cargo run --release --features opencl
```

#### 全功能版本 (支持所有 GPU)
```bash
cargo run --release --features all-gpu
```

## 使用说明

1. 运行程序后等待模型加载完成
2. 按住 **F2** 键开始录音
3. 松开 **F2** 键停止录音并开始转录
4. 按 **Ctrl+C** 退出程序

## 性能对比

| 模式 | 转录速度 | 推荐场景 |
|------|----------|----------|
| CPU | 基准 | 日常使用、兼容性优先 |
| CUDA | 5-10x 提升 | 高频使用、性能优先 |
| OpenCL | 2-5x 提升 | AMD/Intel GPU |
