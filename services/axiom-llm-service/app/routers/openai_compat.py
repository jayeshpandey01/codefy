import time
import uuid
from fastapi import APIRouter, HTTPException
from ..schemas import OpenAIChatRequest, OpenAIChatResponse, OpenAIChoice, ChatMessage, OpenAIUsage
from ..model import ModelManager

router = APIRouter(prefix="/v1", tags=["OpenAI Compatible API"])

@router.post("/chat/completions", response_model=OpenAIChatResponse)
async def chat_completions(req: OpenAIChatRequest):
    """
    Standard OpenAI-compatible Chat Completions endpoint.
    Allows drop-in compatibility with the OpenAI SDK, LangChain, Cursor, or any existing tooling:
    
    client = OpenAI(base_url="https://your-service.onrender.com/v1", api_key="axiom")
    response = client.chat.completions.create(model="llama-3.2-1b", messages=[...])
    """
    manager = ModelManager.get_instance()
    if not manager.is_ready:
        raise HTTPException(status_code=503, detail="Model is still initializing.")

    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    result = manager.generate(
        messages=messages,
        max_tokens=req.max_tokens or 1024,
        temperature=req.temperature or 0.2,
    )

    return OpenAIChatResponse(
        id=f"chatcmpl-{uuid.uuid4().hex[:12]}",
        created=int(time.time()),
        model=manager.model_name,
        choices=[
            OpenAIChoice(
                index=0,
                message=ChatMessage(role="assistant", content=result["text"]),
                finish_reason="stop",
            )
        ],
        usage=OpenAIUsage(
            prompt_tokens=len(" ".join([m["content"] for m in messages]).split()),
            completion_tokens=result["tokens"],
            total_tokens=result["tokens"] + 10,
        ),
    )
