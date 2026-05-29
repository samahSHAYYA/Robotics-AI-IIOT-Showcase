"""
@author: Samah SHAYYA
@date: 28-May-2026

@description: REST endpoints for robot commands and inspection triggers.
"""

import logging
import os
import uuid

from datetime import datetime, timezone
from typing import Any, Dict

import redis.asyncio as aioredis
from fastapi import APIRouter

router: APIRouter = APIRouter(prefix = '/api/v1')

REDIS_URL: str = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
COMMAND_STREAM: str = 'events:commands'

logger: logging.Logger = logging.getLogger(__name__)


@router.post('/robot/command')
async def post_command(payload: Dict[str, Any]):
    """
    Issues a command to a robot.

    Writes a CommandEvent to the Redis commands stream. Expected payload:
    {
        "command": "safe-stop | resume | move | grip",
        "target": "C3 | W2 | Q1",
        "params": { ... }
    }

    @param payload: Command payload from the request body.

    @return result: Dict with status and trace_id.
    """

    trace_id: str = str(uuid.uuid4())

    event: Dict[str, Any] = {
        'event_type': 'command.issue',
        'trace_id': trace_id,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'source': 'ops-api',
        'command': payload.get('command', 'unknown'),
        'target': payload.get('target', 'unknown'),
        'params': payload.get('params', {}),
    }

    r: aioredis.Redis = aioredis.from_url(REDIS_URL, decode_responses = True)

    try:
        await r.xadd(COMMAND_STREAM, event, maxlen = 100)
    except Exception:
        logger.exception('Failed to publish command to Redis')

    return {'status': 'acknowledged', 'trace_id': trace_id}


@router.post('/inspect')
async def trigger_inspect(payload: Dict[str, Any]):
    """
    Triggers a mock visual inspection.

    Writes a camera.frame event to the core-platform stream, which the
    ai-service will pick up and process.

    @param payload: Inspection request body.

    @return result: Dict with status and trace_id.
    """

    trace_id: str = str(uuid.uuid4())

    event: Dict[str, Any] = {
        'event_type': 'camera.frame',
        'trace_id': trace_id,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'source': 'ops-api',
        'camera_id': payload.get('camera_id', 'cam_main'),
        'frame_id': f"manual_{uuid.uuid4().hex[:8]}",
        'width': 640,
        'height': 480,
    }

    r: aioredis.Redis = aioredis.from_url(REDIS_URL, decode_responses = True)

    try:
        await r.xadd('events:core-platform', event, maxlen = 1000)
    except Exception:
        logger.exception('Failed to publish inspection event')

    return {'status': 'inspection triggered', 'trace_id': trace_id}
