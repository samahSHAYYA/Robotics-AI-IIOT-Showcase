"""
@author: Samah SHAYYA
@date: 03-Jun-2026

@description: Webhook engine for ops-api backed by PostgreSQL.
Manages webhook configurations (stored in WebhookConfig table, cached in memory)
and dispatches HTTP POST notifications to registered endpoints asynchronously
with exponential backoff retry.
"""

import asyncio
import logging
import threading

from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select, delete as sa_delete

from app.db import WebhookConfig, async_session_factory

logger: logging.Logger = logging.getLogger(__name__)

# In-memory cache: factory_id -> list of webhook dicts
_webhooks_cache: dict[int, list[dict[str, Any]]] = {}
_webhooks_cache_lock: threading.Lock = threading.Lock()
_cache_loaded: bool = False


async def _load_webhooks_from_db():
    """Load all webhooks from DB into the in-memory cache."""
    global _cache_loaded  # noqa: PLW0603
    async with async_session_factory() as session:
        result = await session.execute(
            select(WebhookConfig).order_by(WebhookConfig.id)
        )
        webhooks = result.scalars().all()

    with _webhooks_cache_lock:
        _webhooks_cache.clear()
        for wh in webhooks:
            fid = wh.factory_id
            if fid not in _webhooks_cache:
                _webhooks_cache[fid] = []
            _webhooks_cache[fid].append({
                'id': str(wh.id),
                'factory_id': wh.factory_id,
                'url': wh.url,
                'trigger': wh.trigger,
                'enabled': wh.enabled,
                'created_at': wh.created_at.isoformat() if wh.created_at else '',
                'updated_at': wh.updated_at.isoformat() if wh.updated_at else '',
            })
        _cache_loaded = True

    logger.info('Loaded %d webhook(s) from DB', sum(len(v) for v in _webhooks_cache.values()))


async def ensure_cache_loaded():
    """Ensure the webhook cache is loaded (called on startup)."""
    if not _cache_loaded:
        await _load_webhooks_from_db()


def _get_webhooks(factory_id: int = 1) -> list[dict[str, Any]]:
    """Get webhooks from cache for a given factory."""
    with _webhooks_cache_lock:
        return list(_webhooks_cache.get(factory_id, []))


def list_webhooks(factory_id: int = 1) -> list[dict[str, Any]]:
    """Returns all configured webhooks for a factory from cache."""
    return _get_webhooks(factory_id)


def get_webhook(webhook_id: str, factory_id: int = 1) -> dict[str, Any] | None:
    """Returns a webhook by ID from cache, or None if not found."""
    for wh in _get_webhooks(factory_id):
        if wh['id'] == webhook_id:
            return dict(wh)
    # Search all factories
    with _webhooks_cache_lock:
        for fid, hooks in _webhooks_cache.items():
            for wh in hooks:
                if wh['id'] == webhook_id:
                    return dict(wh)
    return None


async def create_webhook(
    url: str,
    trigger: str,
    enabled: bool = True,
    factory_id: int = 1,
) -> dict[str, Any]:
    """
    Creates a new webhook in DB and updates the cache.

    @param url: Target URL for the webhook POST.
    @param trigger: Event type that triggers this webhook.
    @param enabled: Whether the webhook is active.
    @param factory_id: Factory context.

    @return webhook: The created webhook dict.
    """
    async with async_session_factory() as session:
        wh = WebhookConfig(
            factory_id=factory_id,
            url=url,
            trigger=trigger,
            enabled=enabled,
        )
        session.add(wh)
        await session.commit()
        await session.refresh(wh)

        wh_dict = {
            'id': str(wh.id),
            'factory_id': wh.factory_id,
            'url': wh.url,
            'trigger': wh.trigger,
            'enabled': wh.enabled,
            'created_at': wh.created_at.isoformat() if wh.created_at else '',
            'updated_at': wh.updated_at.isoformat() if wh.updated_at else '',
        }

    # Update cache
    with _webhooks_cache_lock:
        if factory_id not in _webhooks_cache:
            _webhooks_cache[factory_id] = []
        _webhooks_cache[factory_id].append(wh_dict)

    logger.info('Webhook created: id=%s trigger=%s url=%s (factory=%d)',
                wh_dict['id'], trigger, url, factory_id)
    return wh_dict


