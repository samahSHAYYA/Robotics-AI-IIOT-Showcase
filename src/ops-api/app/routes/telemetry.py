"""
@author: Samah SHAYYA
@date: 28-May-2026

@description: REST endpoints for telemetry and robot status.
"""

import uuid

from fastapi import APIRouter

from app.store import store

router: APIRouter = APIRouter(prefix = '/api/v1')


@router.get('/telemetry')
async def get_telemetry():
    """
    Returns the latest telemetry snapshot.

    @return data: Telemetry snapshot with throughput, defect rate, uptime,
                  robots, alerts.
    """

    return store.get_snapshot()


@router.get('/robot/status')
async def get_robot_status():
    """
    Returns the current fleet status.

    @return robots: List of robot status dicts.
    """

    return {'robots': store.get_robots()}
