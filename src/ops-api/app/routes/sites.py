"""
@author: Samah SHAYYA
@date: 03-Jun-2026

@description: REST endpoints for Multi-Factory / Site Management (Feature 47)
and multi-tenant user management (Task 90 RBAC).
Provides CRUD operations for tenants, factories (sites), and users.
"""

import logging

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import hash_password
from app.deps import (
    get_current_user,
    require_factory_access,
    require_role,
    require_tenant_access,
)
from app.db import Factory, Tenant, User as UserModel, get_session
from app.site_manager import (
    create_factory,
    create_tenant,
    create_site,
    delete_factory,
    delete_site,
    delete_tenant,
    get_active_site,
    get_channel_prefix,
    get_factory,
    get_site,
    get_tenant,
    list_factories,
    list_sites,
    list_tenants,
    switch_active_site,
    update_factory,
    update_site,
    update_tenant,
)
from app.store import store

router: APIRouter = APIRouter(prefix='/api/v1')
logger: logging.Logger = logging.getLogger(__name__)


# ── Pydantic Models ──────────────────────────────────────────────────────────


class SiteCreateRequest(BaseModel):
    """Request body for creating a new site (factory)."""
    name: str
    location: str = ''
    timezone: str = 'UTC'


class SiteUpdateRequest(BaseModel):
    """Request body for updating an existing site."""
    name: str | None = None
    location: str | None = None
    timezone: str | None = None


class TenantCreateRequest(BaseModel):
    """Request body for creating a new tenant."""
    name: str
    slug: str


class TenantUpdateRequest(BaseModel):
    """Request body for updating an existing tenant."""
    name: str | None = None
    slug: str | None = None


class UserCreateRequest(BaseModel):
    """Request body for creating a new user under a tenant."""
    username: str
    password: str
    role: str = 'operator'
    factory_id: int | None = None


class UserUpdateRequest(BaseModel):
    """Request body for updating a user."""
    role: str | None = None
    factory_id: int | None = None
    password: str | None = None


# ── Site / Factory Endpoints ────────────────────────────────────────────────


@router.get('/sites')
async def get_sites(
    user: UserModel = Depends(require_role('tenant_admin')),
    _=Depends(require_factory_access()),
):
    """
    List all factory sites (filtered by user's tenant).

    @return response: Dict with sites list and active site info.
    """
    tid = user.tenant_id if user.role != 'super_admin' else None
    sites = await list_factories(tenant_id=tid)
    active = await get_active_site()
    return {
        'sites': sites,
        'active_site': active,
        'total': len(sites),
    }


@router.post('/sites', status_code=201)
async def create_site_endpoint(
    body: SiteCreateRequest,
    user: UserModel = Depends(require_role('tenant_admin')),
):
    """
    Create a new factory site under the user's tenant.

    @param body: Site details (name, location, timezone).

    @return site: The created site record.
    """
    tid = user.tenant_id if user.role != 'super_admin' else 1
    site = await create_factory(
        tenant_id=tid,
        name=body.name,
        location=body.location,
        timezone_str=body.timezone,
    )
    logger.info('Site created: %s (tenant=%d)', site['site_id'], tid)
    return site


@router.get('/sites/{factory_id}')
async def get_site_endpoint(
    factory_id: int,
    user: UserModel = Depends(require_role('viewer')),
    _=Depends(require_factory_access()),
):
    """
    Get details for a specific factory site.

    @param factory_id: The factory's numeric ID.

    @return site: The factory record.

    @raises HTTPException 404: If the factory is not found.
    """
    site = await get_factory(factory_id)
    if site is None:
        raise HTTPException(
            status_code=404,
            detail=f'Factory {factory_id} not found',
        )
    return site


@router.put('/sites/{factory_id}')
async def update_site_endpoint(
    factory_id: int, body: SiteUpdateRequest,
    user: UserModel = Depends(require_role('tenant_admin')),
    _=Depends(require_factory_access()),
):
    """
    Update an existing factory's fields.

    @param factory_id: The factory's numeric ID.
    @param body: Fields to update (name, location, timezone).

    @return site: The updated factory record.

    @raises HTTPException 404: If the factory is not found.
    """
    site = await update_factory(
        factory_id=factory_id,
        name=body.name,
        location=body.location,
        timezone_str=body.timezone,
    )
    if site is None:
        raise HTTPException(
            status_code=404,
            detail=f'Factory {factory_id} not found',
        )
    logger.info('Factory updated: %d', factory_id)
    return site


