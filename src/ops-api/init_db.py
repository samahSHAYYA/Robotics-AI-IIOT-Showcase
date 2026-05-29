"""
@author: Samah SHAYYA
@date: 29-May-2026

@description: Standalone script to initialise database tables and seed the
all-authoritative admin user. Runs on container startup.
"""

import asyncio
import logging
import os

from app.auth import hash_password
from app.db import User, async_session_factory, init_db

logging.basicConfig(
    level = logging.INFO,
    format = '%(asctime)s [%(levelname)s] %(name)s: %(message)s',
)
logger: logging.Logger = logging.getLogger(__name__)

ADMIN_USERNAME: str = os.getenv('ADMIN_USERNAME', 'admin')
ADMIN_PASSWORD: str = os.getenv('ADMIN_PASSWORD', 'admin')


async def seed():
    await init_db()

    async with async_session_factory() as session:
        from sqlalchemy import select

        result = await session.execute(
            select(User).where(User.username == ADMIN_USERNAME),
        )
        existing: User | None = result.scalar_one_or_none()

        if existing is None:
            user = User(
                username = ADMIN_USERNAME,
                password_hash = hash_password(ADMIN_PASSWORD),
                role = 'admin',
            )
            session.add(user)
            await session.commit()
            logger.info('Created admin user (username=%s)', ADMIN_USERNAME)
        else:
            logger.info('Admin user already exists (username=%s)', ADMIN_USERNAME)

    logger.info('Database initialisation complete.')


if __name__ == '__main__':
    asyncio.run(seed())
