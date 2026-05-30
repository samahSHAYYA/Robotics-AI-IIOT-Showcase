"""
@author: Samah SHAYYA
@date: 30-May-2026

@description: Edge Device Simulator — IoT sensor data models and simulation
logic for the factory floor. Provides a SensorSimulator class managing 10
simulated sensors across temperature, vibration, humidity, and power categories
with realistic random walks and configurable failure modes (drift, spike, dropout).
"""

import asyncio
import json
import logging
import os
import random
from datetime import datetime, timezone
from enum import Enum
from typing import Any

import redis.asyncio as aioredis

logger: logging.Logger = logging.getLogger(__name__)


class SensorCategory(str, Enum):
    """Categories of IoT sensors on the factory floor."""

    TEMPERATURE = "temperature"
    VIBRATION = "vibration"
    HUMIDITY = "humidity"
    POWER = "power"


class FailureMode(str, Enum):
    """Configurable failure modes for testing sensor fault tolerance."""

    DRIFT = "drift"
    SPIKE = "spike"
    DROPOUT = "dropout"


class SensorStatus(str, Enum):
    """Operational status indicator for a sensor."""

    NORMAL = "normal"
    WARNING = "warning"
    CRITICAL = "critical"


SENSOR_DEFINITIONS: list[dict[str, Any]] = [
    # Temperature sensors (3) — range 20–80°C
    {"id": "temp_assembly", "name": "Assembly Line", "category": SensorCategory.TEMPERATURE, "unit": "°C", "min_val": 20.0, "max_val": 80.0, "nominal": 37.0},
    {"id": "temp_welding", "name": "Welding Bay", "category": SensorCategory.TEMPERATURE, "unit": "°C", "min_val": 20.0, "max_val": 80.0, "nominal": 45.0},
    {"id": "temp_inspection", "name": "Inspection Area", "category": SensorCategory.TEMPERATURE, "unit": "°C", "min_val": 20.0, "max_val": 80.0, "nominal": 25.0},
    # Vibration sensors (3) — range 0–10 mm/s
    {"id": "vib_robot_c3", "name": "Robot C3", "category": SensorCategory.VIBRATION, "unit": "mm/s", "min_val": 0.0, "max_val": 10.0, "nominal": 2.5},
    {"id": "vib_robot_w2", "name": "Robot W2", "category": SensorCategory.VIBRATION, "unit": "mm/s", "min_val": 0.0, "max_val": 10.0, "nominal": 3.0},
    {"id": "vib_robot_q1", "name": "Robot Q1", "category": SensorCategory.VIBRATION, "unit": "mm/s", "min_val": 0.0, "max_val": 10.0, "nominal": 1.8},
    # Humidity sensors (2) — range 30–80%
    {"id": "hum_factory", "name": "Factory Floor", "category": SensorCategory.HUMIDITY, "unit": "%", "min_val": 30.0, "max_val": 80.0, "nominal": 55.0},
    {"id": "hum_storage", "name": "Storage Area", "category": SensorCategory.HUMIDITY, "unit": "%", "min_val": 30.0, "max_val": 80.0, "nominal": 45.0},
    # Power sensors (2) — range 100–500 kW
    {"id": "pwr_main", "name": "Main Line", "category": SensorCategory.POWER, "unit": "kW", "min_val": 100.0, "max_val": 500.0, "nominal": 300.0},
    {"id": "pwr_backup", "name": "Backup Circuit", "category": SensorCategory.POWER, "unit": "kW", "min_val": 100.0, "max_val": 500.0, "nominal": 150.0},
]


def _clamp(value: float, min_val: float, max_val: float) -> float:
    """Clamp a value to the given inclusive range."""
    return max(min_val, min(value, max_val))


def _random_walk(current: float, nominal: float, step: float, min_val: float, max_val: float) -> float:
    """
    Perform a realistic random walk around the nominal value.

    The walk has a slight drift toward the nominal value (mean reversion)
    to prevent unbounded wandering.
    """
    drift = (nominal - current) * 0.05
    noise = random.uniform(-step, step)
    return _clamp(current + drift + noise, min_val, max_val)


