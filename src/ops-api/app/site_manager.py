"""
@author: Samah SHAYYA
@date: 03-Jun-2026

@description: Multi-Factory Site Management engine (Feature 47) backed by
PostgreSQL. Uses Tenant + Factory models from app.db.
Code/DB uses "tenant" and "factory"; UI displays "Organization"/"Company"
for tenant and "Factory" for factory.

All public functions are async — call with await from route handlers.
"""

import logging
import threading

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from app.db import Factory, Tenant, async_session_factory

logger: logging.Logger = logging.getLogger(__name__)

# ── In-memory active factory cache (thread-safe, sync access only) ───────────
_active_factory_id: int = 1
_active_factory_lock: threading.Lock = threading.Lock()


def _set_active_factory(factory_id: int) -> None:
    """Set the active factory ID (sync, thread-safe)."""
    global _active_factory_id  # noqa: PLW0603
    with _active_factory_lock:
        _active_factory_id = factory_id


def _get_active_factory_id() -> int:
    """Get the active factory ID (sync, thread-safe)."""
    with _active_factory_lock:
        return _active_factory_id


# ── Tenant operations ────────────────────────────────────────────────────────


async def list_tenants() -> list[dict[str, Any]]:
    """Return all tenants."""
    async with async_session_factory() as session:
        result = await session.execute(select(Tenant).order_by(Tenant.id))
        tenants = result.scalars().all()
        return [
            {
                'id': t.id,
                'name': t.name,
                'slug': t.slug,
                'created_at': t.created_at.isoformat() if t.created_at else '',
                'updated_at': t.updated_at.isoformat() if t.updated_at else '',
            }
            for t in tenants
        ]


async def create_tenant(name: str, slug: str) -> dict[str, Any]:
    """Create a new tenant."""
    async with async_session_factory() as session:
        tenant = Tenant(name=name, slug=slug)
        session.add(tenant)
        await session.commit()
        await session.refresh(tenant)
        logger.info('Tenant created: id=%d name=%s slug=%s', tenant.id, name, slug)
        return {
            'id': tenant.id,
            'name': tenant.name,
            'slug': tenant.slug,
            'created_at': tenant.created_at.isoformat() if tenant.created_at else '',
            'updated_at': tenant.updated_at.isoformat() if tenant.updated_at else '',
        }


async def get_tenant(tenant_id: int) -> dict[str, Any] | None:
    """Get a tenant by ID."""
    async with async_session_factory() as session:
        result = await session.execute(select(Tenant).where(Tenant.id == tenant_id))
        t = result.scalar_one_or_none()
        if t is None:
            return None
        return {
            'id': t.id,
            'name': t.name,
            'slug': t.slug,
            'created_at': t.created_at.isoformat() if t.created_at else '',
            'updated_at': t.updated_at.isoformat() if t.updated_at else '',
        }


async def update_tenant(
    tenant_id: int,
    name: str | None = None,
    slug: str | None = None,
) -> dict[str, Any] | None:
    """Update fields on an existing tenant."""
    async with async_session_factory() as session:
        result = await session.execute(select(Tenant).where(Tenant.id == tenant_id))
        t = result.scalar_one_or_none()
        if t is None:
            return None
        if name is not None:
            t.name = name
        if slug is not None:
            t.slug = slug
        t.updated_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(t)
        logger.info('Tenant updated: id=%d', tenant_id)
        return {
            'id': t.id,
            'name': t.name,
            'slug': t.slug,
            'created_at': t.created_at.isoformat() if t.created_at else '',
            'updated_at': t.updated_at.isoformat() if t.updated_at else '',
        }


async def delete_tenant(tenant_id: int) -> bool:
    """Delete a tenant. The default tenant (id=1) cannot be deleted."""
    if tenant_id == 1:
        logger.warning('Attempted to delete the default tenant — denied.')
        return False
    async with async_session_factory() as session:
        result = await session.execute(select(Tenant).where(Tenant.id == tenant_id))
        t = result.scalar_one_or_none()
        if t is None:
            return False
        # Delete associated factories first
        factories = await session.execute(
            select(Factory).where(Factory.tenant_id == tenant_id)
        )
        for f in factories.scalars().all():
            await session.delete(f)
        await session.delete(t)
        await session.commit()
        logger.info('Tenant deleted: id=%d', tenant_id)
        return True


