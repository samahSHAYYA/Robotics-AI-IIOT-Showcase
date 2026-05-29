"""
@author: Samah SHAYYA
@date: 29-May-2026

@description: Telemetry fetch tools for the AI Agent.
Each tool fetches data from the ops-api service.
"""

import json

from typing import Any

import httpx


async def get_telemetry_snapshot(ops_api_url: str) -> dict[str, Any] | None:
    """
    Fetches the latest telemetry snapshot from the ops-api.

    @param ops_api_url: Base URL of the ops-api service.
    @return snapshot: Parsed JSON snapshot or None on failure.
    """

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f'{ops_api_url}/api/v1/telemetry',
                timeout = 5.0,
            )
            resp.raise_for_status()
            return resp.json()
    except Exception:
        return None


async def get_robot_status(ops_api_url: str) -> dict[str, Any] | None:
    """
    Fetches the robot fleet status from the ops-api.

    @param ops_api_url: Base URL of the ops-api service.
    @return status: Parsed JSON status or None on failure.
    """

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f'{ops_api_url}/api/v1/robot/status',
                timeout = 5.0,
            )
            resp.raise_for_status()
            return resp.json()
    except Exception:
        return None


def format_snapshot(data: dict[str, Any] | None) -> str:
    """
    Formats a telemetry snapshot as a readable string for the LLM.

    @param data: Telemetry snapshot dict or None.
    @return formatted: Pretty-printed JSON or fallback message.
    """

    if data is None:
        return 'No telemetry data available.'
    return json.dumps(data, indent = 2)


def format_robot_status(data: dict[str, Any] | None) -> str:
    """
    Formats robot status data as a readable string for the LLM.

    @param data: Robot status dict or None.
    @return formatted: Pretty-printed JSON or fallback message.
    """

    if data is None:
        return 'No robot status available.'
    return json.dumps(data, indent = 2)
