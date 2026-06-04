"""
@author: Samah SHAYYA
@date: 04-Jun-2026

@description: Pydantic request and response schemas for the Integration
Service REST API.
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ── Integration Schemas ──────────────────────────────────────────────────────


class IntegrationCreate(BaseModel):
    name: str = Field(..., max_length=200)
    adapter_type: str = Field(..., max_length=50)
    base_url: str = Field(..., max_length=500)
    auth_type: str = Field(default='api_key', max_length=50)
    auth_config: dict[str, Any] = Field(default_factory=dict)
    sync_interval_minutes: int = Field(default=60, ge=1)
    enabled: bool = Field(default=True)
    trigger_on_event: bool = Field(default=False)
    event_types: list[str] = Field(default_factory=list)


class IntegrationUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    adapter_type: str | None = Field(default=None, max_length=50)
    base_url: str | None = Field(default=None, max_length=500)
    auth_type: str | None = Field(default=None, max_length=50)
    auth_config: dict[str, Any] | None = Field(default=None)
    sync_interval_minutes: int | None = Field(default=None, ge=1)
    enabled: bool | None = Field(default=None)
    trigger_on_event: bool | None = Field(default=None)
    event_types: list[str] | None = Field(default=None)


class IntegrationResponse(BaseModel):
    id: int
    tenant_id: int
    name: str
    adapter_type: str
    base_url: str
    auth_type: str
    sync_interval_minutes: int
    enabled: bool
    trigger_on_event: bool = False
    event_types: list[str] = Field(default_factory=list)
    last_sync_at: datetime | None = None
    last_sync_status: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {'from_attributes': True}


# ── SyncLog Schemas ──────────────────────────────────────────────────────────


class SyncLogResponse(BaseModel):
    id: int
    integration_id: int
    status: str
    records_synced: int
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None

    model_config = {'from_attributes': True}


class SyncLogPage(BaseModel):
    items: list[SyncLogResponse]
    total: int
    page: int
    page_size: int


# ── Adapter Schemas ──────────────────────────────────────────────────────────


class AdapterInfo(BaseModel):
    name: str


class AdapterListResponse(BaseModel):
    adapters: list[AdapterInfo]


# ── Test Connection Schemas ──────────────────────────────────────────────────


class TestConnectionResult(BaseModel):
    success: bool
    message: str


# ── Trigger Schemas ──────────────────────────────────────────────────────────


class TriggerEvent(BaseModel):
    event_type: str = Field(default='manual')
    payload: dict[str, Any] = Field(default_factory=dict)


class TriggerResult(BaseModel):
    status: str
    integration_id: int
    message: str
