"""
@author: Samah SHAYYA
@date: 03-Jun-2026

@description: Alembic environment configuration for async SQLAlchemy (asyncpg).
Imports all models from app.db for autogenerate support.
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import create_async_engine

# Alembic Config object
config = context.config

# Set up Python logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Import all models so Alembic can detect changes
from app.db import Base  # noqa: E402

target_metadata = Base.metadata

# Database URL — fallback to the same default as app.db
DATABASE_URL: str = config.get_main_option(
    "sqlalchemy.url",
    "postgresql+asyncpg://showcase:showcase_secret@localhost:5432/showcase",
)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    Creates SQL scripts without connecting to the database.
    """
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    """Helper to configure context and run migrations on a sync connection."""
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create an async engine and run migrations inside an async connection."""
    connectable = create_async_engine(DATABASE_URL, poolclass=pool.NullPool)

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode using the async engine."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
