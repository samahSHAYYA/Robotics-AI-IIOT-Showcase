"""
@author: Samah SHAYYA
@date: 29-May-2026

@description: Chat endpoints for AI Agent using PydanticAI.
              Includes standard chat, streaming SSE chat, and history support.
"""

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter(prefix='/api/v1/agent')


class ChatRequest(BaseModel):
    message: str


class ChatRequestWithHistory(BaseModel):
    message: str
    history: list[dict] = []


class ChatRequestStream(BaseModel):
    message: str
    history: list[dict] = []


class ChatResponse(BaseModel):
    reply: str
    chart: dict | None = None


@router.post('/chat', response_model=ChatResponse)
async def chat(req: Request, body: ChatRequestWithHistory):
    """
    Processes a chat message through the factory agent.
    Accepts optional conversation history for context.
    """

    agent = req.app.state.agent
    result = await agent.chat(body.message, history=body.history)
    return ChatResponse(
        reply=result.get('reply', 'No response.'),
        chart=result.get('chart'),
    )


@router.post('/chat/stream')
async def chat_stream(req: Request, body: ChatRequestStream):
    """
    SSE streaming chat endpoint. Accepts a message + optional history.
    Yields token-by-token events and finishes with a done event.
    """

    agent = req.app.state.agent

    async def event_stream():
        async for token in agent.chat_stream(body.message, history=body.history):
            yield f'data: {token}\n\n'

    return StreamingResponse(
        event_stream(),
        media_type='text/event-stream',
    )
