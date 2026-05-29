"""
@author: Samah SHAYYA
@date: 28-May-2026

@description: Redis Stream consumer for ops-api.
Reads from events:core-platform and events:ai-service, updating the in-memory
telemetry store.
"""

import asyncio
import logging

import redis.asyncio as aioredis

from app.store import store

STREAMS: list[str] = ['events:core-platform', 'events:ai-service']
GROUP_NAME: str = 'ops-api-group'
CONSUMER_NAME: str = 'ops-api-1'
POLL_BLOCK_MS: int = 5000
BATCH_SIZE: int = 10

logger: logging.Logger = logging.getLogger(__name__)


async def ensure_groups(r: aioredis.Redis):
    """
    Creates consumer groups for all input streams if they do not exist.

    @param r: Redis async connection.
    """

    for stream in STREAMS:
        try:
            await r.xgroup_create(stream, GROUP_NAME, id = '0', mkstream = True)
        except aioredis.ResponseError:
            pass


async def process_message(msg_data: dict[str, str]):
    """
    Routes a stream message to the appropriate store update logic.

    @param msg_data: Decoded Redis stream message fields.
    """

    event_type: str = msg_data.get('event_type', '')

    if event_type.startswith('sensor.') or event_type.startswith('camera.') or event_type.startswith('safety.'):
        store.update_from_sensor_event(msg_data)
        logger.debug('Stored sensor event: %s', event_type)
    elif event_type.startswith('ml.'):
        store.update_from_prediction(msg_data)
        logger.debug('Stored prediction: %s', event_type)


async def run_consumer(redis_url: str):
    """
    Continuously polls all input streams and updates the telemetry store.

    @param redis_url: Redis connection URL.
    """

    r: aioredis.Redis = aioredis.from_url(redis_url, decode_responses = True)

    await ensure_groups(r)

    logger.info('Consumer listening on streams=%s', STREAMS)

    while True:
        try:
            stream_map: dict[str, str] = {s: '>' for s in STREAMS}

            results = await r.xreadgroup(
                GROUP_NAME,
                CONSUMER_NAME,
                stream_map,
                count = BATCH_SIZE,
                block = POLL_BLOCK_MS,
            )

            if not results:
                continue

            for stream_name, messages in results:
                for msg_id, msg_data in messages:
                    process_message(msg_data)
                    await r.xack(stream_name, GROUP_NAME, msg_id)

        except asyncio.CancelledError:
            logger.info('Consumer cancelled.')
            break
        except Exception:
            logger.exception('Consumer error, retrying in 1s ...')
            await asyncio.sleep(1)