# ── Factory operations ───────────────────────────────────────────────────────


async def list_factories(tenant_id: int | None = None) -> list[dict[str, Any]]:
    """Return all factories, optionally filtered by tenant_id."""
    async with async_session_factory() as session:
        query = select(Factory).order_by(Factory.id)
        if tenant_id is not None:
            query = query.where(Factory.tenant_id == tenant_id)
        result = await session.execute(query)
        factories = result.scalars().all()
        return [
            {
                'site_id': f'factory_{f.id}',
                'id': f.id,
                'tenant_id': f.tenant_id,
                'name': f.name,
                'location': f.location or '',
                'timezone': f.timezone or 'UTC',
                'channel_prefix': f.channel_prefix or '',
                'created_at': f.created_at.isoformat() if f.created_at else '',
                'updated_at': f.updated_at.isoformat() if f.updated_at else '',
            }
            for f in factories
        ]


async def create_factory(
    tenant_id: int,
    name: str,
    location: str = '',
    timezone_str: str = 'UTC',
) -> dict[str, Any]:
    """Create a new factory under a tenant."""
    safe_name = ''.join(c if c.isalnum() else '-' for c in name).lower()
    safe_name = '-'.join(filter(None, safe_name.split('-')))
    channel_prefix = f'factory:{safe_name}' if safe_name else ''

    async with async_session_factory() as session:
        factory = Factory(
            tenant_id=tenant_id,
            name=name,
            location=location,
            timezone=timezone_str,
            channel_prefix=channel_prefix,
        )
        session.add(factory)
        await session.commit()
        await session.refresh(factory)
        logger.info('Factory created: id=%d name=%s tenant=%d', factory.id, name, tenant_id)
        return {
            'site_id': f'factory_{factory.id}',
            'id': factory.id,
            'tenant_id': factory.tenant_id,
            'name': factory.name,
            'location': factory.location or '',
            'timezone': factory.timezone or 'UTC',
            'channel_prefix': factory.channel_prefix or channel_prefix,
            'created_at': factory.created_at.isoformat() if factory.created_at else '',
            'updated_at': factory.updated_at.isoformat() if factory.updated_at else '',
        }


async def get_factory(factory_id: int) -> dict[str, Any] | None:
    """Get a factory by ID."""
    async with async_session_factory() as session:
        result = await session.execute(select(Factory).where(Factory.id == factory_id))
        f = result.scalar_one_or_none()
        if f is None:
            return None
        return {
            'site_id': f'factory_{f.id}',
            'id': f.id,
            'tenant_id': f.tenant_id,
            'name': f.name,
            'location': f.location or '',
            'timezone': f.timezone or 'UTC',
            'channel_prefix': f.channel_prefix or '',
            'created_at': f.created_at.isoformat() if f.created_at else '',
            'updated_at': f.updated_at.isoformat() if f.updated_at else '',
        }


async def update_factory(
    factory_id: int,
    name: str | None = None,
    location: str | None = None,
    timezone_str: str | None = None,
) -> dict[str, Any] | None:
    """Update fields on an existing factory."""
    async with async_session_factory() as session:
        result = await session.execute(select(Factory).where(Factory.id == factory_id))
        f = result.scalar_one_or_none()
        if f is None:
            return None

        if name is not None:
            f.name = name
            safe_name = ''.join(c if c.isalnum() else '-' for c in name).lower()
            safe_name = '-'.join(filter(None, safe_name.split('-')))
            f.channel_prefix = f'factory:{safe_name}' if safe_name else ''

        if location is not None:
            f.location = location
        if timezone_str is not None:
            f.timezone = timezone_str

        f.updated_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(f)
        logger.info('Factory updated: id=%d', factory_id)
        return {
            'site_id': f'factory_{f.id}',
            'id': f.id,
            'tenant_id': f.tenant_id,
            'name': f.name,
            'location': f.location or '',
            'timezone': f.timezone or 'UTC',
            'channel_prefix': f.channel_prefix or '',
            'created_at': f.created_at.isoformat() if f.created_at else '',
            'updated_at': f.updated_at.isoformat() if f.updated_at else '',
        }


