"""
@author: generated
@date: 30-May-2026

@description: REST and WebSocket endpoints for streaming analytics.
"""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.analytics_engine import get_current, get_history, update as update_analytics
from app.auth import decode_access_token
from app.deps import get_current_user
from app.db import User
from app.store import store

router: APIRouter = APIRouter(prefix='/api/v1/analytics')
logger: logging.Logger = logging.getLogger(__name__)


@router.get('/current')
async def current_analytics(user: User = Depends(get_current_user)):
    """
    Returns current analytics computed from the latest telemetry.

    @return analytics: Dict with avg_uptime, alert_rate, robot counts, etc.
    """
    return get_current()


@router.get('/history')
async def history_analytics(user: User = Depends(get_current_user)):
    """
    Returns time-series analytics data for the last hour at 5-minute intervals.

    @return response: Dict with history list.
    """
    return {'history': get_history()}


@router.websocket('/ws')
async def analytics_websocket(websocket: WebSocket, token: str = ''):
    """
    WebSocket endpoint that sends analytics updates every 5 seconds.

    Each message is a JSON object with current analytics data.
    Expects a `token` query parameter for authentication.
    """

    # Validate token from query parameter
    payload = decode_access_token(token)
    if payload is None:
        await websocket.close(code=4001)
        return

    await websocket.accept()
    logger.info('Analytics WebSocket client connected')

    try:
        while True:
            snapshot = store.get_snapshot()
            update_analytics(snapshot)

            payload = json.dumps({
                'type': 'analytics_update',
                'data': get_current(),
            })
            await websocket.send_text(payload)
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        logger.info('Analytics WebSocket client disconnected')
    except Exception as exc:
        logger.warning('Analytics WebSocket error: %s', exc)
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
