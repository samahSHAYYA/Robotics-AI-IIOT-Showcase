from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


class RobotStatus(BaseModel):
    robot_id: str = Field(..., description = 'Robot identifier (C3, W2, Q1)')
    name: str = Field(..., description = 'Human-readable name')
    status: str = Field(..., description = 'active, maintenance, idle, error')
    uptime_pct: float = Field(..., ge = 0.0, le = 100.0)
    current_task: str | None = None
    joint_angles: dict[str, float] = Field(default_factory = dict)


class TelemetrySnapshot(BaseModel):
    timestamp: datetime = Field(default_factory = lambda: datetime.now(timezone.utc))
    throughput: int = Field(default = 0, description = 'Units processed per hour')
    defect_rate_pct: float = Field(default = 0.0, ge = 0.0, le = 100.0)
    robot_uptime_pct: float = Field(default = 0.0, ge = 0.0, le = 100.0)
    robots: list[RobotStatus] = Field(default_factory = list)
    alerts: list[dict[str, Any]] = Field(default_factory = list)
