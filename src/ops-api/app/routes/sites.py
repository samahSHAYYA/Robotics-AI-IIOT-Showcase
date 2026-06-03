"""
@author: generated
@date: 30-May-2026

@description: REST endpoints for Multi-Factory / Site Management (Feature 47).
Provides CRUD operations for factory sites and active site switching.
"""

import logging

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.deps import require_role
from app.db import User
from app.site_manager import (
    create_site,
    delete_site,
    get_active_site,
    get_channel_prefix,
    get_site,
    list_sites,
    switch_active_site,
    update_site,
)
from app.store import store

router: APIRouter = APIRouter(prefix='/api/v1/sites')
logger: logging.Logger = logging.getLogger(__name__)


class SiteCreateRequest(BaseModel):
    """Request body for creating a new site."""
    name: str
    location: str
    timezone: str


class SiteUpdateRequest(BaseModel):
    """Request body for updating an existing site."""
    name: str | None = None
    location: str | None = None
    timezone: str | None = None


class SiteSwitchRequest(BaseModel):
    """Request body for switching the active site."""
    site_id: str


@router.get('')
async def get_sites(user: User = Depends(require_role('admin', 'operator'))):
    """
    List all factory sites.

    @return response: Dict with sites list and active site info.
    """
    sites = list_sites()
    active = get_active_site()
    return {
        'sites': sites,
        'active_site': active,
        'total': len(sites),
    }


@router.post('', status_code=201)
async def create_site_endpoint(body: SiteCreateRequest,
                               user: User = Depends(require_role('admin', 'operator'))):
    """
    Create a new factory site.

    @param body: Site details (name, location, timezone).

    @return site: The created site record.
    """
    site = create_site(
        name=body.name,
        location=body.location,
        timezone_str=body.timezone,
    )
    logger.info('Site created: %s', site['site_id'])
    return site


@router.get('/{site_id}')
async def get_site_endpoint(site_id: str,
                            user: User = Depends(require_role('admin', 'operator'))):
    """
    Get details for a specific site.

    @param site_id: The site's unique ID.

    @return site: The site record.

    @raises HTTPException 404: If the site is not found.
    """
    site = get_site(site_id)
    if site is None:
        raise HTTPException(
            status_code=404,
            detail=f'Site {site_id} not found',
        )
    return site


@router.put('/{site_id}')
async def update_site_endpoint(site_id: str, body: SiteUpdateRequest,
                               user: User = Depends(require_role('admin', 'operator'))):
    """
    Update an existing site's fields.

    @param site_id: The site's unique ID.
    @param body: Fields to update (name, location, timezone).

    @return site: The updated site record.

    @raises HTTPException 404: If the site is not found.
    """
    site = update_site(
        site_id=site_id,
        name=body.name,
        location=body.location,
        timezone_str=body.timezone,
    )
    if site is None:
        raise HTTPException(
            status_code=404,
            detail=f'Site {site_id} not found',
        )
    logger.info('Site updated: %s', site_id)
    return site


@router.delete('/{site_id}')
async def delete_site_endpoint(site_id: str,
                               user: User = Depends(require_role('admin', 'operator'))):
    """
    Delete a site. The default site ('site_default') cannot be deleted.

    @param site_id: The site's unique ID.

    @return response: Confirmation dict.

    @raises HTTPException 404: If the site is not found.
    @raises HTTPException 400: If attempting to delete the default site.
    """
    if site_id == 'site_default':
        raise HTTPException(
            status_code=400,
            detail='Cannot delete the default site.',
        )
    ok = delete_site(site_id)
    if not ok:
        raise HTTPException(
            status_code=404,
            detail=f'Site {site_id} not found',
        )
    return {'status': 'deleted', 'site_id': site_id}


@router.get('/{site_id}/telemetry')
async def get_site_telemetry(site_id: str,
                             user: User = Depends(require_role('admin', 'operator'))):
    """
    Get telemetry data scoped to a specific site.

    The channel prefix for the site is used, and the telemetry snapshot
    from the store is returned with site context.

    @param site_id: The site's unique ID.

    @return response: Dict with site_id, channel_prefix, and telemetry data.

    @raises HTTPException 404: If the site is not found.
    """
    site = get_site(site_id)
    if site is None:
        raise HTTPException(
            status_code=404,
            detail=f'Site {site_id} not found',
        )

    snapshot = store.get_snapshot()
    channel_prefix = get_channel_prefix(site_id)

    return {
        'site_id': site_id,
        'site_name': site['name'],
        'channel_prefix': channel_prefix,
        'telemetry': snapshot,
    }


@router.post('/{site_id}/switch')
async def switch_site(site_id: str,
                      user: User = Depends(require_role('admin', 'operator'))):
    """
    Switch the active site. Changes the Redis channel prefix used for
    pub/sub operations.

    @param site_id: The site ID to switch to.

    @return response: Dict with new active site details.

    @raises HTTPException 404: If the site is not found.
    """
    site = switch_active_site(site_id)
    if site is None:
        raise HTTPException(
            status_code=404,
            detail=f'Site {site_id} not found',
        )
    logger.info('Active site switched to %s (%s)', site_id, site['name'])
    return {
        'status': 'switched',
        'active_site': site,
        'channel_prefix': site['channel_prefix'],
    }


@router.get('/active/info')
async def get_active_site_info(user: User = Depends(require_role('admin', 'operator'))):
    """
    Get the currently active site's information.

    @return response: The active site record.
    """
    return get_active_site()
