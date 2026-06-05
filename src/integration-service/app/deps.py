"""
@author: Samah SHAYYA
@date: 04-Jun-2026

@description: FastAPI dependency injection for the Integration Service.
Validates JWT tokens signed by ops-api using the shared JWT_SECRET and
extracts tenant_id for multi-tenant data isolation.
"""

import logging
import os

from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from jose import JWTError, jwt

logger: logging.Logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error = False)

SECRET_KEY: str = os.getenv('JWT_SECRET', 'super-secret-key-change-in-production')
ALGORITHM: str = 'HS256'


def decode_access_token(token: str) -> dict[str, Any] | None:
    """
    Decode and validate a JWT access token using the shared JWT_SECRET.

    @param token: The JWT string to decode.
    @return: The decoded payload dict, or None if the token is invalid/expired.
    """
    try:
        payload: dict[str, Any] = jwt.decode(
            token, SECRET_KEY, algorithms = [ALGORITHM],
        )
        return payload
    except JWTError as exc:
        logger.warning('JWT decode failed: %s', exc)
        return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict[str, Any]:
    """
    Authenticate the caller via a JWT Bearer token.

    Extracts tenant_id from the JWT payload for tenant-scoped data access.

    @param credentials: Bearer token from the Authorization header.
    @return: The JWT payload dict containing 'sub', 'role', 'tenant_id', etc.
    @raises HTTPException 401: If no token is provided or the token is invalid.
    """
    if credentials is None:
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail = 'Authentication required. Provide a Bearer token.',
        )

    payload: dict[str, Any] | None = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail = 'Invalid or expired token.',
        )

    return payload


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict[str, Any] | None:
    """
    Like get_current_user but returns None if no valid credentials are provided.

    @param credentials: Bearer token (optional).
    @return: JWT payload dict or None if not authenticated.
    """
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None
