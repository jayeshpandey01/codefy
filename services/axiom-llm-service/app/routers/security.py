import re
from typing import List
from fastapi import APIRouter, HTTPException
from ..schemas import SecurityAnalyzeRequest, SecurityAnalyzeResponse
from ..model import ModelManager

router = APIRouter(prefix="/api/security", tags=["Security Triage & Codefy"])

def build_security_system_prompt(req: SecurityAnalyzeRequest) -> str:
    prompt = (
        "You are the Codefy Application Security AI Assistant, an expert in vulnerability analysis and remediation.\n"
        "You are reviewing static application security testing (SAST) and dynamic (DAST) findings detected in a software repository.\n\n"
    )

    if req.findings:
        prompt += f"Active Scan Findings Detected in Workspace ({len(req.findings)} total):\n"
        for f in req.findings[:15]:  # Include top findings in prompt
            prompt += f"- ID: {f.id} | Severity: {f.severity or 'N/A'} | Title: {f.title or f.ruleId or 'Vulnerability'}"
            if f.cwe:
                prompt += f" ({f.cwe})"
            if f.filePath:
                prompt += f" in {f.filePath}:{f.line or 1}"
            if f.code:
                prompt += f"\n  Vulnerable code: `{f.code.strip()}`"
            if f.reason:
                prompt += f"\n  Reason: {f.reason}"
            if f.fix:
                prompt += f"\n  Safe replacement: `{f.fix.strip()}`"
            prompt += "\n"

    if req.selected_finding_id:
        selected = next((f for f in req.findings if f.id == req.selected_finding_id), None)
        if selected:
            prompt += f"\nCurrently Focused Finding in User UI:\n- {selected.id}: {selected.title} in {selected.filePath}\n"

    prompt += (
        "\nInstructions for your response:\n"
        "1. Provide precise, actionable security answers grounded in the real findings above.\n"
        "2. When explaining a fix, ALWAYS provide:\n"
        "   - The vulnerable code snippet\n"
        "   - The secure, parameterized or safe replacement snippet\n"
        "   - Explanation of WHY the fix prevents the attack\n"
        "3. Format all code blocks with language identifiers (e.g. ```typescript).\n"
        "4. Reference specific finding IDs (e.g. F-10291) when relevant.\n"
    )
    return prompt

@router.post("/analyze", response_model=SecurityAnalyzeResponse)
async def analyze_security(req: SecurityAnalyzeRequest):
    """
    Dedicated security triage endpoint for Codefy.
    Accepts user question + scan findings, performs RAG prompt synthesis,
    and returns rich markdown analysis with actionable code fixes.
    """
    manager = ModelManager.get_instance()
    if not manager.is_ready:
        raise HTTPException(status_code=503, detail="Model is still initializing.")

    system_prompt = build_security_system_prompt(req)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": req.query},
    ]

    result = manager.generate(messages=messages, max_tokens=1024, temperature=0.2)
    reply_text = result["text"]

    # Extract finding IDs mentioned in the reply
    referenced_ids: List[str] = []
    if req.findings:
        for f in req.findings:
            if f.id in reply_text:
                referenced_ids.append(f.id)

    # Contextual suggestions for next questions
    suggestions = [
        "How do I prevent this vulnerability?",
        "Show all critical findings",
        "Generate automated tests for this fix",
    ]

    return SecurityAnalyzeResponse(
        reply=reply_text,
        referenced_finding_ids=referenced_ids,
        suggested_actions=suggestions,
    )