def _determine_status(value: float, nominal: float, min_val: float, max_val: float, category: SensorCategory) -> SensorStatus:
    """
    Determine sensor status based on deviation from nominal.

    - Normal: within 15% of the nominal range
    - Warning: 15–30% deviation
    - Critical: > 30% deviation or at range boundaries
    """
    range_span = max_val - min_val
    deviation = abs(value - nominal) / range_span if range_span > 0 else 0.0

    if deviation > 0.30 or value <= min_val * 1.02 or value >= max_val * 0.98:
        return SensorStatus.CRITICAL
    if deviation > 0.15:
        return SensorStatus.WARNING
    return SensorStatus.NORMAL


class SensorSimulator:
    """
    Manages the lifecycle, simulation, and failure injection of 10 IoT sensors.

    Attributes:
        sensors: A dict of sensor_id -> sensor state dict.
        _history: History of sensor snapshots (last N values per sensor).
        _max_history: Maximum number of historical values to retain.
        _failed: Set of sensor IDs currently in failure mode.
    """

    def __init__(self, max_history: int = 20) -> None:
        now = datetime.now(timezone.utc).isoformat()

        self.sensors: dict[str, dict[str, Any]] = {}
        self._history: dict[str, list[float]] = {}
        self._max_history: int = max_history
        self._failed: set[str] = set()
        self._failure_params: dict[str, dict[str, Any]] = {}

        for definition in SENSOR_DEFINITIONS:
            sensor_id: str = definition["id"]
            initial_value: float = definition["nominal"] + random.uniform(-2.0, 2.0)
            initial_value = _clamp(initial_value, definition["min_val"], definition["max_val"])

            self.sensors[sensor_id] = {
                "id": sensor_id,
                "name": definition["name"],
                "category": definition["category"].value,
                "unit": definition["unit"],
                "value": round(initial_value, 2),
                "status": SensorStatus.NORMAL.value,
                "timestamp": now,
            }
            self._history[sensor_id] = [initial_value]

    def get_sensors(self) -> list[dict[str, Any]]:
        """Return all sensors with current values."""
        return list(self.sensors.values())

    def get_sensor(self, sensor_id: str) -> dict[str, Any] | None:
        """Return a single sensor by ID, or None if not found."""
        return self.sensors.get(sensor_id)

    def get_history(self, sensor_id: str) -> list[float]:
        """Return the value history for a sensor (last N values)."""
        return self._history.get(sensor_id, [])

    def trigger_failure(self, sensor_id: str, mode: FailureMode) -> bool:
        """
        Inject a failure mode into a sensor.

        Args:
            sensor_id: The target sensor ID.
            mode: Failure mode — drift, spike, or dropout.

        Returns:
            True if the sensor was found and failure was applied.
        """
        if sensor_id not in self.sensors:
            return False

        self._failed.add(sensor_id)
        self._failure_params[sensor_id] = {"mode": mode, "step": 0}
        logger.info("Sensor %s failure mode set to %s", sensor_id, mode.value)
        return True

    def reset_sensor(self, sensor_id: str) -> bool:
        """
        Reset a sensor to normal operation, clearing any failure mode.

        Args:
            sensor_id: The target sensor ID.

        Returns:
            True if the sensor was found and reset.
        """
        if sensor_id not in self.sensors:
            return False

        self._failed.discard(sensor_id)
        self._failure_params.pop(sensor_id, None)

        definition = next(d for d in SENSOR_DEFINITIONS if d["id"] == sensor_id)
        self.sensors[sensor_id]["value"] = definition["nominal"]
        self.sensors[sensor_id]["status"] = SensorStatus.NORMAL.value
        logger.info("Sensor %s reset to normal", sensor_id)
        return True

    async def _apply_failure(self, sensor_id: str, definition: dict[str, Any]) -> float:
        """
        Apply the active failure mode to a sensor value.

        - drift: Accumulate a linear drift at 2% of range per tick.
        - spike: Occasionally inject a large value (every 3–6 ticks).
        - dropout: Freeze the value (returns the same value repeatedly).
        """
        params = self._failure_params.get(sensor_id)
        if params is None:
            return definition["nominal"]

        params["step"] = params.get("step", 0) + 1
        current_val = self.sensors[sensor_id]["value"]
        range_span = definition["max_val"] - definition["min_val"]

        if params["mode"] == FailureMode.DRIFT.value or params["mode"] == FailureMode.DRIFT:
            drift_amount = range_span * 0.02
            drifted = current_val + drift_amount
            return _clamp(drifted, definition["min_val"], definition["max_val"])

        if params["mode"] == FailureMode.SPIKE.value or params["mode"] == FailureMode.SPIKE:
            # Spike every 3–6 ticks
            if params["step"] % random.randint(3, 6) == 0:
                spike_value = definition["max_val"] * random.uniform(0.9, 1.1)
                return _clamp(spike_value, definition["min_val"], definition["max_val"])
            # Between spikes, do a normal random walk
            return _random_walk(current_val, definition["nominal"], range_span * 0.03, definition["min_val"], definition["max_val"])

        if params["mode"] == FailureMode.DROPOUT.value or params["mode"] == FailureMode.DROPOUT:
            # Freeze at current value (return same value)
            return current_val

        return definition["nominal"]

    async def tick(self) -> None:
        """
        Advance the simulation by one tick (2 simulated seconds).

        Updates all sensor values using random walk logic (or failure modes),
        determines status, and appends to history.
        """
        now = datetime.now(timezone.utc).isoformat()

        for definition in SENSOR_DEFINITIONS:
            sensor_id: str = definition["id"]
            current_val: float = self.sensors[sensor_id]["value"]

            if sensor_id in self._failed:
                new_val = await self._apply_failure(sensor_id, definition)
            else:
                range_span = definition["max_val"] - definition["min_val"]
                step = range_span * 0.03
                new_val = _random_walk(current_val, definition["nominal"], step, definition["min_val"], definition["max_val"])

            new_val = round(new_val, 2)
            status = _determine_status(new_val, definition["nominal"], definition["min_val"], definition["max_val"], definition["category"])

            self.sensors[sensor_id]["value"] = new_val
            self.sensors[sensor_id]["status"] = status.value
            self.sensors[sensor_id]["timestamp"] = now

            # Update history ring buffer
            history = self._history.setdefault(sensor_id, [])
            history.append(new_val)
            if len(history) > self._max_history:
                history.pop(0)


