"""
@author: Samah SHAYYA
@date: 29-May-2026

@description: Async SQLAlchemy engine, session, and User model for PostgreSQL
authentication.
"""

import os

from typing import AsyncGenerator

from sqlalchemy import Column, Integer, String, DateTime, func
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

DATABASE_URL: str = os.getenv(
    'DATABASE_URL',
    'postgresql+asyncpg://showcase:showcase_secret@localhost:5432/showcase',
)

engine = create_async_engine(DATABASE_URL, echo = False)
async_session_factory = async_sessionmaker(engine, expire_on_commit = False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key = True, autoincrement = True)
    username = Column(String(100), unique = True, nullable = False)
    password_hash = Column(String(255), nullable = False)
    role = Column(String(50), default = 'operator')
    created_at = Column(DateTime(timezone = True), server_default = func.now())


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
