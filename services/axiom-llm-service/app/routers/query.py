from fastapi import APIRouter, HTTPException, Depends
from ..schemas import QueryRequest, QueryResponse
from ..model import ModelManager

router = APIRouter(prefix="/api", tags=["General LLM Query"])

@router.post("/query", response_model=QueryResponse)
async def handle_query(req: QueryRequest):
    """
    Universal LLM query endpoint.
    Accepts any prompt/query and returns an LLM-generated response.
    Can be used by ANY website, CLI, Python script, or microservice.
    """
    manager = ModelManager.get_instance()
    if not manager.is_ready:
        raise HTTPException(status_code=503, detail="Model is still initializing. Please retry in a few moments.")

    messages = []
    system_text = req.system_prompt or "You are an intelligent, precise AI coding and security assistant. Answer clearly and concisely."
    if req.context:
        system_text += f"\n\nContext:\n{req.context}"
    
    messages.append({"role": "system", "content": system_text})
    messages.append({"role": "user", "content": req.query})

    result = manager.generate(
        messages=messages,
        max_tokens=req.max_tokens or 1024,
        temperature=req.temperature or 0.2,
    )

    return QueryResponse(
        reply=result["text"],
        model=manager.model_name,
        tokens_generated=result["tokens"],
        duration_ms=round(result["duration_ms"], 2),
    )
