"""
Qwen3-TTS Backend — TTS Engine
Core inference engine with lazy loading and VRAM management.

Follows the SKILL.md pattern:
  REQUEST → Load Model → Generate Audio → Purge VRAM → RESPONSE
"""

import gc
import io
import base64
import logging
import tempfile
import threading
from typing import Optional, Tuple

import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
#  Lazy imports for torch and qwen_tts
#  (only imported when actually generating)
# ──────────────────────────────────────────────

_torch = None
_Qwen3TTSModel = None


def _ensure_imports():
    """Lazy-import torch and qwen_tts to avoid loading them at server startup."""
    global _torch, _Qwen3TTSModel
    if _torch is None:
        import torch
        _torch = torch
    if _Qwen3TTSModel is None:
        from qwen_tts import Qwen3TTSModel
        _Qwen3TTSModel = Qwen3TTSModel


# ──────────────────────────────────────────────
#  TTS Engine Class
# ──────────────────────────────────────────────

class TTSEngine:
    """
    Manages Qwen3-TTS model lifecycle with strict VRAM management.
    
    Key principles:
    - Models are NEVER kept loaded between requests
    - VRAM is purged after every generation
    - A threading lock prevents concurrent model loads
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._model = None

    # ──── Model Lifecycle ────

    def _load_model(self, model_id: str):
        """
        Load a Qwen3-TTS model into GPU memory.
        
        Uses bfloat16 precision as recommended by the official docs.
        Attempts flash_attention_2 first, falls back to eager if unavailable.
        """
        _ensure_imports()
        
        logger.info(f"⏳ Loading model: {model_id}")

        # Determine attention implementation
        attn_impl = "flash_attention_2"
        try:
            import flash_attn  # noqa: F401
        except ImportError:
            attn_impl = "eager"
            logger.warning(
                "⚠️ flash-attn not installed. Using 'eager' attention. "
                "Install flash-attn for lower VRAM usage."
            )

        # Determine device
        if _torch.cuda.is_available():
            device = "cuda:0"
        else:
            device = "cpu"
            attn_impl = "eager"
            logger.warning("⚠️ No CUDA GPU detected. Running on CPU (will be slow).")

        self._model = _Qwen3TTSModel.from_pretrained(
            model_id,
            device_map=device,
            dtype=_torch.bfloat16,
            attn_implementation=attn_impl,
        )

        logger.info(f"✅ Model loaded on {device}: {model_id}")

    def _unload_model(self):
        """
        Purge the model from memory and free GPU VRAM.
        
        This is called after EVERY generation, regardless of success or failure.
        """
        _ensure_imports()

        if self._model is not None:
            del self._model
            self._model = None

        gc.collect()

        if _torch.cuda.is_available():
            _torch.cuda.empty_cache()
            _torch.cuda.synchronize()
            logger.info("🧹 VRAM purged successfully.")

    # ──── Audio Generation ────

    def generate(
        self,
        model_id: str,
        mode: str,
        text: str,
        language: str = "Auto",
        speaker: Optional[str] = None,
        instruct: Optional[str] = None,
        ref_audio_base64: Optional[str] = None,
        ref_text: Optional[str] = None,
    ) -> Tuple[str, int, float]:
        """
        Generate audio using the specified model and mode.
        
        Returns:
            Tuple of (audio_base64, sample_rate, duration_seconds)
            
        Raises:
            RuntimeError: If generation fails
            torch.cuda.OutOfMemoryError: If GPU runs out of memory
        """
        _ensure_imports()
        
        with self._lock:
            try:
                # 1. Load model
                self._load_model(model_id)

                # 2. Generate based on mode
                if mode == "custom_voice":
                    wavs, sr = self._generate_custom_voice(
                        text, language, speaker, instruct
                    )
                elif mode == "voice_clone":
                    wavs, sr = self._generate_voice_clone(
                        text, language, ref_audio_base64, ref_text
                    )
                elif mode == "voice_design":
                    wavs, sr = self._generate_voice_design(
                        text, language, instruct
                    )
                else:
                    raise ValueError(f"Unknown mode: {mode}")

                # 3. Encode audio to base64 WAV
                audio_b64, duration = self._encode_audio(wavs[0], sr)

                logger.info(
                    f"✅ Generated {duration:.2f}s audio "
                    f"({mode}, {language}, sr={sr})"
                )

                return audio_b64, sr, duration

            except Exception as e:
                # Handle OOM specifically
                if _torch.cuda.is_available() and isinstance(
                    e, _torch.cuda.OutOfMemoryError
                ):
                    logger.error(f"💥 GPU Out of Memory: {e}")
                    raise RuntimeError(
                        "GPU out of memory. Try using quality='fast' (0.6B model) "
                        "or shorter text. If the problem persists, restart the server."
                    ) from e
                else:
                    logger.error(f"❌ Generation failed: {e}")
                    raise

            finally:
                # 4. ALWAYS purge VRAM, even on failure
                self._unload_model()

    # ──── Mode-Specific Generators ────

    def _generate_custom_voice(
        self,
        text: str,
        language: str,
        speaker: Optional[str],
        instruct: Optional[str],
    ) -> Tuple[list, int]:
        """Generate audio using a preset speaker voice."""
        kwargs = {
            "text": text,
            "language": language,
            "speaker": speaker or "Vivian",
        }
        if instruct:
            kwargs["instruct"] = instruct

        wavs, sr = self._model.generate_custom_voice(**kwargs)
        return wavs, sr

    def _generate_voice_clone(
        self,
        text: str,
        language: str,
        ref_audio_base64: Optional[str],
        ref_text: Optional[str],
    ) -> Tuple[list, int]:
        """Clone a voice from a reference audio clip."""
        if not ref_audio_base64:
            raise ValueError(
                "ref_audio_base64 is required for voice_clone mode. "
                "Provide a base64-encoded audio file."
            )

        # Decode base64 audio to a temporary file
        audio_bytes = base64.b64decode(ref_audio_base64)
        
        # Write to temp file so qwen-tts can read it
        with tempfile.NamedTemporaryFile(
            suffix=".wav", delete=False
        ) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        kwargs = {
            "text": text,
            "language": language,
            "ref_audio": tmp_path,
        }
        
        if ref_text:
            kwargs["ref_text"] = ref_text
        else:
            # If no ref_text, use x_vector_only_mode
            kwargs["x_vector_only_mode"] = True

        wavs, sr = self._model.generate_voice_clone(**kwargs)
        
        # Clean up temp file
        import os
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

        return wavs, sr

    def _generate_voice_design(
        self,
        text: str,
        language: str,
        instruct: Optional[str],
    ) -> Tuple[list, int]:
        """Design a voice from a natural language description."""
        if not instruct:
            raise ValueError(
                "instruct is required for voice_design mode. "
                "Provide a description of the desired voice."
            )

        wavs, sr = self._model.generate_voice_design(
            text=text,
            language=language,
            instruct=instruct,
        )
        return wavs, sr

    # ──── Audio Encoding ────

    @staticmethod
    def _encode_audio(wav: np.ndarray, sr: int) -> Tuple[str, float]:
        """
        Encode a numpy audio waveform to a base64-encoded WAV string.
        
        Returns:
            Tuple of (base64_string, duration_seconds)
        """
        buffer = io.BytesIO()
        sf.write(buffer, wav, sr, format="WAV")
        buffer.seek(0)

        audio_b64 = base64.b64encode(buffer.read()).decode("utf-8")
        duration = len(wav) / sr

        return audio_b64, duration

    # ──── GPU Info ────

    @staticmethod
    def get_gpu_info() -> dict:
        """Get current GPU status information."""
        _ensure_imports()

        if not _torch.cuda.is_available():
            return {"available": False}

        try:
            gpu_name = _torch.cuda.get_device_name(0)
            vram_total = _torch.cuda.get_device_properties(0).total_mem / (1024**3)
            vram_free = (
                _torch.cuda.get_device_properties(0).total_mem
                - _torch.cuda.memory_allocated(0)
            ) / (1024**3)

            return {
                "available": True,
                "name": gpu_name,
                "vram_total_gb": round(vram_total, 2),
                "vram_free_gb": round(vram_free, 2),
            }
        except Exception as e:
            logger.warning(f"Could not get GPU info: {e}")
            return {"available": True, "name": "Unknown"}


# ──────────────────────────────────────────────
#  Singleton Instance
# ──────────────────────────────────────────────

engine = TTSEngine()