async def update_webhook(
    webhook_id: str,
    url: str | None = None,
    trigger: str | None = None,
    enabled: bool | None = None,
    factory_id: int = 1,
) -> dict[str, Any] | None:
    """
    Updates an existing webhook in DB and cache.

    @param webhook_id: ID of the webhook to update.
    @param url: New target URL (None to keep unchanged).
    @param trigger: New trigger type (None to keep unchanged).
    @param enabled: New enabled state (None to keep unchanged).
    @param factory_id: Factory context.

    @return webhook: The updated webhook dict, or None if not found.
    """
    async with async_session_factory() as session:
        result = await session.execute(
            select(WebhookConfig).where(WebhookConfig.id == int(webhook_id))
        )
        wh = result.scalar_one_or_none()
        if wh is None:
            return None

        if url is not None:
            wh.url = url
        if trigger is not None:
            wh.trigger = trigger
        if enabled is not None:
            wh.enabled = enabled
        wh.updated_at = datetime.now(timezone.utc)

        await session.commit()
        await session.refresh(wh)

        wh_dict = {
            'id': str(wh.id),
            'factory_id': wh.factory_id,
            'url': wh.url,
            'trigger': wh.trigger,
            'enabled': wh.enabled,
            'created_at': wh.created_at.isoformat() if wh.created_at else '',
            'updated_at': wh.updated_at.isoformat() if wh.updated_at else '',
        }

    # Update cache
    with _webhooks_cache_lock:
        for fid in list(_webhooks_cache.keys()):
            for i, cached in enumerate(_webhooks_cache[fid]):
                if cached['id'] == webhook_id:
                    _webhooks_cache[fid][i] = wh_dict
                    break

    logger.info('Webhook updated: id=%s', webhook_id)
    return wh_dict


async def delete_webhook(webhook_id: str, factory_id: int = 1) -> bool:
    """
    Deletes a webhook from DB and cache.

    @param webhook_id: ID of the webhook to delete.
    @param factory_id: Factory context.

    @return ok: True if deleted, False if not found.
    """
    async with async_session_factory() as session:
        result = await session.execute(
            select(WebhookConfig).where(WebhookConfig.id == int(webhook_id))
        )
        wh = result.scalar_one_or_none()
        if wh is None:
            return False
        await session.delete(wh)
        await session.commit()

    # Remove from cache
    with _webhooks_cache_lock:
        for fid in list(_webhooks_cache.keys()):
            _webhooks_cache[fid] = [
                w for w in _webhooks_cache[fid]
                if w['id'] != webhook_id
            ]

    logger.info('Webhook deleted: id=%s', webhook_id)
    return True


async def trigger_webhooks(event_type: str, payload: dict[str, Any]):
    """
    Dispatches an event to all enabled webhooks matching the trigger type.

    Implements retry with exponential backoff: 1s, 2s, 4s (3 attempts).

    @param event_type: The trigger event type (e.g., 'robot.start',
                       'alert.critical').
    @param payload: JSON-serializable dict to send as the request body.
    """
    # Search all factories' webhooks for matching triggers
    matching = []
    with _webhooks_cache_lock:
        for fid, hooks in _webhooks_cache.items():
            for wh in hooks:
                if wh['enabled'] and wh['trigger'] == event_type:
                    matching.append(wh)

    if not matching:
        return

    logger.info('Triggering %d webhook(s) for event_type=%s',
                len(matching), event_type)

    async with httpx.AsyncClient(timeout=10.0) as client:
        for wh in matching:
            for attempt in range(3):
                try:
                    response = await client.post(
                        wh['url'],
                        json={
                            'event_type': event_type,
                            'payload': payload,
                            'timestamp': datetime.now(timezone.utc).isoformat(),
                        },
                    )
                    logger.info(
                        'Webhook %s -> %s status=%d (attempt %d)',
                        wh['id'], wh['url'], response.status_code,
                        attempt + 1,
                    )
                    break  # success, exit retry loop
                except (httpx.RequestError, httpx.HTTPStatusError) as exc:
                    wait = 2 ** attempt  # 1, 2, 4 seconds
                    logger.warning(
                        'Webhook %s attempt %d failed: %s. Retrying in %ds ...',
                        wh['id'], attempt + 1, exc, wait,
                    )
                    if attempt < 2:
                        await asyncio.sleep(wait)
                    else:
                        logger.error(
                            'Webhook %s failed after 3 attempts: %s',
                            wh['id'], exc,
                        )
