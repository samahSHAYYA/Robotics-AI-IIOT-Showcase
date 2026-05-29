"""
@author: Samah SHAYYA
@date: 28-May-2026

@description: REST endpoints for robot commands and inspection triggers.
"""

import logging
import os
import uuid

from datetime import datetime, timezone
from typing import Any

import redis.asyncio as aioredis
from fastapi import APIRouter, HTTPException

from app.store import store

router: APIRouter = APIRouter(prefix = '/api/v1')

REDIS_URL: str = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
COMMAND_STREAM: str = 'events:commands'

logger: logging.Logger = logging.getLogger(__name__)


@router.post('/robot/{robot_id}/start')
async def start_robot(robot_id: str):
    """Starts robot movement."""
    ok = store.start_robot(robot_id)
    if not ok:
        raise HTTPException(status_code=404, detail='Robot not found')
    return {'status': 'started', 'robot_id': robot_id}


@router.post('/robot/{robot_id}/stop')
async def stop_robot(robot_id: str):
    """Stops robot movement."""
    ok = store.stop_robot(robot_id)
    if not ok:
        raise HTTPException(status_code=404, detail='Robot not found')
    return {'status': 'stopped', 'robot_id': robot_id}


@router.post('/robot/{robot_id}/emergency-stop')
async def emergency_stop_robot(robot_id: str):
    """Emergency stops a robot with critical alert."""
    ok = store.emergency_stop_robot(robot_id)
    if not ok:
        raise HTTPException(status_code=404, detail='Robot not found')
    return {'status': 'emergency_stopped', 'robot_id': robot_id}


@router.post('/robot/{robot_id}/task')
async def assign_task(robot_id: str, body: dict[str, Any]):
    """Assigns a task to a robot."""
    task = body.get('task', '')
    ok = store.assign_task(robot_id, task)
    if not ok:
        raise HTTPException(status_code=404, detail='Robot not found')
    return {'status': 'task_assigned', 'robot_id': robot_id, 'task': task}


@router.get('/robot/{robot_id}')
async def get_robot(robot_id: str):
    """Returns detailed info for a single robot."""
    info = store.get_robot_info(robot_id)
    if not info:
        raise HTTPException(status_code=404, detail='Robot not found')
    return info


@router.post('/inspect')
async def trigger_inspect(payload: dict[str, Any]):
    """
    Triggers a mock visual inspection.

    Writes a camera.frame event to the core-platform stream, which the
    ai-service will pick up and process.

    @param payload: Inspection request body.

    @return result: Dict with status and trace_id.
    """

    trace_id: str = str(uuid.uuid4())

    event: dict[str, Any] = {
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
