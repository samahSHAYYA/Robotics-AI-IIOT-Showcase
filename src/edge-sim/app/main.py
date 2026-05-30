"""
@author: Samah SHAYYA
@date: 30-May-2026

@description: Edge Device Simulator — FastAPI application that simulates 10 IoT
sensors on the factory floor. Provides REST endpoints for querying sensor data,
injecting failure modes, and resetting sensors. Background task publishes sensor
snapshots to Redis every 2 seconds.
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException

from app.sensors import FailureMode, SensorServer

LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger: logging.Logger = logging.getLogger(__name__)

sensor_server: SensorServer | None = None
_sim_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the sensor simulation loop on application startup."""
    global sensor_server, _sim_task

    logger.info("Initialising Edge Device Simulator ...")
    sensor_server = SensorServer()
    _sim_task = asyncio.create_task(sensor_server.run())

    yield

    if _sim_task is not None:
        _sim_task.cancel()
        try:
            await _sim_task
        except asyncio.CancelledError:
            pass

    if sensor_server is not None:
        await sensor_server.stop()

    logger.info("Edge Device Simulator shut down.")


app = FastAPI(
    title="Edge Device Simulator",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/")
async def root() -> dict[str, Any]:
    """Return service overview information."""
    return {
        "service": "Edge Device Simulator",
        "version": "0.1.0",
        "endpoints": {
            "health": "/health",
            "sensors": "/sensors",
            "sensor_detail": "/sensors/{id}",
            "trigger_failure": "POST /sensors/{id}/fail",
            "reset_sensor": "POST /sensors/{id}/reset",
            "docs": "/docs",
        },
    }


@app.get("/health")
async def health() -> dict[str, str]:
    """Return service health status."""
    return {"status": "ok", "service": "edge-sim"}


@app.get("/sensors")
async def get_sensors() -> list[dict[str, Any]]:
    """
    Return all 10 simulated IoT sensors with current values, status, and history.

    Each sensor includes:
    - id: Unique sensor identifier
    - name: Human-readable name
    - category: Sensor type (temperature, vibration, humidity, power)
    - unit: Measurement unit
    - value: Current simulated value
    - status: normal / warning / critical
    - timestamp: ISO 8601 timestamp of last update
    - history: Last 20 values for sparkline rendering
    """
    if sensor_server is None:
        raise HTTPException(status_code=503, detail="Sensor simulator not initialised")

    sensors = sensor_server.simulator.get_sensors()
    result = []
    for s in sensors:
        s_copy = dict(s)
        s_copy["history"] = sensor_server.simulator.get_history(s["id"])
        result.append(s_copy)
    return result


@app.get("/sensors/{sensor_id}")
async def get_sensor(sensor_id: str) -> dict[str, Any]:
    """
    Return a single sensor by its ID.

    Args:
        sensor_id: The unique sensor identifier (e.g. "temp_assembly").

    Returns:
        Sensor data with current value, status, and history.

    Raises:
        404: If the sensor ID is not found.
    """
    if sensor_server is None:
        raise HTTPException(status_code=503, detail="Sensor simulator not initialised")

    sensor = sensor_server.simulator.get_sensor(sensor_id)
    if sensor is None:
        raise HTTPException(status_code=404, detail=f"Sensor '{sensor_id}' not found")

    sensor_copy = dict(sensor)
    sensor_copy["history"] = sensor_server.simulator.get_history(sensor_id)
    return sensor_copy


@app.post("/sensors/{sensor_id}/fail")
async def trigger_failure(sensor_id: str, mode: str = "drift") -> dict[str, Any]:
    """
    Trigger a failure mode on a specific sensor for testing.

    Args:
        sensor_id: The target sensor ID.
        mode: Failure mode — "drift" (linear drift), "spike" (intermittent
              spikes), or "dropout" (value freeze).

    Returns:
        Confirmation message.

    Raises:
        400: If the failure mode is invalid.
        404: If the sensor ID is not found.
    """
    if sensor_server is None:
        raise HTTPException(status_code=503, detail="Sensor simulator not initialised")

    try:
        failure_mode = FailureMode(mode)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid failure mode '{mode}'. Choose from: drift, spike, dropout",
        )

    success = sensor_server.simulator.trigger_failure(sensor_id, failure_mode)
    if not success:
        raise HTTPException(status_code=404, detail=f"Sensor '{sensor_id}' not found")

    return {
        "status": "ok",
        "message": f"Failure mode '{mode}' applied to sensor '{sensor_id}'",
    }


@app.post("/sensors/{sensor_id}/reset")
async def reset_sensor(sensor_id: str) -> dict[str, Any]:
    """
    Reset a sensor to normal operation, clearing any active failure mode.

    Args:
        sensor_id: The target sensor ID.

    Returns:
        Confirmation message.

    Raises:
        404: If the sensor ID is not found.
    """
    if sensor_server is None:
        raise HTTPException(status_code=503, detail="Sensor simulator not initialised")

    success = sensor_server.simulator.reset_sensor(sensor_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Sensor '{sensor_id}' not found")

    return {
        "status": "ok",
        "message": f"Sensor '{sensor_id}' reset to normal operation",
    }
