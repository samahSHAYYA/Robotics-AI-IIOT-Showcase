"""
@author: Samah SHAYYA
@date: 30-May-2026

@description: Proxy REST endpoints for the Edge Device Simulator (IoT Sensor Grid).
Forwards requests to the edge-sim service running on port 8005.
"""

import logging
import os
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.deps import get_current_user, require_factory_access, require_role
from app.db import User

logger: logging.Logger = logging.getLogger(__name__)

EDGE_SIM_URL: str = os.getenv("EDGE_SIM_URL", "http://edge-sim:8005")

router: APIRouter = APIRouter(prefix="/api/v1")


@router.get("/sensors")
async def get_sensors(user: User = Depends(get_current_user)) -> list[dict[str, Any]]:
    """
    Proxy: list all sensors with current values from the Edge Device Simulator.

    Returns:
        List of sensor data dicts including id, name, category, unit, value,
        status, timestamp, and history.

    Raises:
        503: If the edge-sim service is unreachable.
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{EDGE_SIM_URL}/sensors", timeout=5.0)
            response.raise_for_status()
            return response.json()
        except httpx.RequestError as exc:
            logger.error("Failed to proxy GET /sensors to edge-sim: %s", exc)
            raise HTTPException(
                status_code=503,
                detail="Edge Device Simulator is unreachable",
            )


@router.get("/sensors/{sensor_id}")
async def get_sensor(sensor_id: str,
                     user: User = Depends(get_current_user)) -> dict[str, Any]:
    """
    Proxy: return a single sensor by ID.

    Args:
        sensor_id: The unique sensor identifier.

    Returns:
        Sensor data dict.

    Raises:
        404: If the sensor ID is not found.
        503: If the edge-sim service is unreachable.
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{EDGE_SIM_URL}/sensors/{sensor_id}", timeout=5.0,
            )
            if response.status_code == 404:
                raise HTTPException(status_code=404, detail=response.json().get("detail", "Sensor not found"))
            response.raise_for_status()
            return response.json()
        except httpx.RequestError as exc:
            logger.error("Failed to proxy GET /sensors/%s: %s", sensor_id, exc)
            raise HTTPException(
                status_code=503,
                detail="Edge Device Simulator is unreachable",
            )


@router.post("/sensors/{sensor_id}/fail")
async def trigger_failure(
    sensor_id: str, mode: str = "drift",
    user: User = Depends(require_role('operator')),
    _=Depends(require_factory_access()),
    factory_id: int | None = Query(None, description='Factory context'),
) -> dict[str, Any]:
    """
    Proxy: trigger a failure mode on a sensor.

    Args:
        sensor_id: The target sensor ID.
        mode: Failure mode — drift, spike, or dropout.

    Returns:
        Confirmation message.

    Raises:
        404: If the sensor ID is not found.
        503: If the edge-sim service is unreachable.
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{EDGE_SIM_URL}/sensors/{sensor_id}/fail?mode={mode}",
                timeout=5.0,
            )
            if response.status_code == 404:
                raise HTTPException(status_code=404, detail=response.json().get("detail", "Sensor not found"))
            response.raise_for_status()
            return response.json()
        except httpx.RequestError as exc:
            logger.error("Failed to proxy POST /sensors/%s/fail: %s", sensor_id, exc)
            raise HTTPException(
                status_code=503,
                detail="Edge Device Simulator is unreachable",
            )


@router.post("/sensors/{sensor_id}/reset")
async def reset_sensor(
    sensor_id: str,
    user: User = Depends(require_role('operator')),
    _=Depends(require_factory_access()),
    factory_id: int | None = Query(None, description='Factory context'),
) -> dict[str, Any]:
    """
    Proxy: reset a sensor to normal operation.

    Args:
        sensor_id: The target sensor ID.

    Returns:
        Confirmation message.

    Raises:
        404: If the sensor ID is not found.
        503: If the edge-sim service is unreachable.
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{EDGE_SIM_URL}/sensors/{sensor_id}/reset",
                timeout=5.0,
            )
            if response.status_code == 404:
                raise HTTPException(status_code=404, detail=response.json().get("detail", "Sensor not found"))
            response.raise_for_status()
            return response.json()
        except httpx.RequestError as exc:
            logger.error("Failed to proxy POST /sensors/%s/reset: %s", sensor_id, exc)
            raise HTTPException(
                status_code=503,
                detail="Edge Device Simulator is unreachable",
            )
