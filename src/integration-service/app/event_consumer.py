"""
@author: AI Orchestrator
@date: 04-Jun-2026

@description: Redis pub/sub event consumer for the integration service.
Listens on events:ops-api channel and triggers matching integrations
based on their trigger_on_event and event_types configuration.
"""

import asyncio
import json
import logging
import os
from typing import Any

import redis.asyncio as aioredis
from sqlalchemy import select

from app.db import async_session_factory
from app.models import Integration
from app.sync_engine import trigger_integration

logger = logging.getLogger(__name__)

REDIS_URL: str = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
EVENT_CHANNEL: str = 'events:ops-api'


async def handle_event(event_data: dict[str, Any]):
    """
    Process a single event from ops-api and trigger matching integrations.

    @param event_data: The event dict with event_type, payload, tenant_id, etc.
    """
    event_type = event_data.get('event_type', '')
    tenant_id = event_data.get('tenant_id')
    if not event_type or not tenant_id:
        logger.warning('Received malformed event: %s', event_data)
        return

    logger.debug('Processing event: %s (tenant=%d)', event_type, tenant_id)

    try:
        async with async_session_factory() as session:
            result = await session.execute(
                select(Integration).where(
                    Integration.tenant_id == tenant_id,
                    Integration.enabled == True,  # noqa: E712
                    Integration.trigger_on_event == True,  # noqa: E712
                ),
            )
            integrations = result.scalars().all()

        for integration in integrations:
            # Check if this integration's event_types match
            event_types = integration.event_types or []
            if not event_types or event_type in event_types:
                logger.info(
                    'Event %s triggered sync for integration %d',
                    event_type, integration.id,
                )
                asyncio.create_task(trigger_integration(integration.id))

    except Exception as exc:
        logger.error('Event handler error: %s', exc)


async def event_consumer_loop():
    """
    Background loop: subscribe to events:ops-api Redis channel and
    process events.
    """
    while True:
        try:
            pubsub = aioredis.from_url(REDIS_URL, decode_responses=True).pubsub()
            await pubsub.subscribe(EVENT_CHANNEL)
            logger.info('Event consumer subscribed to %s', EVENT_CHANNEL)

            async for message in pubsub.listen():
                if message['type'] != 'message':
                    continue
                try:
                    event_data = json.loads(message['data'])
                    asyncio.create_task(handle_event(event_data))
                except (json.JSONDecodeError, KeyError) as exc:
                    logger.warning('Failed to parse event message: %s', exc)

        except asyncio.CancelledError:
            logger.info('Event consumer cancelled')
            break
        except Exception as exc:
            logger.error('Event consumer error: %s — reconnecting in 5s', exc)
            await asyncio.sleep(5)


def start_event_consumer() -> asyncio.Task:
    """
    Start the background event consumer. Call from the FastAPI lifespan.

    @return: The asyncio.Task for the consumer loop.
    """
    loop = asyncio.get_event_loop()
    task = loop.create_task(event_consumer_loop())
    logger.info('Event consumer started')
    return task
