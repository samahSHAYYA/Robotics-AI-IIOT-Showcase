"""
@author: AI Orchestrator
@date: 04-Jun-2026

@description: Redis Streams event consumer for the integration service.
Reads from events:ops-api-stream using XREAD with blocking and tracks
the last-read message ID per consumer group for durable delivery.
"""

import asyncio
import json
import logging
import os
from typing import Any

import redis.asyncio as aioredis
from sqlalchemy import select

from app.db import async_session_factory
from app.metrics import EVENT_COUNTER
from app.models import Integration
from app.sync_engine import trigger_integration

logger = logging.getLogger(__name__)

REDIS_URL: str = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
EVENT_STREAM: str = 'events:ops-api-stream'
CONSUMER_GROUP: str = 'integration-service'
CONSUMER_NAME: str = 'worker-1'
BLOCK_MS: int = 5000  # Block for 5s if no new messages


async def handle_event(event_data: dict[str, Any]):
    """Process a single event and trigger matching integrations."""
    event_type = event_data.get('event_type', '')
    tenant_id = event_data.get('tenant_id')
    if not event_type or not tenant_id:
        logger.warning('Received malformed event: %s', event_data)
        return

    # Record Prometheus metric
    EVENT_COUNTER.labels(event_type=event_type).inc()

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
            event_types = integration.event_types or []
            if not event_types or event_type in event_types:
                logger.info(
                    'Event %s triggered sync for integration %d',
                    event_type, integration.id,
                )
                asyncio.create_task(trigger_integration(integration.id))

    except Exception as exc:
        logger.error('Event handler error: %s', exc)


async def _ensure_consumer_group(redis: aioredis.Redis):
    """Create the consumer group if it doesn't exist."""
    try:
        await redis.xgroup_create(EVENT_STREAM, CONSUMER_GROUP, id='0', mkstream=True)
        logger.info('Created consumer group %s on %s', CONSUMER_GROUP, EVENT_STREAM)
    except aioredis.ResponseError as exc:
        if 'BUSYGROUP' in str(exc):
            pass  # Group already exists
        else:
            logger.warning('Consumer group error: %s', exc)


async def event_consumer_loop():
    """Background loop: read from Redis Streams with XREADGROUP."""
    while True:
        try:
            redis = aioredis.from_url(REDIS_URL, decode_responses=True)
            await _ensure_consumer_group(redis)

            logger.info('Event consumer reading from %s (group=%s)',
                        EVENT_STREAM, CONSUMER_GROUP)

            while True:
                try:
                    # XREADGROUP returns {stream: [{id: fields}]}
                    result = await redis.xreadgroup(
                        CONSUMER_GROUP, CONSUMER_NAME,
                        {EVENT_STREAM: '>'},
                        count=10,
                        block=BLOCK_MS,
                    )
                    if result:
                        for stream_name, messages in result:
                            for msg_id, fields in messages:
                                event_data = {
                                    'event_type': fields.get('event_type', ''),
                                    'payload': fields.get('payload', '{}'),
                                    'tenant_id': fields.get('tenant_id', ''),
                                    'factory_id': fields.get('factory_id', ''),
                                    'timestamp': fields.get('timestamp', ''),
                                }
                                asyncio.create_task(handle_event(event_data))
                                # Acknowledge the message
                                await redis.xack(EVENT_STREAM, CONSUMER_GROUP, msg_id)

                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    logger.error('Stream read error: %s — reconnecting', exc)
                    await asyncio.sleep(2)
                    break

        except asyncio.CancelledError:
            logger.info('Event consumer cancelled')
            break
        except Exception as exc:
            logger.error('Event consumer error: %s — reconnecting in 5s', exc)
            await asyncio.sleep(5)


def start_event_consumer() -> asyncio.Task:
    """
    Start the background event consumer with Redis Streams.

    @return: The asyncio.Task for the consumer loop.
    """
    loop = asyncio.get_event_loop()
    task = loop.create_task(event_consumer_loop())
    logger.info('Event consumer started (Redis Streams)')
    return task
