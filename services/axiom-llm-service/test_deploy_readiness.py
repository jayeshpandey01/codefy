#!/usr/bin/env python3
"""
Deployment Readiness Test Suite for Axiom LLM Service.
Validates file structure, configuration schemas, Dockerfile integrity,
Python module imports, and API route contract execution.
"""

import os
import sys
import json
import importlib.util
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

def log_pass(msg: str):
    print(f"  [PASS] {msg}")

def log_fail(msg: str):
    print(f"  [FAIL] {msg}")
    sys.exit(1)

def test_file_structure():
    print("\n--- 1. Validating Repository File Structure ---")
    required_files = [
        "Dockerfile",
        "render.yaml",
        "requirements.txt",
        "README.md",
        "FUTURE_GOALS.md",
        "test_client.py",
        "app/__init__.py",
        "app/main.py",
        "app/model.py",
        "app/schemas.py",
        "app/routers/__init__.py",
        "app/routers/query.py",
        "app/routers/openai_compat.py",
        "app/routers/security.py",
    ]

    for rel_path in required_files:
        full_path = BASE_DIR / rel_path
        if full_path.is_file():
            log_pass(f"Found required file: {rel_path} ({full_path.stat().st_size} bytes)")
        else:
            log_fail(f"Missing required file: {rel_path}")

def test_dockerfile():
    print("\n--- 2. Validating Dockerfile Configuration ---")
    dockerfile_path = BASE_DIR / "Dockerfile"
    content = dockerfile_path.read_text(encoding="utf-8")

    checks = [
        ("FROM python:3.11", "Base image is Python 3.11-slim"),
        ("requirements.txt", "Copies and installs requirements.txt"),
        ("EXPOSE 8000", "Exposes default port 8000"),
        ("uvicorn app.main:app", "CMD starts uvicorn with app.main:app"),
    ]

    for search_str, desc in checks:
        if search_str in content:
            log_pass(desc)
        else:
            log_fail(f"Dockerfile check failed: {desc}")

def test_render_yaml():
    print("\n--- 3. Validating Render Blueprint (render.yaml) ---")
    render_yaml = BASE_DIR / "render.yaml"
    content = render_yaml.read_text(encoding="utf-8")

    checks = [
        ("name: axiom-llm-service", "Defines service name: axiom-llm-service"),
        ("runtime: docker", "Configured for Docker runtime"),
        ("plan: starter", "Configured for starter plan (2GB RAM)"),
        ("healthCheckPath: /health", "Health check route configured: /health"),
    ]

    for search_str, desc in checks:
        if search_str in content:
            log_pass(desc)
        else:
            log_fail(f"render.yaml check failed: {desc}")

def test_python_modules_and_routes():
    print("\n--- 4. Validating Python Modules & FastAPI Endpoints ---")
    # Add BASE_DIR to sys.path
    sys.path.insert(0, str(BASE_DIR))

    try:
        from app.schemas import (
            QueryRequest,
            QueryResponse,
            OpenAIChatRequest,
            OpenAIChatResponse,
            SecurityAnalyzeRequest,
            SecurityAnalyzeResponse,
            HealthResponse,
        )
        log_pass("Successfully imported all Pydantic request/response schemas")
    except Exception as e:
        log_fail(f"Failed to import schemas: {e}")

    try:
        from app.model import ModelManager
        manager = ModelManager.get_instance()
        manager.initialize()
        log_pass(f"ModelManager initialized successfully (ready={manager.is_ready}, model={manager.model_name})")
    except Exception as e:
        log_fail(f"Failed to initialize ModelManager: {e}")

    # Test mock generation
    try:
        test_messages = [
            {"role": "system", "content": "You are a test assistant."},
            {"role": "user", "content": "How do I fix SQL injection?"}
        ]
        res = manager.generate(messages=test_messages, max_tokens=100)
        assert len(res["text"]) > 0, "Response text is empty"
        assert res["tokens"] > 0, "Tokens count must be positive"
        log_pass(f"Inference pipeline validated: generated {res['tokens']} tokens in {res['duration_ms']:.1f}ms")
    except Exception as e:
        log_fail(f"Inference generation failed: {e}")

    # Test FastAPI App instance and route registration
    try:
        from app.main import app
        registered_routes = [route.path for route in app.routes]
        
        expected_routes = [
            "/",
            "/health",
            "/api/query",
            "/v1/chat/completions",
            "/api/security/analyze",
            "/docs",
            "/openapi.json",
        ]

        for route in expected_routes:
            if route in registered_routes:
                log_pass(f"FastAPI route registered: {route}")
            else:
                log_fail(f"Missing expected route in app: {route}")
    except Exception as e:
        log_fail(f"Failed to load FastAPI app: {e}")

def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print("================================================================")
    print("[*] AXIOM LLM SERVICE - DEPLOYMENT READINESS VERIFICATION")
    print(f"Target Directory: {BASE_DIR}")
    print("================================================================")

    test_file_structure()
    test_dockerfile()
    test_render_yaml()
    test_python_modules_and_routes()

    print("\n================================================================")
    print("[OK] ALL CHECKS PASSED: REPOSITORY IS 100% READY TO DEPLOY!")
    print("================================================================")
    print("Next Steps to Deploy to Render:")
    print("  1. git init")
    print("  2. git add . && git commit -m 'Initial commit of Axiom LLM Service'")
    print("  3. git remote add origin https://github.com/<your-user>/axiom-llm.git")
    print("  4. git push -u origin main")
    print("  5. In Render Dashboard -> New + -> Blueprint -> Connect your repo!")
    print("================================================================\n")

if __name__ == "__main__":
    main()
