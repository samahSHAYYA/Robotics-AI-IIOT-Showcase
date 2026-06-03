"""
@author: generated
@date: 30-May-2026

@description: REST endpoints for Robot Fleet Auto-Discovery (Feature 42).
Provides register, list, heartbeat, and delete operations for robots.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.deps import get_current_user
from app.db import User
from app.store import store

router: APIRouter = APIRouter(prefix='/api/v1/robots')
logger: logging.Logger = logging.getLogger(__name__)


class RobotRegisterRequest(BaseModel):
    """Request body for registering a new robot."""
    name: str
    type: str  # humanoid, welder, inspector


@router.post('/register', status_code=201)
async def register_robot(body: RobotRegisterRequest,
                         user: User = Depends(get_current_user)):
    """
    Register a new robot.
    Auto-assigns robot_id with prefix based on type (H-, W-, I-) + sequence
    number.

    @param body: Robot registration details (name, type).

    @return record: The full robot record with assigned ID.

    @raises HTTPException 400: If the type is invalid.
    """

    valid_types = {'humanoid', 'welder', 'inspector'}
    if body.type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f'Invalid robot type "{body.type}". '
                   f'Must be one of: {", ".join(sorted(valid_types))}',
        )

    record = store.register_robot(name=body.name, robot_type=body.type)
    logger.info('Robot registered: %s (%s)', record['robot_id'], body.name)
    return record


@router.get('')
async def list_robots(user: User = Depends(get_current_user)):
    """
    List all registered robots with computed online/offline status.

    @return response: Dict with robots list.
    """
    robots = store.get_registered_robots()
    return {'robots': robots}


@router.post('/{robot_id}/heartbeat')
async def robot_heartbeat(robot_id: str,
                          user: User = Depends(get_current_user)):
    """
    Record a heartbeat for a registered robot.

    @param robot_id: The robot's unique ID.

    @return response: Confirmation dict with status 'ack'.

    @raises HTTPException 404: If the robot is not registered.
    """
    ok = store.record_heartbeat(robot_id)
    if not ok:
        raise HTTPException(
            status_code=404,
            detail=f'Robot {robot_id} not found',
        )
    return {'status': 'ack', 'robot_id': robot_id}


@router.delete('/{robot_id}')
async def delete_robot(robot_id: str,
                       user: User = Depends(get_current_user)):
    """
    Remove a robot from the fleet.

    @param robot_id: The robot's unique ID.

    @return response: Confirmation dict.

    @raises HTTPException 404: If the robot is not found.
    """
    ok = store.unregister_robot(robot_id)
    if not ok:
        raise HTTPException(
            status_code=404,
            detail=f'Robot {robot_id} not found',
        )
    logger.info('Robot unregistered: %s', robot_id)
    return {'status': 'deleted', 'robot_id': robot_id}
