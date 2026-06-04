"""initial_multi_tenant_schema

Revision ID: 001
Revises:
Create Date: 2026-06-03 10:00:00.000000

@author: Samah SHAYYA
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the full multi-tenant schema."""

    # ── Tenants ──────────────────────────────────────────────────────────────
    op.create_table(
        'tenants',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('slug', sa.String(100), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug'),
    )

    # ── Factories ────────────────────────────────────────────────────────────
    op.create_table(
        'factories',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('location', sa.String(300), nullable=True),
        sa.Column('timezone', sa.String(50), server_default='UTC'),
        sa.Column('channel_prefix', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )

    # ── Users ────────────────────────────────────────────────────────────────
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id'), nullable=True),
        sa.Column('factory_id', sa.Integer(), sa.ForeignKey('factories.id'), nullable=True),
        sa.Column('username', sa.String(100), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('role', sa.String(50), server_default='operator'),
        sa.Column('api_key_hash', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('username'),
    )

    # ── Robots ───────────────────────────────────────────────────────────────
    op.create_table(
        'robots',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('factory_id', sa.Integer(), sa.ForeignKey('factories.id'), nullable=False),
        sa.Column('robot_id', sa.String(20), nullable=False),
        sa.Column('name', sa.String(200), nullable=True),
        sa.Column('type', sa.String(50), nullable=True),
        sa.Column('status', sa.String(50), server_default='offline'),
        sa.Column('pose', sa.JSON(), nullable=True),
        sa.Column('uptime_pct', sa.Float(), server_default='100.0'),
        sa.Column('current_task', sa.String(200), nullable=True),
        sa.Column('last_heartbeat', sa.DateTime(timezone=True), nullable=True),
        sa.Column('registered_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('factory_id', 'robot_id', name='uq_robot_per_factory'),
    )

    # ── Telemetry Snapshots ──────────────────────────────────────────────────
    op.create_table(
        'telemetry_snapshots',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('factory_id', sa.Integer(), sa.ForeignKey('factories.id'), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        sa.Column('data', JSONB(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    # ── Alerts ───────────────────────────────────────────────────────────────
    op.create_table(
        'alerts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('factory_id', sa.Integer(), sa.ForeignKey('factories.id'), nullable=False),
        sa.Column('robot_id', sa.String(20), nullable=True),
        sa.Column('severity', sa.String(20), nullable=False),
        sa.Column('message', sa.String(500), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        sa.PrimaryKeyConstraint('id'),
    )

    # ── Audit Logs ───────────────────────────────────────────────────────────
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('factory_id', sa.Integer(), sa.ForeignKey('factories.id'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('robot_id', sa.String(20), nullable=True),
        sa.Column('action', sa.String(50), nullable=False),
        sa.Column('details', sa.String(500), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        sa.PrimaryKeyConstraint('id'),
    )

    # ── Webhook Configs ──────────────────────────────────────────────────────
    op.create_table(
        'webhook_configs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('factory_id', sa.Integer(), sa.ForeignKey('factories.id'), nullable=False),
        sa.Column('url', sa.String(500), nullable=False),
        sa.Column('trigger', sa.String(100), nullable=False),
        sa.Column('enabled', sa.Boolean(), server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    """Drop all tables created in the upgrade."""
    op.drop_table('webhook_configs')
    op.drop_table('audit_logs')
    op.drop_table('alerts')
    op.drop_table('telemetry_snapshots')
    op.drop_table('robots')
    op.drop_table('users')
    op.drop_table('factories')
    op.drop_table('tenants')
