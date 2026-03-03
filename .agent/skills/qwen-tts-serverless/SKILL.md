---
name: qwen-tts-serverless
description: Development rules and architecture guidelines for the Qwen3-TTS Voice Cloning & TTS platform, designed for local execution with serverless migration readiness.
---

# Qwen3-TTS Serverless Voice Cloning Platform — Development Skill

## 1. Decoupled Architecture (Arquitectura Desacoplada)

The project **MUST** be strictly divided into two independent components:

- **Backend**: A Python FastAPI server that handles all AI model inference, audio processing, and API logic. Located in `backend/`.
- **Frontend**: A standalone web interface (HTML/CSS/JS) that communicates with the backend exclusively through HTTP REST API calls. Located in `frontend/`.

**Rules:**
- The frontend MUST NEVER import or reference any Python/ML code.
- The backend MUST expose a clean REST API with CORS enabled.
- All communication between frontend and backend happens via JSON + base64-encoded audio.
- This separation enables the backend to be deployed independently to serverless GPU providers (e.g., RunPod) while the frontend can be hosted statically.

## 2. Lazy Loading & VRAM Management (Carga Perezosa)

The backend **MUST NOT** keep AI models loaded in GPU VRAM persistently. Instead, follow this strict lifecycle for every request:

```
REQUEST → Load Model → Generate Audio → Purge VRAM → RESPONSE
```

**Implementation Rules:**
1. **Load on demand**: Call `Qwen3TTSModel.from_pretrained(model_id, device_map="cuda:0", dtype=torch.bfloat16)` only when a generation request arrives.
2. **Generate**: Execute the appropriate `generate_*` method (custom_voice, voice_clone, voice_design).
3. **Purge immediately**: After generation completes (success or failure), execute:
   ```python
   del model
   gc.collect()
   torch.cuda.empty_cache()
   ```
4. **Thread safety**: Use a `threading.Lock()` to ensure only one model is loaded at any given time. Concurrent requests must queue.
5. **OOM handling**: Catch `torch.cuda.OutOfMemoryError` explicitly. If OOM occurs, attempt cleanup and return a clear error message to the client.

**Rationale:** This pattern is essential for serverless environments where you pay per second of GPU usage. Models should only consume VRAM during active inference.

## 3. Quality Swapping (Intercambio de Calidades)

The API **MUST** accept a `quality` parameter to decide which model to instantiate:

| Quality Value | Model ID | VRAM Usage | Use Case |
|---|---|---|---|
| `fast` (0.6B) | `Qwen/Qwen3-TTS-12Hz-0.6B-*` | ~2GB | Quick drafts, previews |
| `quality` (1.7B) | `Qwen/Qwen3-TTS-12Hz-1.7B-*` | ~5GB | Final production audio |

**Rules:**
- The default quality MUST be `fast` to minimize costs.
- The model variant (Base, CustomVoice, VoiceDesign) is determined by the `mode` parameter, NOT the quality parameter.
- Quality + Mode together determine the exact HuggingFace model ID to load.

## 4. Model Variant Matrix

| Mode | 0.6B (fast) | 1.7B (quality) |
|---|---|---|
| `custom_voice` | `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice` | `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` |
| `voice_clone` | `Qwen/Qwen3-TTS-12Hz-0.6B-Base` | `Qwen/Qwen3-TTS-12Hz-1.7B-Base` |
| `voice_design` | ❌ Not available | `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign` |

## 5. API Design

The primary endpoint is `POST /generate_audio` which accepts:

```json
{
  "text": "Text to synthesize",
  "language": "English",
  "mode": "custom_voice | voice_clone | voice_design",
  "quality": "fast | quality",
  "speaker": "Vivian",
  "instruct": "Optional emotional/style instruction",
  "ref_audio_base64": "base64-encoded reference audio (voice_clone only)",
  "ref_text": "Transcript of reference audio (voice_clone only)"
}
```

## 6. Technology Stack

- **Backend**: Python 3.12, FastAPI, uvicorn, qwen-tts, torch, soundfile
- **Frontend**: Vanilla HTML/CSS/JS (dark mode, modern design)
- **Audio format**: WAV (server-side), with browser-native playback
- **dtype**: Always use `torch.bfloat16` for model loading
