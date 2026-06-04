"""
@author: Samah SHAYYA
@date: 29-May-2026

@description: REST endpoint for user authentication. POST /api/v1/auth/login
validates credentials against PostgreSQL and returns a JWT with full
tenant/factory context.
"""

import logging

from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_access_token, verify_password
from app.db import User, get_session
from app.deps import ROLE_SCOPES

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
    tenant_id: int | None = None
    tenant_name: str | None = None
    factory_id: int | None = None
    factory_name: str | None = None


@router.post('/login', response_model = LoginResponse)
async def login(payload: LoginRequest, session: AsyncSession = Depends(get_session)):
    """
    Authenticates a user and returns a JWT access token with full
    tenant/factory context.

    The JWT payload includes:
      - sub: username
      - role: user role
      - tenant_id: int or None
      - factory_id: int or None
      - scope: computed scope string from ROLE_SCOPES

    @param payload: LoginRequest with username and password.
    @param session: Async DB session.

    @return response: LoginResponse with access_token and context.

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

    # Resolve tenant/factory names for response
    tenant_name: str | None = None
    factory_name: str | None = None

    if user.tenant_id is not None:
        from app.db import Tenant
        t_result = await session.execute(
            select(Tenant).where(Tenant.id == user.tenant_id),
        )
        tenant_obj = t_result.scalar_one_or_none()
        if tenant_obj is not None:
            tenant_name = tenant_obj.name

    if user.factory_id is not None:
        from app.db import Factory
        f_result = await session.execute(
            select(Factory).where(Factory.id == user.factory_id),
        )
        factory_obj = f_result.scalar_one_or_none()
        if factory_obj is not None:
            factory_name = factory_obj.name

    # Build scope from role
    scopes = ROLE_SCOPES.get(user.role, [])
    scope_str: str = ' '.join(scopes)

    token: str = create_access_token(
        data = {
            'sub': user.username,
            'role': user.role,
            'tenant_id': user.tenant_id,
            'factory_id': user.factory_id,
            'scope': scope_str,
        },
        expires_delta = timedelta(hours = 8),
    )

    logger.info('User=%s logged in (role=%s, tenant=%s)',
                user.username, user.role, tenant_name)

    return LoginResponse(
        access_token = token,
        username = user.username,
        role = user.role,
        tenant_id = user.tenant_id,
        tenant_name = tenant_name,
        factory_id = user.factory_id,
        factory_name = factory_name,
    )
