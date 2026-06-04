"""
@author: Samah SHAYYA
@date: 29-May-2026

@description: FastAPI dependency injection for hierarchical RBAC with
multi-tenant support. Provides JWT and API-key authentication paths,
role hierarchy checking, scope verification, and factory/tenant access
control.
"""

import logging

from typing import Any

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import decode_access_token, verify_api_key
from app.db import User, get_session

security = HTTPBearer(auto_error=False)
logger: logging.Logger = logging.getLogger(__name__)

# ── Role Hierarchy (higher number = more privileges) ─────────────────────────
ROLE_HIERARCHY: dict[str, int] = {
    'super_admin': 100,
    'tenant_admin': 80,
    'factory_admin': 60,
    'integrator': 50,
    'operator': 40,
    'viewer': 20,
}

# ── Role-Level Scopes ────────────────────────────────────────────────────────
ROLE_SCOPES: dict[str, list[str]] = {
    'super_admin': ['global:admin', 'tenant:admin', 'factory:admin', 'robot:control', 'robot:view'],
    'tenant_admin': ['tenant:admin', 'factory:admin', 'robot:control', 'robot:view'],
    'factory_admin': ['factory:admin', 'robot:control', 'robot:view'],
    'integrator': ['api:access', 'telemetry:read'],
    'operator': ['robot:control', 'robot:view'],
    'viewer': ['robot:view'],
}


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    api_key: str | None = Header(None, alias='X-API-Key'),
    session: AsyncSession = Depends(get_session),
) -> User:
    """
    Authenticate via JWT Bearer token or X-API-Key header.

    Two authentication paths:
      1. Authorization: Bearer <token>  →  JWT validation (all roles)
      2. X-API-Key: <key>              →  API key lookup (integrator role)

    @param credentials: Bearer token from the Authorization header (optional).
    @param api_key: API key from the X-API-Key header (optional).
    @param session: Async DB session.

    @return user: Authenticated User ORM instance.

    @raises HTTPException 401: No valid credentials provided.
    @raises HTTPException 401: Invalid or expired token.
    @raises HTTPException 401: User not found.
    """
    # ── Path 1: JWT Bearer token ──
    if credentials is not None:
        token: str = credentials.credentials
        payload: dict[str, Any] | None = decode_access_token(token)

        if payload is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='Invalid or expired token',
            )

        username: str | None = payload.get('sub')
        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='Invalid token payload',
            )

        result = await session.execute(
            select(User).where(User.username == username),
        )
        user: User | None = result.scalar_one_or_none()

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='User not found',
            )

        return user

    # ── Path 2: API Key ──
    if api_key is not None:
        result = await session.execute(
            select(User).where(User.api_key_hash.isnot(None)),
        )
        users = result.scalars().all()
        for u in users:
            if verify_api_key(api_key, u.api_key_hash):
                # Only integrator role is allowed API key auth
                if u.role not in ('integrator',):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail='API key authentication not allowed for this role',
                    )
                return u

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid API key',
        )

    # ── No credentials provided ──
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail='Authentication required. Provide Bearer token or X-API-Key header.',
    )


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    api_key: str | None = Header(None, alias='X-API-Key'),
    session: AsyncSession = Depends(get_session),
) -> User | None:
    """
    Like get_current_user but returns None if no valid credentials are provided.

    Useful for endpoints where authentication is optional (e.g., public status).

    @param credentials: Bearer token (optional).
    @param api_key: X-API-Key header (optional).
    @param session: Async DB session.
    @return: User or None if not authenticated.
    """
    try:
        return await get_current_user(credentials, api_key, session)
    except HTTPException:
        return None


