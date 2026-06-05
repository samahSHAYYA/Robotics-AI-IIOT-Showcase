"""
@author: Samah SHAYYA
@date: 04-Jun-2026

@description: SQLAlchemy ORM models for the Integration Service — Integration
configurations and SyncLog entries, sharing the ops-api PostgreSQL database.
"""

from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, func,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class Integration(Base):
    __tablename__ = 'integrations'

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id'), nullable=False)
    name = Column(String(200), nullable=False)
    adapter_type = Column(String(50), nullable=False)           # rest, soap, mqtt, etc.
    base_url = Column(String(500), nullable=False)
    auth_type = Column(String(50), default='api_key')           # api_key, basic, oauth2, none
    auth_config = Column(JSON, default={})                      # encrypted credentials
    sync_interval_minutes = Column(Integer, default=60)
    enabled = Column(Boolean, default=True)
    trigger_on_event = Column(Boolean, default=False)           # event-based triggering
    event_types = Column(JSON, default=list)                     # list of event types that trigger sync
    key_rotated_at = Column(DateTime(timezone=True), nullable=True)
    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    last_sync_status = Column(String(20), default='never')       # never, success, error
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class SyncLog(Base):
    __tablename__ = 'sync_logs'

    id = Column(Integer, primary_key=True, autoincrement=True)
    integration_id = Column(Integer, ForeignKey('integrations.id'), nullable=False)
    status = Column(String(20), nullable=False)                  # success, error
    records_synced = Column(Integer, default=0)
    error_message = Column(String(1000), nullable=True)
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