@router.delete('/sites/{factory_id}')
async def delete_site_endpoint(
    factory_id: int,
    user: UserModel = Depends(require_role('super_admin')),
):
    """
    Delete a factory. The default factory (id=1) cannot be deleted.

    @param factory_id: The factory's numeric ID.

    @return response: Confirmation dict.

    @raises HTTPException 404: If the factory is not found.
    @raises HTTPException 400: If attempting to delete the default factory.
    """
    ok = await delete_factory(factory_id)
    if not ok:
        if factory_id == 1:
            raise HTTPException(
                status_code=400,
                detail='Cannot delete the default factory.',
            )
        raise HTTPException(
            status_code=404,
            detail=f'Factory {factory_id} not found',
        )
    return {'status': 'deleted', 'factory_id': factory_id}


@router.get('/sites/{factory_id}/telemetry')
async def get_site_telemetry(
    factory_id: int,
    user: UserModel = Depends(require_role('viewer')),
    _=Depends(require_factory_access()),
):
    """
    Get telemetry data scoped to a specific factory.

    @param factory_id: The factory's numeric ID.

    @return response: Dict with factory_id, channel_prefix, and telemetry data.

    @raises HTTPException 404: If the factory is not found.
    """
    factory = await get_factory(factory_id)
    if factory is None:
        raise HTTPException(
            status_code=404,
            detail=f'Factory {factory_id} not found',
        )

    snapshot = store.get_snapshot()
    channel_prefix = await get_channel_prefix(f'factory_{factory_id}')

    return {
        'factory_id': factory_id,
        'factory_name': factory['name'],
        'channel_prefix': channel_prefix,
        'telemetry': snapshot,
    }


@router.post('/sites/{factory_id}/switch')
async def switch_site_endpoint(
    factory_id: int,
    user: UserModel = Depends(require_role('tenant_admin')),
    _=Depends(require_factory_access()),
):
    """
    Switch the active factory. Changes the Redis channel prefix used for
    pub/sub operations.

    @param factory_id: The factory's numeric ID.

    @return response: Dict with new active factory details.

    @raises HTTPException 404: If the factory is not found.
    """
    site = await switch_active_site(f'factory_{factory_id}')
    if site is None:
        raise HTTPException(
            status_code=404,
            detail=f'Factory {factory_id} not found',
        )
    logger.info('Active factory switched to %d (%s)', factory_id, site['name'])
    return {
        'status': 'switched',
        'active_site': site,
        'channel_prefix': site['channel_prefix'],
    }


@router.get('/sites/active/info')
async def get_active_site_info(
    user: UserModel = Depends(require_role('viewer')),
):
    """
    Get the currently active factory's information.

    @return response: The active factory record.
    """
    return await get_active_site()


# ── Tenant Management Endpoints (super_admin only) ──────────────────────────


@router.get('/tenants')
async def list_tenants_endpoint(
    user: UserModel = Depends(require_role('super_admin')),
):
    """
    List all tenants.

    @return response: Dict with tenants list.
    """
    tenants = await list_tenants()
    return {'tenants': tenants, 'total': len(tenants)}


@router.post('/tenants', status_code=201)
async def create_tenant_endpoint(
    body: TenantCreateRequest,
    user: UserModel = Depends(require_role('super_admin')),
):
    """
    Create a new tenant.

    @param body: Tenant details (name, slug).

    @return tenant: The created tenant record.
    """
    tenant = await create_tenant(name=body.name, slug=body.slug)
    logger.info('Tenant created: id=%d name=%s', tenant['id'], body.name)
    return tenant


@router.get('/tenants/{tenant_id}')
async def get_tenant_endpoint(
    tenant_id: int,
    user: UserModel = Depends(require_role('super_admin')),
    _=Depends(require_tenant_access()),
):
    """
    Get details for a specific tenant.

    @param tenant_id: The tenant's numeric ID.

    @return tenant: The tenant record.

    @raises HTTPException 404: If the tenant is not found.
    """
    tenant = await get_tenant(tenant_id)
    if tenant is None:
        raise HTTPException(
            status_code=404,
            detail=f'Tenant {tenant_id} not found',
        )
    return tenant


