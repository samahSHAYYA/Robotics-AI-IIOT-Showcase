"""
@author: Samah SHAYYA
@date: 04-Jun-2026

@description: Async SQLAlchemy engine, session factory, and initialisation
for the integration service. Uses the shared PostgreSQL database with the
same connection URL convention as ops-api.
"""

import logging
import os

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import Base

logger: logging.Logger = logging.getLogger(__name__)

DATABASE_URL: str = os.getenv(
    'DATABASE_URL',
    'postgresql+asyncpg://showcase:showcase_secret@localhost:5432/showcase',
)

engine = create_async_engine(DATABASE_URL, echo = False)
async_session_factory = async_sessionmaker(engine, expire_on_commit = False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Provide an async database session for FastAPI dependency injection.

    @yield: An AsyncSession bound to the engine.
    """
    async with async_session_factory() as session:
        yield session


async def init_db():
    """
    Create all tables defined in models.Base.metadata.

    Safe to call on every startup — SQLAlchemy uses IF NOT EXISTS semantics
    for tables that already exist.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    logger.info('Database tables initialised.')
