"""
@author: Samah SHAYYA
@date: 03-Jun-2026

@description: Async SQLAlchemy engine, session, and all multi-tenant database
models for PostgreSQL. Naming convention: code/DB uses "tenant" and "factory";
UI displays "Organization"/"Company" for tenant and "Factory" for factory.
"""

import os

from typing import AsyncGenerator

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String, func,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, relationship

DATABASE_URL: str = os.getenv(
    'DATABASE_URL',
    'postgresql+asyncpg://showcase:showcase_secret@localhost:5432/showcase',
)

engine = create_async_engine(DATABASE_URL, echo=False)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


# ── Multi-Tenant Models ──────────────────────────────────────────────────────


class Tenant(Base):
    __tablename__ = 'tenants'

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)                         # e.g. "Acme Corp"
    slug = Column(String(100), unique=True, nullable=False)             # URL-safe unique slug
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    factories = relationship('Factory', back_populates='tenant')
    users = relationship('User', back_populates='tenant')


class Factory(Base):
    __tablename__ = 'factories'

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id'), nullable=False)
    name = Column(String(200), nullable=False)                        # e.g. "Berlin Plant"
    location = Column(String(300))                                     # Physical location
    timezone = Column(String(50), default='UTC')
    channel_prefix = Column(String(100))                               # Redis channel isolation
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    tenant = relationship('Tenant', back_populates='factories')
    users = relationship('User', back_populates='factory')
    robots = relationship('Robot', back_populates='factory')
    telemetry_snapshots = relationship('TelemetrySnapshot', back_populates='factory')
    alerts = relationship('Alert', back_populates='factory')
    audit_logs = relationship('AuditLog', back_populates='factory')
    webhook_configs = relationship('WebhookConfig', back_populates='factory')


class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey('tenants.id'), nullable=True)    # NULL for super_admin
    factory_id = Column(Integer, ForeignKey('factories.id'), nullable=True)  # NULL for tenant-level
    username = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), default='operator')
    # Roles: super_admin, tenant_admin, factory_admin, operator, viewer, integrator
    api_key_hash = Column(String(255), nullable=True)                        # for integrator role
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    tenant = relationship('Tenant', back_populates='users')
    factory = relationship('Factory', back_populates='users')


class Robot(Base):
    __tablename__ = 'robots'

    id = Column(Integer, primary_key=True, autoincrement=True)
    factory_id = Column(Integer, ForeignKey('factories.id'), nullable=False)
    robot_id = Column(String(20), nullable=False)                     # e.g. "C3", "W2", auto-discovered
    name = Column(String(200))
    type = Column(String(50))                                         # humanoid, welder, inspector
    status = Column(String(50), default='offline')
    pose = Column(JSON)                                               # {x, y, theta}
    uptime_pct = Column(Float, default=100.0)
    current_task = Column(String(200), nullable=True)
    last_heartbeat = Column(DateTime(timezone=True), nullable=True)
    registered_at = Column(DateTime(timezone=True), server_default=func.now())

    factory = relationship('Factory', back_populates='robots')

    __table_args__ = (
        UniqueConstraint('factory_id', 'robot_id', name='uq_robot_per_factory'),
    )


class TelemetrySnapshot(Base):
    __tablename__ = 'telemetry_snapshots'

    id = Column(Integer, primary_key=True, autoincrement=True)
    factory_id = Column(Integer, ForeignKey('factories.id'), nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    data = Column(JSONB, nullable=False)                              # Full snapshot payload

    factory = relationship('Factory', back_populates='telemetry_snapshots')


class Alert(Base):
    __tablename__ = 'alerts'

    id = Column(Integer, primary_key=True, autoincrement=True)
    factory_id = Column(Integer, ForeignKey('factories.id'), nullable=False)
    robot_id = Column(String(20), nullable=True)
    severity = Column(String(20), nullable=False)                     # info, warning, critical
    message = Column(String(500), nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    factory = relationship('Factory', back_populates='alerts')


class AuditLog(Base):
    __tablename__ = 'audit_logs'

    id = Column(Integer, primary_key=True, autoincrement=True)
    factory_id = Column(Integer, ForeignKey('factories.id'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    robot_id = Column(String(20))
    action = Column(String(50), nullable=False)
    details = Column(String(500))
    ip_address = Column(String(45))
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    factory = relationship('Factory', back_populates='audit_logs')


class WebhookConfig(Base):
    __tablename__ = 'webhook_configs'

    id = Column(Integer, primary_key=True, autoincrement=True)
    factory_id = Column(Integer, ForeignKey('factories.id'), nullable=False)
    url = Column(String(500), nullable=False)
    trigger = Column(String(100), nullable=False)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    factory = relationship('Factory', back_populates='webhook_configs')


# ── Session & Init ───────────────────────────────────────────────────────────


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
