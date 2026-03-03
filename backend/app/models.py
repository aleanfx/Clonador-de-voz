"""
Qwen3-TTS Backend — Pydantic Schemas
Request and response models for the API.
"""

from typing import Optional, List
from pydantic import BaseModel, Field

from .config import (
    SUPPORTED_QUALITIES,
    SUPPORTED_MODES,
    SUPPORTED_LANGUAGES,
    DEFAULT_SPEAKERS,
)


# ──────────────────────────────────────────────
#  Request Schemas
# ──────────────────────────────────────────────

class GenerateAudioRequest(BaseModel):
    """Request body for the /generate_audio endpoint."""

    text: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        description="Text to synthesize into speech.",
        examples=["Hello, this is a test of voice synthesis."],
    )
    language: str = Field(
        default="Auto",
        description=f"Target language. Options: {SUPPORTED_LANGUAGES}",
        examples=["English", "Chinese", "Auto"],
    )
    mode: str = Field(
        default="custom_voice",
        description=(
            "Generation mode: 'custom_voice' (preset speakers), "
            "'voice_clone' (clone from reference audio), "
            "'voice_design' (create voice from description). "
            "Note: voice_design requires quality='quality' (1.7B model)."
        ),
        examples=["custom_voice", "voice_clone", "voice_design"],
    )
    quality: str = Field(
        default="fast",
        description=(
            "Model quality: 'fast' (0.6B, ~2GB VRAM) or "
            "'quality' (1.7B, ~5GB VRAM)."
        ),
        examples=["fast", "quality"],
    )
    speaker: Optional[str] = Field(
        default="Vivian",
        description=(
            f"Speaker name for custom_voice mode. "
            f"Available: {DEFAULT_SPEAKERS}"
        ),
        examples=["Vivian", "Ryan", "Aria"],
    )
    instruct: Optional[str] = Field(
        default=None,
        max_length=2000,
        description=(
            "Optional instruction for emotion/style control. "
            "Used in custom_voice and voice_design modes."
        ),
        examples=["Speak with a warm and friendly tone.", "Very happy and excited."],
    )
    ref_audio_base64: Optional[str] = Field(
        default=None,
        description=(
            "Base64-encoded reference audio file for voice_clone mode. "
            "Supported formats: WAV, MP3, FLAC."
        ),
    )
    ref_text: Optional[str] = Field(
        default=None,
        max_length=2000,
        description=(
            "Transcript of the reference audio for voice_clone mode. "
            "Required for best cloning quality."
        ),
        examples=["This is the transcript of the reference audio clip."],
    )


# ──────────────────────────────────────────────
#  Response Schemas
# ──────────────────────────────────────────────

class GenerateAudioResponse(BaseModel):
    """Response body for the /generate_audio endpoint."""

    success: bool = Field(
        description="Whether the generation was successful."
    )
    audio_base64: Optional[str] = Field(
        default=None,
        description="Base64-encoded WAV audio data.",
    )
    sample_rate: Optional[int] = Field(
        default=None,
        description="Sample rate of the generated audio in Hz.",
    )
    duration_seconds: Optional[float] = Field(
        default=None,
        description="Duration of the generated audio in seconds.",
    )
    model_used: Optional[str] = Field(
        default=None,
        description="HuggingFace model ID that was used for generation.",
    )
    message: Optional[str] = Field(
        default=None,
        description="Additional info or error message.",
    )


class HealthResponse(BaseModel):
    """Response for the /health endpoint."""

    status: str = Field(default="ok")
    gpu_available: bool
    gpu_name: Optional[str] = None
    vram_total_gb: Optional[float] = None
    vram_free_gb: Optional[float] = None


class ModelInfo(BaseModel):
    """Information about an available model."""

    quality: str
    mode: str
    model_id: str
    param_size: str


class ModelsResponse(BaseModel):
    """Response for the /models endpoint."""

    models: List[ModelInfo]
