"""
Qwen3-TTS Backend — FastAPI Application
Main server entry point with REST API endpoints.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import (
    MODEL_REGISTRY,
    ServerConfig,
    get_model_id,
    SUPPORTED_LANGUAGES,
    DEFAULT_SPEAKERS,
)
from .models import (
    GenerateAudioRequest,
    GenerateAudioResponse,
    HealthResponse,
    ModelsResponse,
    ModelInfo,
)
from .tts_engine import engine

# ──────────────────────────────────────────────
#  Logging
# ──────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(levelname)-8s │ %(name)s │ %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("qwen-tts-server")

# ──────────────────────────────────────────────
#  Configuration
# ──────────────────────────────────────────────

config = ServerConfig()


# ──────────────────────────────────────────────
#  Lifespan (startup/shutdown)
# ──────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    logger.info("=" * 60)
    logger.info("  🎙️  Qwen3-TTS Voice Cloning Server")
    logger.info("=" * 60)

    gpu_info = engine.get_gpu_info()
    if gpu_info["available"]:
        logger.info(f"  GPU: {gpu_info.get('name', 'Unknown')}")
        logger.info(f"  VRAM: {gpu_info.get('vram_total_gb', '?')} GB total")
    else:
        logger.warning("  ⚠️ No GPU detected — running on CPU (slow)")

    logger.info(f"  Default quality: {config.default_quality}")
    logger.info(f"  API docs: http://{config.host}:{config.port}/docs")
    logger.info("=" * 60)
    logger.info("  Models are loaded ON DEMAND (lazy loading)")
    logger.info("  VRAM is purged after each generation")
    logger.info("=" * 60)

    yield  # Server is running

    logger.info("🛑 Server shutting down...")


# ──────────────────────────────────────────────
#  FastAPI App
# ──────────────────────────────────────────────

app = FastAPI(
    title="Qwen3-TTS Voice Cloning API",
    description=(
        "API local de Clonación de Voz y TTS usando modelos Qwen3-TTS. "
        "Soporta voz personalizada, clonación de voz y diseño de voz. "
        "Arquitectura optimizada para migración serverless (lazy loading + VRAM purge)."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — Allow frontend to connect
# CORS — allow_credentials MUST be False when using wildcard origins ["*"]
# Otherwise Starlette silently drops Access-Control-Allow-Origin from preflight responses
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────
#  Endpoints
# ──────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """Check server health and GPU status."""
    gpu_info = engine.get_gpu_info()
    return HealthResponse(
        status="ok",
        gpu_available=gpu_info["available"],
        gpu_name=gpu_info.get("name"),
        vram_total_gb=gpu_info.get("vram_total_gb"),
        vram_free_gb=gpu_info.get("vram_free_gb"),
    )


@app.get("/models", response_model=ModelsResponse, tags=["System"])
async def list_models():
    """List all available model configurations."""
    models = []
    for quality, modes in MODEL_REGISTRY.items():
        for mode, model_id in modes.items():
            param_size = "0.6B" if "0.6B" in model_id else "1.7B"
            models.append(
                ModelInfo(
                    quality=quality,
                    mode=mode,
                    model_id=model_id,
                    param_size=param_size,
                )
            )
    return ModelsResponse(models=models)


@app.get("/speakers", tags=["System"])
async def list_speakers():
    """List available preset speakers for custom_voice mode."""
    return {"speakers": DEFAULT_SPEAKERS}


@app.get("/languages", tags=["System"])
async def list_languages():
    """List supported languages."""
    return {"languages": SUPPORTED_LANGUAGES}


@app.post(
    "/generate_audio",
    response_model=GenerateAudioResponse,
    tags=["Generation"],
    summary="Generate speech audio",
    description=(
        "Generate speech from text using Qwen3-TTS models. "
        "Supports three modes: custom_voice (preset speakers), "
        "voice_clone (clone from reference audio), and "
        "voice_design (design voice from description). "
        "The model is loaded on demand and VRAM is purged after generation."
    ),
)
async def generate_audio(request: GenerateAudioRequest):
    """
    Main audio generation endpoint.
    
    Flow: Validate → Resolve Model → Load → Generate → Purge VRAM → Return
    """
    # ── Validate request ──
    try:
        model_id = get_model_id(request.quality, request.mode)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Validate mode-specific requirements
    if request.mode == "voice_clone" and not request.ref_audio_base64:
        raise HTTPException(
            status_code=400,
            detail=(
                "ref_audio_base64 is required for voice_clone mode. "
                "Upload a base64-encoded audio file as reference."
            ),
        )

    if request.mode == "voice_design" and not request.instruct:
        raise HTTPException(
            status_code=400,
            detail=(
                "instruct is required for voice_design mode. "
                "Provide a description of the desired voice."
            ),
        )

    # ── Generate audio ──
    logger.info(
        f"📢 Request: mode={request.mode}, quality={request.quality}, "
        f"lang={request.language}, text_len={len(request.text)}"
    )

    try:
        audio_b64, sample_rate, duration = engine.generate(
            model_id=model_id,
            mode=request.mode,
            text=request.text,
            language=request.language,
            speaker=request.speaker,
            instruct=request.instruct,
            ref_audio_base64=request.ref_audio_base64,
            ref_text=request.ref_text,
        )

        return GenerateAudioResponse(
            success=True,
            audio_base64=audio_b64,
            sample_rate=sample_rate,
            duration_seconds=round(duration, 2),
            model_used=model_id,
            message=f"Audio generated successfully ({duration:.1f}s)",
        )

    except RuntimeError as e:
        # OOM or other runtime errors
        logger.error(f"💥 Runtime error: {e}")
        raise HTTPException(
            status_code=503,
            detail=str(e),
        )
    except ValueError as e:
        # Invalid parameters
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Unexpected errors
        logger.exception(f"💥 Unexpected error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {type(e).__name__}: {str(e)}",
        )


# ──────────────────────────────────────────────
#  Run with Uvicorn (for direct execution)
# ──────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.app.main:app",
        host=config.host,
        port=config.port,
        reload=True,
        log_level="info",
    )