@router.put('/tenants/{tenant_id}')
async def update_tenant_endpoint(
    tenant_id: int, body: TenantUpdateRequest,
    user: UserModel = Depends(require_role('super_admin')),
    _=Depends(require_tenant_access()),
):
    """
    Update an existing tenant's fields.

    @param tenant_id: The tenant's numeric ID.
    @param body: Fields to update (name, slug).

    @return tenant: The updated tenant record.

    @raises HTTPException 404: If the tenant is not found.
    """
    tenant = await update_tenant(
        tenant_id=tenant_id,
        name=body.name,
        slug=body.slug,
    )
    if tenant is None:
        raise HTTPException(
            status_code=404,
            detail=f'Tenant {tenant_id} not found',
        )
    logger.info('Tenant updated: id=%d', tenant_id)
    return tenant


@router.delete('/tenants/{tenant_id}')
async def delete_tenant_endpoint(
    tenant_id: int,
    user: UserModel = Depends(require_role('super_admin')),
    _=Depends(require_tenant_access()),
):
    """
    Delete a tenant. The default tenant (id=1) cannot be deleted.

    @param tenant_id: The tenant's numeric ID.

    @return response: Confirmation dict.

    @raises HTTPException 404: If the tenant is not found.
    @raises HTTPException 400: If attempting to delete the default tenant.
    """
    ok = await delete_tenant(tenant_id)
    if not ok:
        if tenant_id == 1:
            raise HTTPException(
                status_code=400,
                detail='Cannot delete the default tenant.',
            )
        raise HTTPException(
            status_code=404,
            detail=f'Tenant {tenant_id} not found',
        )
    return {'status': 'deleted', 'tenant_id': tenant_id}


# ── User Management Endpoints ───────────────────────────────────────────────


@router.post('/tenants/{tenant_id}/users', status_code=201)
async def create_user_endpoint(
    tenant_id: int, body: UserCreateRequest,
    user: UserModel = Depends(require_role('tenant_admin')),
    session: AsyncSession = Depends(get_session),
):
    """
    Create a new user under a tenant.

    Requires tenant_admin or super_admin role.
    Super admin can create users in any tenant.

    @param tenant_id: The tenant's numeric ID.
    @param body: User details.

    @return response: The created user record (without password).
    """
    # Verify tenant exists
    tenant = await get_tenant(tenant_id)
    if tenant is None:
        raise HTTPException(
            status_code=404,
            detail=f'Tenant {tenant_id} not found',
        )

    # Check if username is taken
    existing = await session.execute(
        select(UserModel).where(UserModel.username == body.username),
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=400,
            detail=f'Username "{body.username}" already exists',
        )

    # Validate role
    valid_roles = {'super_admin', 'tenant_admin', 'factory_admin',
                   'operator', 'viewer', 'integrator'}
    if body.role not in valid_roles:
        raise HTTPException(
            status_code=400,
            detail=f'Invalid role "{body.role}". Must be one of: {", ".join(sorted(valid_roles))}',
        )

    # Verify factory belongs to tenant if specified
    if body.factory_id is not None:
        factory = await get_factory(body.factory_id)
        if factory is None or factory['tenant_id'] != tenant_id:
            raise HTTPException(
                status_code=400,
                detail='Factory does not belong to the specified tenant',
            )

    new_user = UserModel(
        tenant_id=tenant_id,
        factory_id=body.factory_id,
        username=body.username,
        password_hash=hash_password(body.password),
        role=body.role,
    )
    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    logger.info('User created: username=%s role=%s tenant=%d',
                body.username, body.role, tenant_id)

    return {
        'id': new_user.id,
        'username': new_user.username,
        'role': new_user.role,
        'tenant_id': new_user.tenant_id,
        'factory_id': new_user.factory_id,
    }


