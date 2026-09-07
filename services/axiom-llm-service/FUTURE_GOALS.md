# Axiom LLM Service: Future Goals & Roadmap

This document outlines the strategic roadmap for evolving **Axiom LLM Service** into a complete multi-tenant, enterprise-grade AI provider platform (similar to Google Gemini / OpenAI Platform), with API key governance, analytics, streaming, and multi-model routing.

---

## 🎯 Phase 1: Deployment & Initial Verification (Current Milestone)

- [x] Lightweight microservice architecture with **FastAPI** & **llama-cpp-python**.
- [x] Bundled **Meta Llama-3.2-1B-Instruct** (4-bit GGUF, ~750 MB RAM, ~1.1 GB total footprint).
- [x] Universal `/api/query` endpoint for any application, CLI, or script.
- [x] Standard OpenAI-compatible `/v1/chat/completions` endpoint.
- [x] Specialized `/api/security/analyze` endpoint for Codefy AST/CPG vulnerability triage.
- [x] Containerized deployment configuration with `Dockerfile` and `render.yaml`.
- [x] Interactive OpenAPI / Swagger documentation at `/docs`.
- [x] Comprehensive deployment readiness verification test suite (`test_deploy_readiness.py`).

---

## 🚀 Phase 2: Multi-Tenant API Key Management Platform (Gemini-Style)

Transform the service into a full API provider where users/teams can generate, manage, and authenticate using API keys.

### 1. Key Generation & Lifecycle (`/api/keys`)
- **Key Generation**: `POST /api/keys/create` generates cryptographically secure keys (e.g. `axm_live_a8f93bc21...`).
- **Metadata**: Attach name, description, owner email/ID, and creation timestamp.
- **Key Revocation & Deletion**: `DELETE /api/keys/{key_id}` instantly invalidates compromised or retired keys.
- **Storage**: Persistent SQLite / PostgreSQL database tracking active keys and status.

### 2. Dual-Header Authentication Middleware
- Seamlessly validates requests via either:
  - `Authorization: Bearer axm_live_...`
  - `X-API-Key: axm_live_...`
- Swagger UI (`/docs`) integration with interactive **[Authorize 🔒]** button for instant in-browser testing.

---

## 📊 Phase 3: Usage Tracking, Analytics & Rate Limiting

Provide visibility into who is using the model and prevent abuse or resource exhaustion.

### 1. Per-Key Telemetry & Analytics
- Track:
  - Total requests processed per key.
  - Cumulative tokens generated (input tokens + completion tokens).
  - Average latency / response duration (ms).
  - Last used timestamp and client IP / User-Agent.
- Analytics endpoint: `GET /api/analytics/usage` returning daily/weekly breakdowns.

### 2. Rate Limiting & Tiered Quotas
- Token bucket / sliding window rate limiting (e.g. 60 requests/minute per key).
- Monthly token quotas per project/user tier (e.g. Starter: 100k tokens, Pro: 2M tokens, Unlimited: internal).
- Automated HTTP 429 Too Many Requests response with standard `Retry-After` headers.

---

## ⚡ Phase 4: Streaming Responses (Server-Sent Events / SSE)

Enable real-time token streaming for smooth "typewriter" rendering in web apps and IDE extensions:

- Support `stream: true` in `/api/query` and `/v1/chat/completions`.
- Return `text/event-stream` chunks conforming to standard OpenAI streaming protocol:
  ```text
  data: {"choices": [{"delta": {"content": "Use"}}]}
  data: {"choices": [{"delta": {"content": " parameterized"}}]}
  data: {"choices": [{"delta": {"content": " queries."}}]}
  data: [DONE]
  ```
- Instant perception of speed: First token delivered in under 200ms!

---

## 🧠 Phase 5: Multi-Model Routing & Hot-Swapping

Allow clients to choose their desired model via the `model` request field:

| Model ID | Best For | Size / Memory |
| :--- | :--- | :---: |
| `llama-3.2-1b` (Default) | General Q&A, low-latency chats | ~750 MB (2GB RAM tier) |
| `qwen2.5-coder:1.5b` | Specialized coding, syntax checks, refactors | ~900 MB (2GB RAM tier) |
| `deepseek-r1:1.5b` | Step-by-step reasoning, security audit | ~1.1 GB (2GB RAM tier) |
| `llama-3.1-8b` (GPU tier) | Complex architectural & deep security reviews | ~4.5 GB (Render GPU / 8GB RAM) |

The service will dynamically route queries to the requested model without server restarts.

---

## 🔗 Phase 6: Direct GitHub Webhook Integration

Turn Axiom LLM into an autonomous GitHub App:
- Webhook listener: `POST /api/github/webhook`.
- Listens for `pull_request.opened` or `push` events.
- Clones / inspects the PR diff, executes static AST analysis via Axiom SAST, and generates automated AI pull-request review comments with concrete code fixes.

---

## 🖥️ Phase 7: Web Dashboard UI (Google AI Studio Experience)

A lightweight web frontend (accessible at `/dashboard` or deployed via Next.js/Vite):
- **API Key Manager**: Generate, view, and revoke keys with 1 click.
- **Interactive Playground**: Test prompts, adjust system instructions, temperature, and tokens in a clean chat interface.
- **Live Metrics Dashboard**: Visual graphs of requests per minute, token consumption, and response times.