def require_role(*minimum_roles: str):
    """
    Dependency factory: user must have a role AT or ABOVE the minimum level.

    Uses the ROLE_HIERARCHY to compare levels. For example,
    require_role('operator') allows: operator (40), factory_admin (60),
    tenant_admin (80), and super_admin (100).

    This is a hierarchical check, NOT flat matching.

    @param minimum_roles: One or more role names; the minimum level is the
                          lowest among them.
    @return: FastAPI dependency that returns the authenticated User.
    @raises HTTPException 403: If the user's role level is insufficient.
    """
    # Compute the minimum acceptable hierarchy level
    min_level = min(ROLE_HIERARCHY.get(r, 0) for r in minimum_roles)

    async def _require_role(user: User = Depends(get_current_user)) -> User:
        user_level = ROLE_HIERARCHY.get(user.role, 0)
        if user_level < min_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f'Insufficient permissions. Required at least '
                    f'"{minimum_roles[0]}" level, got "{user.role}"'
                ),
            )
        return user
    return _require_role


def require_scope(*required_scopes: str):
    """
    Dependency factory: user must have at least one of the required scopes.

    Scopes are defined in ROLE_SCOPES per role.

    @param required_scopes: One or more scope strings to check.
    @return: FastAPI dependency that returns the authenticated User.
    @raises HTTPException 403: If the user has none of the required scopes.
    """
    async def _require_scope(user: User = Depends(get_current_user)) -> User:
        user_scopes = ROLE_SCOPES.get(user.role, [])
        if not any(s in user_scopes for s in required_scopes):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f'Insufficient scopes. Required one of: '
                    f'{", ".join(required_scopes)}'
                ),
            )
        return user
    return _require_scope


def require_factory_access():
    """
    Dependency factory: ensures the authenticated user has access to the
    factory_id specified in the request (query parameter 'factory_id').

    - super_admin and tenant_admin bypass factory-level checks.
    - factory_admin, operator, viewer, integrator must match their assigned
      factory_id (or the factory_id query param must match).

    If no factory_id is in the request, the user's own factory_id is used.
    If the user has no factory_id assigned and isn't super/tenant admin,
    access is denied.

    @return: FastAPI dependency that returns no value (None).
    @raises HTTPException 403: Factory access denied.
    """
    async def _check(request: Request, user: User = Depends(get_current_user)) -> None:
        # Extract factory_id from query params or path params
        factory_id_str = request.query_params.get('factory_id')
        if factory_id_str is None:
            # Check path params (e.g., /sites/{factory_id})
            factory_id_str = request.path_params.get('factory_id')

        if factory_id_str is not None:
            try:
                requested_factory_id = int(factory_id_str)
            except (ValueError, TypeError):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail='Invalid factory_id parameter',
                )
        else:
            requested_factory_id = user.factory_id

        # Super admin and tenant_admin bypass factory checks
        if user.role in ('super_admin', 'tenant_admin'):
            return

        # Other roles must have a matching factory_id
        if user.factory_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='User has no factory assignment and factory_id not provided',
            )

        if requested_factory_id is None or user.factory_id != requested_factory_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='Factory access denied',
            )

    return _check


def require_tenant_access():
    """
    Dependency factory: ensures the user has access to the requested tenant.

    - super_admin bypasses tenant checks.
    - Other users must match their tenant_id.

    The tenant_id can come from:
      - Query parameter 'tenant_id'
      - Path parameter 'tenant_id'

    @return: FastAPI dependency that returns the authenticated User.
    @raises HTTPException 403: Tenant access denied.
    """
    async def _check(
        request: Request,
        user: User = Depends(get_current_user),
    ) -> User:
        tenant_id_str = request.query_params.get('tenant_id')
        if tenant_id_str is None:
            tenant_id_str = request.path_params.get('tenant_id')

        if tenant_id_str is not None:
            try:
                requested_tenant_id = int(tenant_id_str)
            except (ValueError, TypeError):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail='Invalid tenant_id parameter',
                )
        else:
            requested_tenant_id = user.tenant_id

        # Super admin bypasses tenant checks
        if user.role == 'super_admin':
            return user

        if user.tenant_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='User has no tenant assignment',
            )

        if requested_tenant_id is None or user.tenant_id != requested_tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='Tenant access denied',
            )

        return user
    return _check