@router.get('/users')
async def list_users_endpoint(
    user: UserModel = Depends(require_role('tenant_admin')),
    session: AsyncSession = Depends(get_session),
    tenant_id: int | None = Query(None, description='Filter by tenant (super_admin only)'),
):
    """
    List users, filtered by the user's tenant.

    Super admin can see all users; tenant_admin sees only their tenant's users.

    @return response: Dict with users list.
    """
    query = select(UserModel).order_by(UserModel.id)

    if user.role == 'super_admin':
        if tenant_id is not None:
            query = query.where(UserModel.tenant_id == tenant_id)
    else:
        # tenant_admin sees only their tenant's users
        query = query.where(UserModel.tenant_id == user.tenant_id)

    result = await session.execute(query)
    users = result.scalars().all()

    return {
        'users': [
            {
                'id': u.id,
                'username': u.username,
                'role': u.role,
                'tenant_id': u.tenant_id,
                'factory_id': u.factory_id,
                'created_at': u.created_at.isoformat() if u.created_at else '',
            }
            for u in users
        ],
        'total': len(users),
    }


@router.put('/users/{user_id}')
async def update_user_endpoint(
    user_id: int, body: UserUpdateRequest,
    user: UserModel = Depends(require_role('tenant_admin')),
    session: AsyncSession = Depends(get_session),
):
    """
    Update a user's role, factory assignment, or password.

    Requires tenant_admin or super_admin.
    Tenant admin can only update users within their own tenant.

    @param user_id: The user's numeric ID.
    @param body: Fields to update.

    @return response: Updated user record.

    @raises HTTPException 404: If the user is not found.
    @raises HTTPException 403: If tenant_admin tries to edit outside tenant.
    """
    result = await session.execute(
        select(UserModel).where(UserModel.id == user_id),
    )
    target_user = result.scalar_one_or_none()

    if target_user is None:
        raise HTTPException(
            status_code=404,
            detail=f'User {user_id} not found',
        )

    # Tenant admin can only edit users in their own tenant
    if user.role == 'tenant_admin' and target_user.tenant_id != user.tenant_id:
        raise HTTPException(
            status_code=403,
            detail='Cannot edit users outside your tenant',
        )

    if body.role is not None:
        valid_roles = {'super_admin', 'tenant_admin', 'factory_admin',
                       'operator', 'viewer', 'integrator'}
        if body.role not in valid_roles:
            raise HTTPException(
                status_code=400,
                detail=f'Invalid role "{body.role}"',
            )
        target_user.role = body.role

    if body.factory_id is not None:
        target_user.factory_id = body.factory_id

    if body.password is not None:
        target_user.password_hash = hash_password(body.password)

    await session.commit()
    await session.refresh(target_user)

    logger.info('User updated: id=%d username=%s', user_id, target_user.username)

    return {
        'id': target_user.id,
        'username': target_user.username,
        'role': target_user.role,
        'tenant_id': target_user.tenant_id,
        'factory_id': target_user.factory_id,
    }


@router.delete('/users/{user_id}')
async def delete_user_endpoint(
    user_id: int,
    user: UserModel = Depends(require_role('tenant_admin')),
    session: AsyncSession = Depends(get_session),
):
    """
    Remove a user.

    Requires tenant_admin or super_admin.
    Cannot delete yourself.

    @param user_id: The user's numeric ID.

    @return response: Confirmation dict.

    @raises HTTPException 404: If the user is not found.
    @raises HTTPException 400: If attempting to delete yourself.
    @raises HTTPException 403: If tenant_admin tries to delete outside tenant.
    """
    if user_id == user.id:
        raise HTTPException(
            status_code=400,
            detail='Cannot delete your own user account',
        )

    result = await session.execute(
        select(UserModel).where(UserModel.id == user_id),
    )
    target_user = result.scalar_one_or_none()

    if target_user is None:
        raise HTTPException(
            status_code=404,
            detail=f'User {user_id} not found',
        )

    # Tenant admin can only delete users in their own tenant
    if user.role == 'tenant_admin' and target_user.tenant_id != user.tenant_id:
        raise HTTPException(
            status_code=403,
            detail='Cannot delete users outside your tenant',
        )

    await session.delete(target_user)
    await session.commit()

    logger.info('User deleted: id=%d username=%s', user_id, target_user.username)
    return {'status': 'deleted', 'user_id': user_id}
