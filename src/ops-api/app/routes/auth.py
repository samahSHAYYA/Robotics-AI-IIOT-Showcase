"""
@author: Samah SHAYYA
@date: 29-May-2026

@description: REST endpoint for user authentication. POST /api/v1/auth/login
validates credentials against PostgreSQL and returns a JWT.
"""

import logging

from datetime import timedelta
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_access_token, verify_password
from app.db import User, get_session

router: APIRouter = APIRouter(prefix = '/api/v1/auth')
logger: logging.Logger = logging.getLogger(__name__)


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'
    username: str
    role: str


@router.post('/login', response_model = LoginResponse)
async def login(payload: LoginRequest, session: AsyncSession = Depends(get_session)):
    """
    Authenticates a user and returns a JWT access token.

    @param payload: LoginRequest with username and password.
    @param session: Async DB session.

    @return response: LoginResponse with access_token.

    @raises HTTPException 401: Invalid credentials.
    """

    result = await session.execute(
        select(User).where(User.username == payload.username),
    )
    user: User | None = result.scalar_one_or_none()

    if user is None or not verify_password(payload.password, user.password_hash):
        logger.warning('Failed login attempt for user=%s', payload.username)
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail = 'Invalid username or password',
            headers = {'WWW-Authenticate': 'Bearer'},
        )

    token: str = create_access_token(
        data = {'sub': user.username, 'role': user.role},
        expires_delta = timedelta(hours = 8),
    )

    logger.info('User=%s logged in (role=%s)', user.username, user.role)

    return LoginResponse(
        access_token = token,
        username = user.username,
        role = user.role,
    )
