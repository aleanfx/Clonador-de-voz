"""
Qwen3-TTS Backend — Configuration
Centralized settings and model registry.
"""

from dataclasses import dataclass, field
from typing import Dict, List


# ──────────────────────────────────────────────
#  Model Registry
# ──────────────────────────────────────────────

MODEL_REGISTRY: Dict[str, Dict[str, str]] = {
    # quality → mode → HuggingFace model ID
    "fast": {
        "custom_voice": "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
        "voice_clone":  "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
        # voice_design is NOT available for 0.6B
    },
    "quality": {
        "custom_voice":  "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
        "voice_clone":   "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
        "voice_design":  "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
    },
}


# ──────────────────────────────────────────────
#  Supported Values
# ──────────────────────────────────────────────

SUPPORTED_QUALITIES: List[str] = ["fast", "quality"]
SUPPORTED_MODES: List[str] = ["custom_voice", "voice_clone", "voice_design"]
SUPPORTED_LANGUAGES: List[str] = [
    "Auto", "Chinese", "English", "Japanese", "Korean",
    "German", "French", "Russian", "Portuguese", "Spanish", "Italian",
]

DEFAULT_SPEAKERS: List[str] = [
    "Vivian", "Ryan", "Aria", "Emily", "Owen",
    "Rina", "Hudson", "Claire", "Haruto", "Stella",
]


@dataclass
class ServerConfig:
    """Server-wide configuration."""
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: List[str] = field(default_factory=lambda: ["*"])
    default_quality: str = "fast"
    default_mode: str = "custom_voice"
    default_language: str = "Auto"
    default_speaker: str = "Vivian"
    max_text_length: int = 5000  # characters
    output_dir: str = "generated_audio"


def get_model_id(quality: str, mode: str) -> str:
    """
    Resolve a HuggingFace model ID from quality + mode parameters.
    
    Raises ValueError if the combination is not supported.
    """
    quality = quality.lower().strip()
    mode = mode.lower().strip()

    if quality not in MODEL_REGISTRY:
        raise ValueError(
            f"Unsupported quality '{quality}'. Choose from: {SUPPORTED_QUALITIES}"
        )
    
    quality_models = MODEL_REGISTRY[quality]
    
    if mode not in quality_models:
        available = list(quality_models.keys())
        raise ValueError(
            f"Mode '{mode}' is not available for quality '{quality}'. "
            f"Available modes: {available}"
        )
    
    return quality_models[mode]
