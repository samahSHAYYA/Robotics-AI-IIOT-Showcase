"""
@author: generated
@date: 30-May-2026

@description: Webhook engine for ops-api. Manages webhook configurations
and dispatches HTTP POST notifications to registered endpoints asynchronously
with exponential backoff retry.
"""

import asyncio
import json
import logging
import os
import uuid

from datetime import datetime, timezone
from typing import Any

import httpx

logger: logging.Logger = logging.getLogger(__name__)

DATA_DIR: str = os.getenv('DATA_DIR',
                          os.path.join(os.path.dirname(
                              os.path.dirname(os.path.dirname(__file__))),
                              'data'))
WEBHOOKS_FILE: str = os.path.join(DATA_DIR, 'webhooks.json')

_webhooks: dict[str, dict[str, Any]] = {}


def _ensure_data_dir():
    """Creates the data directory if it does not exist."""
    os.makedirs(DATA_DIR, exist_ok=True)


def _load_webhooks():
    """Loads webhooks from the JSON file on disk into memory."""
    global _webhooks
    _ensure_data_dir()
    if os.path.exists(WEBHOOKS_FILE):
        try:
            with open(WEBHOOKS_FILE, 'r') as f:
                data = json.load(f)
                _webhooks = {wh['id']: wh for wh in data}
        except (json.JSONDecodeError, IOError) as exc:
            logger.warning('Failed to load webhooks file: %s', exc)
            _webhooks = {}
    else:
        _webhooks = {}


def _save_webhooks():
    """Persists the in-memory webhooks dict to the JSON file on disk."""
    _ensure_data_dir()
    try:
        with open(WEBHOOKS_FILE, 'w') as f:
            json.dump(list(_webhooks.values()), f, indent=2)
    except IOError as exc:
        logger.error('Failed to save webhooks file: %s', exc)


def list_webhooks() -> list[dict[str, Any]]:
    """Returns all configured webhooks."""
    return list(_webhooks.values())


def get_webhook(webhook_id: str) -> dict[str, Any] | None:
    """Returns a webhook by ID, or None if not found."""
    return _webhooks.get(webhook_id)


def create_webhook(url: str, trigger: str, enabled: bool = True) -> dict[str, Any]:
    """
    Creates a new webhook and persists to disk.

    @param url: Target URL for the webhook POST.
    @param trigger: Event type that triggers this webhook.
    @param enabled: Whether the webhook is active.

    @return webhook: The created webhook dict.
    """

    webhook: dict[str, Any] = {
        'id': str(uuid.uuid4()),
        'url': url,
        'trigger': trigger,
        'enabled': enabled,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }
    _webhooks[webhook['id']] = webhook
    _save_webhooks()
    logger.info('Webhook created: id=%s trigger=%s url=%s',
                webhook['id'], trigger, url)
    return webhook


def update_webhook(
    webhook_id: str,
    url: str | None = None,
    trigger: str | None = None,
    enabled: bool | None = None,
) -> dict[str, Any] | None:
    """
    Updates an existing webhook and persists to disk.

    @param webhook_id: ID of the webhook to update.
    @param url: New target URL (None to keep unchanged).
    @param trigger: New trigger type (None to keep unchanged).
    @param enabled: New enabled state (None to keep unchanged).

    @return webhook: The updated webhook dict, or None if not found.
    """

    webhook = _webhooks.get(webhook_id)
    if webhook is None:
        return None
    if url is not None:
        webhook['url'] = url
    if trigger is not None:
        webhook['trigger'] = trigger
    if enabled is not None:
        webhook['enabled'] = enabled
    webhook['updated_at'] = datetime.now(timezone.utc).isoformat()
    _save_webhooks()
    logger.info('Webhook updated: id=%s', webhook_id)
    return webhook


def delete_webhook(webhook_id: str) -> bool:
    """
    Deletes a webhook by ID and persists to disk.

    @param webhook_id: ID of the webhook to delete.
    @return ok: True if deleted, False if not found.
    """

    if webhook_id in _webhooks:
        del _webhooks[webhook_id]
        _save_webhooks()
        logger.info('Webhook deleted: id=%s', webhook_id)
        return True
    return False


async def trigger_webhooks(event_type: str, payload: dict[str, Any]):
    """
    Dispatches an event to all enabled webhooks matching the trigger type.

    Implements retry with exponential backoff: 1s, 2s, 4s (3 attempts).

    @param event_type: The trigger event type (e.g., 'robot.start',
                       'alert.critical').
    @param payload: JSON-serializable dict to send as the request body.
    """

    matching = [
        wh for wh in _webhooks.values()
        if wh['enabled'] and wh['trigger'] == event_type
    ]

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


# Initialize: load webhooks from disk on module import
_load_webhooks()
