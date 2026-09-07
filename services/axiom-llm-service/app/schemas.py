from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

# --- Universal / General Purpose Schemas ---
class QueryRequest(BaseModel):
    query: str = Field(..., description="The user question, instruction, or prompt")
    context: Optional[str] = Field(None, description="Optional supporting context or document text")
    system_prompt: Optional[str] = Field(None, description="Custom system prompt to guide LLM behavior")
    max_tokens: Optional[int] = Field(1024, ge=1, le=4096, description="Max tokens to generate")
    temperature: Optional[float] = Field(0.2, ge=0.0, le=1.5, description="Sampling temperature")

class QueryResponse(BaseModel):
    reply: str = Field(..., description="The LLM-generated reply")
    model: str = Field(..., description="Model identifier")
    tokens_generated: int = Field(0, description="Number of tokens generated")
    duration_ms: float = Field(..., description="Inference time in milliseconds")

# --- OpenAI Compatible Schemas ---
class ChatMessage(BaseModel):
    role: str = Field(..., description="Role: system, user, or assistant")
    content: str = Field(..., description="Text content of the message")

class OpenAIChatRequest(BaseModel):
    model: Optional[str] = Field("llama-3.2-1b", description="Model name")
    messages: List[ChatMessage] = Field(..., description="Array of chat turns")
    max_tokens: Optional[int] = Field(1024, description="Max tokens to generate")
    temperature: Optional[float] = Field(0.2, description="Sampling temperature")
    stream: Optional[bool] = Field(False, description="Streaming flag")

class OpenAIChoice(BaseModel):
    index: int = 0
    message: ChatMessage
    finish_reason: str = "stop"

class OpenAIUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

class OpenAIChatResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: List[OpenAIChoice]
    usage: OpenAIUsage

# --- Security / Codefy Specific Schemas ---
class FindingTraceStep(BaseModel):
    role: Optional[str] = None
    label: Optional[str] = None
    filePath: Optional[str] = None
    line: Optional[int] = None

class FindingTrace(BaseModel):
    sinkClass: Optional[str] = None
    steps: Optional[List[FindingTraceStep]] = None

class FindingInput(BaseModel):
    id: str
    title: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    ruleId: Optional[str] = None
    cwe: Optional[str] = None
    filePath: Optional[str] = None
    line: Optional[int] = None
    code: Optional[str] = None
    reason: Optional[str] = None
    hint: Optional[str] = None
    fix: Optional[str] = None
    trace: Optional[FindingTrace] = None

class SecurityAnalyzeRequest(BaseModel):
    query: str = Field(..., description="The user's security question or command")
    findings: Optional[List[FindingInput]] = Field(default_factory=list, description="Active scan findings")
    selected_finding_id: Optional[str] = Field(None, description="ID of the currently focused finding in UI")
    workspace_path: Optional[str] = Field(None, description="Local folder path of the scanned workspace")

class SecurityAnalyzeResponse(BaseModel):
    reply: str = Field(..., description="Detailed markdown security analysis with formatted code blocks")
    referenced_finding_ids: List[str] = Field(default_factory=list, description="Findings referenced in answer")
    suggested_actions: List[str] = Field(default_factory=list, description="Interactive quick action prompts")
    remediation_diff: Optional[str] = Field(None, description="Unified diff string if a code fix was generated")

class HealthResponse(BaseModel):
    status: str
    model: str
    context_window: int
    ram_usage_mb: float
    device: str
    uptime_seconds: float