async def delete_factory(factory_id: int) -> bool:
    """Delete a factory. The default factory (id=1) cannot be deleted."""
    if factory_id == 1:
        logger.warning('Attempted to delete the default factory — denied.')
        return False
    async with async_session_factory() as session:
        result = await session.execute(select(Factory).where(Factory.id == factory_id))
        f = result.scalar_one_or_none()
        if f is None:
            return False
        await session.delete(f)
        await session.commit()
        logger.info('Factory deleted: id=%d', factory_id)
        return True


# ── Backward-compatible site wrappers ────────────────────────────────────────
# These map the old site_manager API to the new DB-backed Tenant/Factory model.
# "site" → "factory" in the new model. Old site_id format: "site_<hex>" or
# "factory_<id>". We normalize to "factory_<id>" format for backward compat.


def _parse_site_id(site_id: str) -> int | None:
    """Parse a site_id string into a factory ID. Returns None if invalid."""
    if site_id.startswith('factory_'):
        try:
            return int(site_id[len('factory_'):])
        except (ValueError, IndexError):
            return None
    # Legacy: 'site_<hex>' or plain number
    if site_id.startswith('site_'):
        # Legacy IDs — map to factory 1 by default
        return 1
    try:
        return int(site_id)
    except (ValueError, TypeError):
        return None


async def list_sites() -> list[dict[str, Any]]:
    """Return all factories as sites (backward-compatible)."""
    return await list_factories()


async def create_site(name: str, location: str, timezone_str: str) -> dict[str, Any]:
    """Create a new factory (site) under the default tenant (id=1)."""
    return await create_factory(
        tenant_id=1,
        name=name,
        location=location,
        timezone_str=timezone_str,
    )


async def get_site(site_id: str) -> dict[str, Any] | None:
    """Get a factory by site_id (format: 'factory_<id>')."""
    factory_id = _parse_site_id(site_id)
    if factory_id is None:
        return None
    return await get_factory(factory_id)


async def update_site(
    site_id: str,
    name: str | None = None,
    location: str | None = None,
    timezone_str: str | None = None,
) -> dict[str, Any] | None:
    """Update fields on an existing factory (site)."""
    factory_id = _parse_site_id(site_id)
    if factory_id is None:
        return None
    return await update_factory(
        factory_id=factory_id,
        name=name,
        location=location,
        timezone_str=timezone_str,
    )


async def delete_site(site_id: str) -> bool:
    """Delete a factory (site)."""
    factory_id = _parse_site_id(site_id)
    if factory_id is None:
        return False
    return await delete_factory(factory_id)


async def get_active_site() -> dict[str, Any]:
    """Return the currently active factory as a site dict."""
    fid = _get_active_factory_id()
    factory = await get_factory(fid)
    if factory is not None:
        return factory

    # Fallback: return factory 1 (which should always exist after seeding)
    factory = await get_factory(1)
    if factory is not None:
        return factory

    # Last resort: return a hardcoded default
    return {
        'site_id': 'factory_1',
        'id': 1,
        'tenant_id': 1,
        'name': 'Main Factory',
        'location': 'Default Location',
        'timezone': 'UTC',
        'channel_prefix': 'factory:main',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }


async def switch_active_site(site_id: str) -> dict[str, Any] | None:
    """Switch the active factory. Returns the new active site or None."""
    factory_id = _parse_site_id(site_id)
    if factory_id is None:
        return None

    # Verify the factory exists
    factory = await get_factory(factory_id)
    if factory is None:
        return None

    _set_active_factory(factory_id)
    logger.info('Active factory switched to: %s (%s)', site_id, factory['name'])
    return factory


async def get_channel_prefix(site_id: str | None = None) -> str:
    """Return the Redis channel prefix for the given site (or active site)."""
    if site_id is not None:
        site = await get_site(site_id)
        if site:
            return site.get('channel_prefix', 'factory:main')
    active = await get_active_site()
    return active.get('channel_prefix', 'factory:main')
