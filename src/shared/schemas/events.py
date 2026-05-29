from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


class SensorReading(BaseModel):
    sensor_type: str = Field(..., description = 'e.g., temperature, pressure, vibration')
    sensor_id: str = Field(..., description = 'Unique sensor identifier')
    measure: str = Field(..., description = 'Measured quantity (temperature, pressure, ...)')
    value: float = Field(..., description = 'Numeric reading in canonical SI unit')
    unit: str = Field(..., description = 'SI unit symbol (K, Pa, A, ...)')


class SensorEvent(BaseModel):
    event_type: str = Field('sensor.reading', description = 'Event type discriminator')
    trace_id: str = Field(..., description = 'Propagated trace identifier')
    timestamp: datetime = Field(default_factory = lambda: datetime.now(timezone.utc))
    source: str = Field('core-platform', description = 'Originating service')
    readings: list[SensorReading] = Field(default_factory = list)


class SafetyEvent(BaseModel):
    event_type: str = Field('safety.status', description = 'Event type discriminator')
    trace_id: str = Field(..., description = 'Propagated trace identifier')
    timestamp: datetime = Field(default_factory = lambda: datetime.now(timezone.utc))
    source: str = Field('core-platform', description = 'Originating service')
    safe_state: str = Field(..., description = 'healthy, warning, critical')
    details: str | None = None


class CameraEvent(BaseModel):
    event_type: str = Field('camera.frame', description = 'Event type discriminator')
    trace_id: str = Field(..., description = 'Propagated trace identifier')
    timestamp: datetime = Field(default_factory = lambda: datetime.now(timezone.utc))
    source: str = Field('core-platform', description = 'Originating service')
    camera_id: str = Field(..., description = 'Camera identifier')
    frame_id: str = Field(..., description = 'Frame sequence identifier')
    width: int = Field(default = 640)
    height: int = Field(default = 480)


class MLPrediction(BaseModel):
    event_type: str = Field('ml.prediction', description = 'Event type discriminator')
    trace_id: str = Field(..., description = 'Propagated trace identifier')
    timestamp: datetime = Field(default_factory = lambda: datetime.now(timezone.utc))
    source: str = Field('ai-service', description = 'Originating service')

    model_name: str = Field(..., description = 'Model identifier (cv_inspector_v12, ...)')
    prediction_type: str = Field(..., description = 'defect_detection, maintenance_forecast, ...')
    confidence: float = Field(..., ge = 0.0, le = 1.0)
    result: dict[str, Any] = Field(default_factory = dict)
    triggered_alert: str | None = None


class CommandEvent(BaseModel):
    event_type: str = Field('command.issue', description = 'Event type discriminator')
    trace_id: str = Field(..., description = 'Propagated trace identifier')
    timestamp: datetime = Field(default_factory = lambda: datetime.now(timezone.utc))
    source: str = Field('ops-api', description = 'Originating service')
    command: str = Field(..., description = 'Command identifier (safe-stop, resume, inspect, ...)')
    target: str = Field(..., description = 'Target robot or station')
    params: dict[str, Any] = Field(default_factory = dict)
