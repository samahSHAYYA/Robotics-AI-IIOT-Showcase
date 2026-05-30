"""
@author: generated
@date: 30-May-2026

@description: Multi-Factory Site Management engine (Feature 47).
Provides in-memory site store, channel prefix management per site, and
a default "Main Factory" site that always exists.
"""

import logging
import threading
import uuid

from datetime import datetime, timezone
from typing import Any

logger: logging.Logger = logging.getLogger(__name__)

# ── Site store ──────────────────────────────────────────────────────────────

_sites: dict[str, dict[str, Any]] = {}
_sites_lock: threading.Lock = threading.Lock()
_active_site_id: str | None = None


def _create_default_site() -> dict[str, Any]:
    """Create and return the default 'Main Factory' site."""
    site: dict[str, Any] = {
        'site_id': 'site_default',
        'name': 'Main Factory',
        'location': 'Default Location',
        'timezone': 'UTC',
        'channel_prefix': 'factory:main',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }
    _sites[site['site_id']] = site
    return site


# ── Public API ──────────────────────────────────────────────────────────────

def list_sites() -> list[dict[str, Any]]:
    """
    Return all sites.

    @return sites: List of site dicts.
    """
    with _sites_lock:
        return list(_sites.values())


def create_site(name: str, location: str, timezone_str: str) -> dict[str, Any]:
    """
    Create a new site with an auto-generated ID.

    @param name: Human-readable site name.
    @param location: Physical location description.
    @param timezone_str: IANA timezone string (e.g. 'America/New_York').

    @return site: The created site record.
    """
    site_id = f'site_{uuid.uuid4().hex[:8]}'
    # Derive a channel prefix from the name (lowercase, alphanumeric + hyphens)
    safe_name = ''.join(c if c.isalnum() else '-' for c in name).lower()
    safe_name = '-'.join(filter(None, safe_name.split('-')))
    channel_prefix = f'factory:{safe_name}' if safe_name else f'factory:{site_id}'

    site: dict[str, Any] = {
        'site_id': site_id,
        'name': name,
        'location': location,
        'timezone': timezone_str,
        'channel_prefix': channel_prefix,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }

    with _sites_lock:
        _sites[site_id] = site

    logger.info('Site created: %s (%s)', site_id, name)
    return dict(site)


def get_site(site_id: str) -> dict[str, Any] | None:
    """
    Get a site by ID.

    @param site_id: The site's unique ID.

    @return site: The site record, or None if not found.
    """
    with _sites_lock:
        site = _sites.get(site_id)
        return dict(site) if site else None


def update_site(
    site_id: str,
    name: str | None = None,
    location: str | None = None,
    timezone_str: str | None = None,
) -> dict[str, Any] | None:
    """
    Update fields on an existing site.

    @param site_id: The site's unique ID.
    @param name: New name (or None to keep).
    @param location: New location (or None to keep).
    @param timezone_str: New timezone (or None to keep).

    @return site: The updated site record, or None if not found.
    """
    with _sites_lock:
        site = _sites.get(site_id)
        if site is None:
            return None

        if name is not None:
            site['name'] = name
            # Update channel prefix to match new name
            safe_name = ''.join(c if c.isalnum() else '-' for c in name).lower()
            safe_name = '-'.join(filter(None, safe_name.split('-')))
            site['channel_prefix'] = f'factory:{safe_name}' if safe_name else f'factory:{site_id}'

        if location is not None:
            site['location'] = location
        if timezone_str is not None:
            site['timezone'] = timezone_str

        site['updated_at'] = datetime.now(timezone.utc).isoformat()
        return dict(site)


def delete_site(site_id: str) -> bool:
    """
    Delete a site. The default site cannot be deleted.

    @param site_id: The site's unique ID.

    @return ok: True if the site was deleted, False if not found or default.
    """
    with _sites_lock:
        if site_id not in _sites:
            return False
        if site_id == 'site_default':
            logger.warning('Attempted to delete the default site — denied.')
            return False
        del _sites[site_id]
        logger.info('Site deleted: %s', site_id)
        return True


def get_active_site() -> dict[str, Any]:
    """
    Return the currently active site. Falls back to default if none is set.

    @return site: The active site record.
    """
    with _sites_lock:
        if _active_site_id and _active_site_id in _sites:
            return dict(_sites[_active_site_id])
        # Fallback to default
        default = _sites.get('site_default')
        if default:
            return dict(default)
        # Recreate default if something went wrong
        return dict(_create_default_site())


def switch_active_site(site_id: str) -> dict[str, Any] | None:
    """
    Switch the active site. Returns the new active site or None if not found.

    @param site_id: The site ID to switch to.

    @return site: The new active site record, or None if not found.
    """
    global _active_site_id  # noqa: PLW0603
    with _sites_lock:
        if site_id not in _sites:
            return None
        _active_site_id = site_id
        site = dict(_sites[site_id])
    logger.info('Active site switched to: %s (%s)', site_id, site['name'])
    return site


def get_channel_prefix(site_id: str | None = None) -> str:
    """
    Return the Redis channel prefix for the given site (or active site).

    @param site_id: Optional site ID. If None, uses the active site.

    @return prefix: The channel prefix string.
    """
    if site_id is not None:
        site = get_site(site_id)
        if site:
            return site['channel_prefix']
    # Fallback to active site
    active = get_active_site()
    return active['channel_prefix']


# ── Bootstrap: create default site on module load ───────────────────────────

_create_default_site()
logger.info('Default site created: Main Factory')