class SensorServer:
    """
    Wraps SensorSimulator with a Redis publisher loop.

    Periodically ticks the simulator and publishes the full sensor snapshot
    to the Redis channel 'edge:sensors'.
    """

    def __init__(self, redis_url: str | None = None, tick_interval: float = 2.0) -> None:
        self.simulator = SensorSimulator()
        self.redis_url: str = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379/0")
        self.tick_interval: float = tick_interval
        self._redis: aioredis.Redis | None = None
        self._running: bool = False

    async def _ensure_redis(self) -> aioredis.Redis:
        """Get or create the Redis connection."""
        if self._redis is None:
            self._redis = aioredis.from_url(self.redis_url, decode_responses=True)
        return self._redis

    async def _publish_snapshot(self) -> None:
        """Publish the full sensor snapshot to Redis."""
        try:
            redis = await self._ensure_redis()
            sensors = self.simulator.get_sensors()
            # Attach history for each sensor
            sensors_with_history = []
            for s in sensors:
                s_copy = dict(s)
                s_copy["history"] = self.simulator.get_history(s["id"])
                sensors_with_history.append(s_copy)

            payload = json.dumps({"type": "edge_snapshot", "data": sensors_with_history, "timestamp": datetime.now(timezone.utc).isoformat()})
            await redis.publish("edge:sensors", payload)
        except Exception:
            logger.warning("Failed to publish sensor snapshot to Redis", exc_info=True)

    async def run(self) -> None:
        """Main loop: tick the simulator and publish every tick_interval seconds."""
        self._running = True
        logger.info("SensorServer started (interval=%ss, redis=%s)", self.tick_interval, self.redis_url)

        while self._running:
            await self.simulator.tick()
            await self._publish_snapshot()
            await asyncio.sleep(self.tick_interval)

    async def stop(self) -> None:
        """Gracefully stop the simulation loop."""
        self._running = False
        if self._redis:
            await self._redis.close()
            self._redis = None
        logger.info("SensorServer stopped")
