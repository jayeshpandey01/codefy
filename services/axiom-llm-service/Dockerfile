FROM python:3.11-slim

WORKDIR /app

# Install system dependencies needed for compiling/running llama-cpp-python
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .

# Install llama-cpp-python using prebuilt CPU wheels to avoid slow compilation
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu || \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Environment variables
ENV PORT=8000
ENV HOST=0.0.0.0
ENV MODEL_REPO="meta-llama/Llama-3.2-1B"
ENV MODEL_FILE=""
ENV N_THREADS=2
ENV N_CTX=4096

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
