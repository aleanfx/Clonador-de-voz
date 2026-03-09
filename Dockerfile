# Base image with PyTorch and CUDA support
FROM pytorch/pytorch:2.1.0-cuda11.8-cudnn8-runtime

WORKDIR /app

# System dependencies for audio processing
# ENV DEBIAN_FRONTEND is required to prevent tzdata from asking for timezone input and hanging the build forever.
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the Hugging Face models directly into the Docker image to prevent the 90-second timeout on cold starts.
# This caches the heavy 7B model weights (15GB+) directly onto the container's SSD.
RUN huggingface-cli download Qwen/Qwen2-Audio-7B-Instruct --exclude "*.pt" "*.h5" "*.msgpack"

# Copy our serverless code
COPY . .

# Set placeholder for the API Key security
ENV API_AUTH_TOKEN="YOUR_SECRET_TOKEN_HERE"

# Run the RunPod serverless handler
CMD ["python", "-u", "runpod_handler.py"]
