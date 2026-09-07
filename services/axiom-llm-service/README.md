# Axiom LLM Service (Meta Llama-3.2-1B-Instruct)

A self-hosted, lightweight, high-performance LLM microservice designed for **Codefy Security Analysis** and **Universal General-Purpose Querying** from any application.

Runs quantized **Meta Llama-3.2-1B-Instruct** (4-bit GGUF, ~750 MB RAM, ~1.1 GB RAM total). Runs on standard cloud CPU instances (Render $7/mo Starter tier) with zero GPU requirement and zero third-party per-token fees.

---

## Features

- ⚡ **Universal Query (`POST /api/query`)**: Run any prompt from any language or framework.
- 🛡️ **Security Triage (`POST /api/security/analyze`)**: Ingests Codefy AST/CPG findings and returns accurate, non-hallucinated security fixes with before/after diffs.
- 🔄 **OpenAI Compatible (`POST /v1/chat/completions`)**: Drop-in compatible with standard OpenAI SDKs, LangChain, Cursor, or AI agents.
- 📖 **Interactive Swagger Docs (`/docs`)**: Test all endpoints directly in your browser.
- 🚀 **1-Click Render Deployment**: Includes `Dockerfile` and `render.yaml`.

---

## Quickstart (Local Development)

### 1. Install Dependencies
```bash
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
```

### 2. Run the Service
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
Open **http://localhost:8000/docs** in your browser to view the interactive OpenAPI UI.

### 3. Run the Test Client
```bash
python test_client.py
```

---

## Deploy to Render (1-Click)

1. Push this folder to a GitHub repository.
2. In the [Render Dashboard](https://dashboard.render.com):
   - Click **New +** → **Blueprint**.
   - Connect your repository (it will automatically detect `render.yaml`).
   - Select the **Starter** plan (2 GB RAM).
3. Once deployed, your service will be live at:
   `https://<your-service-name>.onrender.com`

---

## Usage from Other Perspectives (Code Examples)

### 1. cURL (Command Line / Terminal)
```bash
curl -X POST https://your-service.onrender.com/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "How do I secure an Express.js API against CSRF?"}'
```

### 2. TypeScript / JavaScript (React, Next.js, Node.js)
```typescript
async function askLLM(prompt: string): Promise<string> {
  const response = await fetch("https://your-service.onrender.com/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: prompt,
      temperature: 0.2,
      max_tokens: 1024,
    }),
  });
  const data = await response.json();
  return data.reply;
}

const reply = await askLLM("Write a safe SQL query using Knex.js");
console.log(reply);
```

### 3. Python (Any Backend Service)
```python
import requests

response = requests.post(
    "https://your-service.onrender.com/api/query",
    json={"query": "Explain how cross-site scripting (XSS) works."}
)
print(response.json()["reply"])
```

### 4. Using the Official OpenAI SDK
Because `/v1/chat/completions` is standard:
```python
from openai import OpenAI

client = OpenAI(
    base_url="https://your-service.onrender.com/v1",
    api_key="axiom-custom-key"
)

completion = client.chat.completions.create(
    model="llama-3.2-1b",
    messages=[{"role": "user", "content": "How do I validate URLs in Python?"}]
)
print(completion.choices[0].message.content)
```

---

## Codefy Integration

In Codefy, configure your Chat provider to point to your deployed URL:
```typescript
const client = new HostedLlmClient({
  baseUrl: "https://your-service.onrender.com",
});

const result = await client.analyzeSecurity({
  query: "How to fix this vulnerability?",
  findings: scanFindings,
});
```
