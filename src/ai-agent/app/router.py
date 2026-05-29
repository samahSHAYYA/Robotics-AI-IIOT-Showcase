"""
@author: Samah SHAYYA
@date: 28-May-2026

@description: Chat endpoint for AI Agent.
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel
from app.telemetry import build_context

router = APIRouter(prefix="/api/v1/agent")


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str
    chart: dict | None = None


@router.post("/chat", response_model=ChatResponse)
async def chat(req: Request, body: ChatRequest):
    ops_api_url = req.app.state.ops_api_url
    llm = req.app.state.llm

    context = build_context(ops_api_url)
    result = llm.chat(body.message, context)
    reply = result.get("reply", "No response.")
    chart = result.get("chart")

    return ChatResponse(reply=reply, chart=chart)
