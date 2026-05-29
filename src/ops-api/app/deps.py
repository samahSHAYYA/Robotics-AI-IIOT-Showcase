"""
@author: Samah SHAYYA
@date: 29-May-2026

@description: FastAPI dependency injection for token-based auth. Provides
`get_current_user` to protect routes.
"""

import logging

from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import decode_access_token
from app.db import User, get_session

security = HTTPBearer()
logger: logging.Logger = logging.getLogger(__name__)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_session),
) -> User:
    """
    Validates the Bearer token and returns the authenticated User.

    @param credentials: Bearer token from the Authorization header.
    @param session: Async DB session.

    @return user: Authenticated User ORM instance.

    @raises HTTPException 401: Invalid or expired token.
    @raises HTTPException 401: User no longer exists.
    """

    token: str = credentials.credentials
    payload: dict[str, Any] | None = decode_access_token(token)

    if payload is None:
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail = 'Invalid or expired token',
        )

    username: str | None = payload.get('sub')

    if username is None:
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail = 'Invalid token payload',
        )

    result = await session.execute(
        select(User).where(User.username == username),
    )
    user: User | None = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail = 'User not found',
        )

    return user
