"""
@author: Samah SHAYYA
@date: 29-May-2026

@description: Chat endpoint for AI Agent using PydanticAI.
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter(prefix = '/api/v1/agent')


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str
    chart: dict | None = None


@router.post('/chat', response_model = ChatResponse)
async def chat(req: Request, body: ChatRequest):
    """
    Processes a chat message through the factory agent.
    """

    agent = req.app.state.agent
    result = await agent.chat(body.message)
    return ChatResponse(
        reply = result.get('reply', 'No response.'),
        chart = result.get('chart'),
    )
