import os
import time
import psutil
from contextlib import asynccontextmanager
from dotenv import load_dotenv

# Automatically load environment variables from .env file
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .model import ModelManager
from .schemas import HealthResponse
from .routers import query, openai_compat, security

start_time = time.time()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: load model weights in background/lifespan
    manager = ModelManager.get_instance()
    manager.initialize()
    yield
    # Shutdown: clean up if needed

app = FastAPI(
    title="Axiom LLM Service",
    description="High-performance hosted LLaMA-3.2-1B inference microservice for Codefy and universal applications.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Enable CORS for all origins so Webviews, Tauri, Next.js, and browser extensions can call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers
app.include_router(query.router)
app.include_router(openai_compat.router)
app.include_router(security.router)

@app.get("/health", response_model=HealthResponse, tags=["Monitoring"])
async def health_check():
    """Returns service health, model information, and memory usage."""
    manager = ModelManager.get_instance()
    process = psutil.Process(os.getpid())
    ram_mb = process.memory_info().rss / (1024 * 1024)

    return HealthResponse(
        status="healthy" if manager.is_ready else "initializing",
        model=manager.model_name,
        context_window=4096,
        ram_usage_mb=round(ram_mb, 1),
        device="cpu",
        uptime_seconds=round(time.time() - start_time, 1),
    )

@app.get("/", tags=["Root"])
async def root():
    return {
        "service": "Axiom LLM Service",
        "model": "Meta Llama-3.2-1B-Instruct (4-bit Q4_K_M)",
        "endpoints": {
            "query": "/api/query (General input prompt -> reply)",
            "openai_compat": "/v1/chat/completions (OpenAI SDK format)",
            "security": "/api/security/analyze (Codefy AST Security analysis)",
            "docs": "/docs (Interactive OpenAPI / Swagger UI)",
            "health": "/health",
        },
        "status": "online",
    }
