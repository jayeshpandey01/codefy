import os
import sys
import time
import logging
from typing import List, Dict, Optional, Any
from dotenv import load_dotenv

# Automatically load environment variables from .env file
load_dotenv()

logger = logging.getLogger("axiom-llm")

# Model configuration defaults (Official Meta repository)
DEFAULT_REPO = os.getenv("MODEL_REPO", "meta-llama/Llama-3.2-1B")
DEFAULT_FILE = os.getenv("MODEL_FILE", "")
DEFAULT_CTX = int(os.getenv("N_CTX", "4096"))
DEFAULT_THREADS = int(os.getenv("N_THREADS", "2"))
MODELS_DIR = os.getenv("MODELS_DIR", os.path.join(os.path.dirname(__file__), "..", "models"))
HF_TOKEN = os.getenv("HF_TOKEN")

class ModelManager:
    """
    Manages in-memory LLaMA model inference.
    Supports official meta-llama Hugging Face checkpoints via transformers,
    quantized GGUF models via llama-cpp-python, or mock mode for fast local tests.
    """

    _instance: Optional["ModelManager"] = None

    def __init__(self):
        self.model: Any = None
        self.tokenizer: Any = None
        self.llm: Any = None  # for llama.cpp
        self.model_name = DEFAULT_REPO
        self.engine_type = "mock"
        self.start_time = time.time()
        self.is_ready = False
        self.use_mock = False

    @classmethod
    def get_instance(cls) -> "ModelManager":
        if cls._instance is None:
            cls._instance = ModelManager()
        return cls._instance

    def initialize(self):
        """Loads or downloads the model weights on application startup."""
        hf_token = os.getenv("HF_TOKEN")
        token_msg = "with HF_TOKEN" if hf_token else "without HF_TOKEN"

        # Check if GGUF file is specified
        if DEFAULT_FILE and DEFAULT_FILE.endswith(".gguf"):
            self._init_llama_cpp(hf_token)
            return

        # Attempt to load official meta-llama checkpoint via Transformers
        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer

            logger.info(f"[ModelManager] Loading official {DEFAULT_REPO} via Transformers ({token_msg})...")
            self.tokenizer = AutoTokenizer.from_pretrained(
                DEFAULT_REPO,
                token=hf_token,
                trust_remote_code=True,
            )
            self.model = AutoModelForCausalLM.from_pretrained(
                DEFAULT_REPO,
                token=hf_token,
                torch_dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
                device_map="auto" if torch.cuda.is_available() else "cpu",
                trust_remote_code=True,
            )
            self.engine_type = "transformers"
            self.is_ready = True
            self.use_mock = False
            logger.info(f"[ModelManager] {DEFAULT_REPO} loaded successfully via Transformers.")
            return
        except Exception as e:
            logger.warning(f"[ModelManager] Transformers loading failed: {e}. Checking GGUF alternative...")

        # Fallback to llama-cpp-python if available
        self._init_llama_cpp(hf_token)

    def _init_llama_cpp(self, hf_token: Optional[str]):
        try:
            from llama_cpp import Llama
            from huggingface_hub import hf_hub_download
        except ImportError:
            logger.warning("[ModelManager] Neither transformers nor llama-cpp-python is installed. Running in developer mock mode.")
            self.use_mock = True
            self.is_ready = True
            self.engine_type = "mock"
            return

        filename = DEFAULT_FILE or "Llama-3.2-1B-Instruct-Q4_K_M.gguf"
        repo = DEFAULT_REPO if ("GGUF" in DEFAULT_REPO or "gguf" in DEFAULT_REPO) else "bartowski/Llama-3.2-1B-Instruct-GGUF"
        model_path = os.path.join(MODELS_DIR, filename)

        if not os.path.exists(model_path):
            logger.info(f"[ModelManager] Downloading {filename} from {repo}...")
            os.makedirs(MODELS_DIR, exist_ok=True)
            try:
                model_path = hf_hub_download(
                    repo_id=repo,
                    filename=filename,
                    local_dir=MODELS_DIR,
                    token=hf_token,
                )
            except Exception as e:
                logger.error(f"[ModelManager] GGUF download failed: {e}. Using mock mode.")
                self.use_mock = True
                self.is_ready = True
                self.engine_type = "mock"
                return

        try:
            self.llm = Llama(
                model_path=model_path,
                n_ctx=DEFAULT_CTX,
                n_threads=DEFAULT_THREADS,
                verbose=False,
            )
            self.engine_type = "llama_cpp"
            self.is_ready = True
            self.use_mock = False
            logger.info(f"[ModelManager] GGUF model loaded successfully.")
        except Exception as e:
            logger.error(f"[ModelManager] Llama-cpp init failed: {e}. Falling back to mock mode.")
            self.use_mock = True
            self.is_ready = True
            self.engine_type = "mock"

    def build_llama3_prompt(self, messages: List[Dict[str, str]]) -> str:
        """Constructs LLaMA 3.1/3.2 chat template."""
        prompt = "<|begin_of_text|>"
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "").strip()
            prompt += f"<|start_header_id|>{role}<|end_header_id|>\n\n{content}<|eot_id|>"
        prompt += "<|start_header_id|>assistant<|end_header_id|>\n\n"
        return prompt

    def generate(
        self,
        messages: List[Dict[str, str]],
        max_tokens: int = 1024,
        temperature: float = 0.2,
    ) -> Dict[str, Any]:
        """Generates completion text from chat messages."""
        if not self.is_ready:
            raise RuntimeError("Model is not initialized yet.")

        # If running in mock / developer mode:
        if self.use_mock:
            user_msg = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
            return self._mock_response(user_msg, messages)

        # 1. Transformers Engine
        if self.engine_type == "transformers" and self.model and self.tokenizer:
            prompt = self.build_llama3_prompt(messages)
            start = time.time()
            inputs = self.tokenizer(prompt, return_tensors="pt")
            if hasattr(self.model, "device"):
                inputs = {k: v.to(self.model.device) for k, v in inputs.items()}

            outputs = self.model.generate(
                **inputs,
                max_new_tokens=max_tokens,
                temperature=temperature if temperature > 0 else None,
                do_sample=temperature > 0,
                pad_token_id=self.tokenizer.eos_token_id,
            )
            duration_ms = (time.time() - start) * 1000
            generated_tokens = outputs[0][inputs["input_ids"].shape[1]:]
            text = self.tokenizer.decode(generated_tokens, skip_special_tokens=True).strip()
            return {
                "text": text,
                "tokens": len(generated_tokens),
                "duration_ms": duration_ms,
            }

        # 2. Llama-cpp Engine
        if self.engine_type == "llama_cpp" and self.llm:
            prompt = self.build_llama3_prompt(messages)
            start = time.time()
            output = self.llm(
                prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                stop=["<|eot_id|>", "<|end_of_text|>"],
            )
            duration_ms = (time.time() - start) * 1000
            text = output["choices"][0]["text"].strip()
            tokens = output.get("usage", {}).get("completion_tokens", len(text.split()))
            return {
                "text": text,
                "tokens": tokens,
                "duration_ms": duration_ms,
            }

        user_msg = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        return self._mock_response(user_msg, messages)

    def _mock_response(self, user_query: str, messages: List[Dict[str, str]]) -> Dict[str, Any]:
        """High-precision fallback responses for development / testing."""
        q_lower = user_query.lower()
        time.sleep(0.1)

        if "sql" in q_lower or "cwe-89" in q_lower:
            reply = (
                "### SQL Injection (CWE-89) Remediation\n\n"
                "SQL Injection occurs when untrusted input is concatenated directly into a database query string.\n\n"
                "#### Vulnerable Pattern:\n"
                "```typescript\n"
                "const query = `SELECT * FROM users WHERE id = '${userInput}'`;\n"
                "await db.query(query);\n"
                "```\n\n"
                "#### Secure Parameterized Replacement:\n"
                "```typescript\n"
                "const query = 'SELECT * FROM users WHERE id = $1';\n"
                "await db.query(query, [userInput]);\n"
                "```\n\n"
                "**Key Recommendations:**\n"
                "- Always use parameterized placeholders (`$1`, `?`)\n"
                "- With ORMs like Prisma, use tagged templates: `prisma.$queryRaw`\n"
                "- Avoid raw string concatenation (`+` or template literals) inside queries."
            )
        elif "command" in q_lower or "cwe-78" in q_lower or "exec" in q_lower:
            reply = (
                "### Command Injection (CWE-78) Remediation\n\n"
                "Command Injection occurs when user input reaches `child_process.exec` or shell execution without sanitization.\n\n"
                "#### Secure Replacement:\n"
                "```typescript\n"
                "import { execFile } from 'node:child_process';\n"
                "execFile(binaryPath, [arg1, arg2], (err, stdout) => {\n"
                "  if (err) throw err;\n"
                "  console.log(stdout);\n"
                "});\n"
                "```"
            )
        elif "ssrf" in q_lower or "cwe-918" in q_lower:
            reply = (
                "### Server-Side Request Forgery (SSRF) Remediation (CWE-918)\n\n"
                "Validate both the URL protocol (`https:`) and ensure the hostname belongs to an allowed whitelist.\n\n"
                "```typescript\n"
                "const ALLOWED_HOSTS = new Set(['api.example.com', 'storage.example.com']);\n"
                "const parsed = new URL(targetUrl);\n"
                "if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {\n"
                "  throw new Error('Forbidden outbound request destination');\n"
                "}\n"
                "await fetch(parsed.toString());\n"
                "```"
            )
        else:
            reply = (
                f"### Analysis & Guidance\n\n"
                f"Regarding your query: *\"{user_query}\"*\n\n"
                "Based on security best practices, ensure all external inputs are strictly validated at boundaries, "
                "least privilege principles are maintained, and safe parameterized APIs are utilized.\n\n"
                "If you are reviewing scan findings, specify a finding ID (e.g. `F-10291`) or vulnerability type for an exact code patch."
            )

        return {
            "text": reply,
            "tokens": len(reply.split()),
            "duration_ms": 120.0,
        }
