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
from fastapi import APIRouter, Depends, HTTPException, Request

from app.audit_logger import log_action
from app.deps import get_current_user, require_role
from app.db import User
from app.store import store
from app.webhook_engine import trigger_webhooks

router: APIRouter = APIRouter(prefix = '/api/v1')

REDIS_URL: str = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
COMMAND_STREAM: str = 'events:commands'

logger: logging.Logger = logging.getLogger(__name__)


def _client_ip(request: Request) -> str:
    """Extracts the client IP address from a request."""
    if request.client is not None:
        return request.client.host or ''
    return ''


@router.post('/robot/{robot_id}/start')
async def start_robot(robot_id: str, request: Request,
                      user: User = Depends(require_role('operator'))):
    """Starts robot movement."""
    ok = store.start_robot(robot_id)
    if not ok:
        raise HTTPException(status_code=404, detail='Robot not found')

    ip = _client_ip(request)
    await log_action(
        robot_id=robot_id,
        action='start',
        user_role='operator',
        details=f'Robot {robot_id} started',
        ip_address=ip,
    )
    await trigger_webhooks('robot.start', {
        'robot_id': robot_id,
        'status': 'started',
        'timestamp': datetime.now(timezone.utc).isoformat(),
    })

    return {'status': 'started', 'robot_id': robot_id}


@router.post('/robot/{robot_id}/stop')
async def stop_robot(robot_id: str, request: Request,
                     user: User = Depends(require_role('operator'))):
    """Stops robot movement."""
    ok = store.stop_robot(robot_id)
    if not ok:
        raise HTTPException(status_code=404, detail='Robot not found')

    ip = _client_ip(request)
    await log_action(
        robot_id=robot_id,
        action='stop',
        user_role='operator',
        details=f'Robot {robot_id} stopped',
        ip_address=ip,
    )
    await trigger_webhooks('robot.stop', {
        'robot_id': robot_id,
        'status': 'stopped',
        'timestamp': datetime.now(timezone.utc).isoformat(),
    })

    return {'status': 'stopped', 'robot_id': robot_id}


@router.post('/robot/{robot_id}/emergency-stop')
async def emergency_stop_robot(robot_id: str, request: Request,
                               user: User = Depends(require_role('operator'))):
    """Emergency stops a robot with critical alert."""
    ok = store.emergency_stop_robot(robot_id)
    if not ok:
        raise HTTPException(status_code=404, detail='Robot not found')

    ip = _client_ip(request)
    await log_action(
        robot_id=robot_id,
        action='emergency_stop',
        user_role='operator',
        details=f'Emergency stop triggered on {robot_id}',
        ip_address=ip,
    )
    await trigger_webhooks('robot.emergency_stop', {
        'robot_id': robot_id,
        'status': 'emergency_stopped',
        'timestamp': datetime.now(timezone.utc).isoformat(),
    })

    return {'status': 'emergency_stopped', 'robot_id': robot_id}


@router.post('/robot/{robot_id}/task')
async def assign_task(robot_id: str, body: dict[str, Any],
                      request: Request,
                      user: User = Depends(require_role('operator'))):
    """Assigns a task to a robot."""
    task = body.get('task', '')
    ok = store.assign_task(robot_id, task)
    if not ok:
        raise HTTPException(status_code=404, detail='Robot not found')

    ip = _client_ip(request)
    await log_action(
        robot_id=robot_id,
        action='assign_task',
        user_role='operator',
        details=f'Task "{task}" assigned to {robot_id}',
        ip_address=ip,
    )
    await trigger_webhooks('robot.task_assigned', {
        'robot_id': robot_id,
        'task': task,
        'timestamp': datetime.now(timezone.utc).isoformat(),
    })

    return {'status': 'task_assigned', 'robot_id': robot_id, 'task': task}


@router.get('/robot/{robot_id}')
async def get_robot(robot_id: str,
                    user: User = Depends(get_current_user)):
    """Returns detailed info for a single robot."""
    info = store.get_robot_info(robot_id)
    if not info:
        raise HTTPException(status_code=404, detail='Robot not found')
    return info


@router.post('/worker/{worker_id}/toggle')
async def toggle_worker(worker_id: str, request: Request,
                        user: User = Depends(require_role('operator'))):
    """Toggle a worker's active/inactive state."""
    result = store.toggle_worker(worker_id)
    if not result:
        raise HTTPException(status_code=404, detail='Worker not found')

    ip = _client_ip(request)
    await log_action(
        robot_id=worker_id,
        action='toggle_worker',
        user_role='operator',
        details=f'Worker {worker_id} toggled to {"active" if result["active"] else "inactive"}',
        ip_address=ip,
    )
    await trigger_webhooks('worker.toggle', {
        'worker_id': worker_id,
        'active': result['active'],
        'timestamp': datetime.now(timezone.utc).isoformat(),
    })

    return {'status': 'toggled', 'worker_id': worker_id, 'active': result['active']}


@router.post('/inspect')
async def trigger_inspect(payload: dict[str, Any],
                          user: User = Depends(require_role('operator'))):
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
