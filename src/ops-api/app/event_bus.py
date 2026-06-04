"""
@author: AI Orchestrator
@date: 04-Jun-2026

@description: Event bus for ops-api. Publishes events to Redis pub/sub
channels when telemetry, alerts, or robot status changes occur.
The integration-service consumes these to trigger event-based syncs.
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

REDIS_URL: str = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
EVENT_CHANNEL: str = 'events:ops-api'

_pub: aioredis.Redis | None = None


async def get_publisher() -> aioredis.Redis:
    """Lazy-init Redis publisher connection."""
    global _pub
    if _pub is None:
        _pub = aioredis.from_url(REDIS_URL, decode_responses=True)
        logger.info('Event bus publisher connected to %s', REDIS_URL)
    return _pub


async def publish_event(
    event_type: str,
    payload: dict[str, Any],
    tenant_id: int,
    factory_id: int | None = None,
):
    """
    Publish an event to the Redis pub/sub channel.

    @param event_type: e.g. 'alert.raised', 'telemetry.updated', 'robot.status_changed'
    @param payload: The event data dict (must be JSON-serializable).
    @param tenant_id: The tenant that owns this event.
    @param factory_id: Optional factory scope.
    """
    try:
        pub = await get_publisher()
        event = {
            'event_type': event_type,
            'payload': payload,
            'tenant_id': tenant_id,
            'factory_id': factory_id,
            'timestamp': datetime.now(timezone.utc).isoformat(),
        }
        await pub.publish(EVENT_CHANNEL, json.dumps(event))
        logger.debug('Event published: %s (tenant=%d)', event_type, tenant_id)
    except Exception as exc:
        logger.error('Failed to publish event %s: %s', event_type, exc)


async def close_publisher():
    """Close the Redis publisher connection on shutdown."""
    global _pub
    if _pub:
        await _pub.close()
        _pub = None
        logger.info('Event bus publisher closed')
