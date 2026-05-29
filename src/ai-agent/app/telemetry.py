"""
@author: Samah SHAYYA
@date: 28-May-2026

@description: Readonly telemetry fetcher from ops-api.
"""

import json
import urllib.request
from typing import Any


def fetch_json(ops_api_url: str, path: str) -> dict[str, Any] | None:
    try:
        url = f"{ops_api_url}{path}"
        resp = urllib.request.urlopen(url, timeout=5)
        return json.loads(resp.read())
    except Exception:
        return None


def get_snapshot(ops_api_url: str) -> str:
    data = fetch_json(ops_api_url, "/api/v1/telemetry")
    if data:
        return json.dumps(data, indent=2)
    return "No telemetry data available."


def get_robot_status(ops_api_url: str) -> str:
    data = fetch_json(ops_api_url, "/api/v1/robot/status")
    if data:
        return json.dumps(data, indent=2)
    return "No robot status available."


def build_context(ops_api_url: str) -> str:
    telemetry = get_snapshot(ops_api_url)
    robots = get_robot_status(ops_api_url)
    return (
        f"--- Telemetry Snapshot ---\n{telemetry}\n\n"
        f"--- Robot Fleet Status ---\n{robots}"
    )
