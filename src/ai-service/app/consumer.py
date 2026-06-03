"""
@author: Samah SHAYYA
@date: 28-May-2026

@description: Redis Stream consumer for core-platform sensor events.
Reads from events:core-platform, runs mock inference, emits predictions.
"""

import asyncio
import logging
import uuid

from datetime import datetime, timezone
from typing import Any

import redis.asyncio as aioredis

from app.inference import run_mock_inference

STREAM_INPUT: str = 'events:core-platform'
STREAM_OUTPUT: str = 'events:ai-service'
GROUP_NAME: str = 'ai-service-group'
CONSUMER_NAME: str = 'ai-service-1'
POLL_BLOCK_MS: int = 5000
BATCH_SIZE: int = 10
MAXLEN: int = 1000

logger: logging.Logger = logging.getLogger(__name__)


async def ensure_group(r: aioredis.Redis):
    """
    Creates the consumer group if it does not already exist.

    @param r: Redis async connection.
    """

    try:
        await r.xgroup_create(STREAM_INPUT, GROUP_NAME, id = '0', mkstream = True)
    except aioredis.ResponseError:
        pass


async def process_message(msg_data: dict[str, str]) -> dict[str, Any] | None:
    """
    Runs mock inference on a single sensor event.

    @param msg_data: Decoded Redis stream message fields.

    @return prediction: Serialisable ML prediction dict, or None.
    """

    event_type: str = msg_data.get('event_type', '')

    ALLOWED_EVENT_TYPES: frozenset[str] = frozenset({'sensor.reading', 'camera.frame'})

    if event_type not in ALLOWED_EVENT_TYPES:
        return None

    logger.info('Inferring from event type=%s', event_type)

    prediction: dict[str, Any] = run_mock_inference(msg_data)

    prediction['trace_id'] = msg_data.get('trace_id', str(uuid.uuid4()))
    prediction['timestamp'] = datetime.now(timezone.utc).isoformat()
    prediction['source'] = 'ai-service'

    return prediction


async def run_consumer(redis_url: str):
    """
    Continuously polls the input Redis stream and emits predictions.

    @param redis_url: Redis connection URL.
    """

    r: aioredis.Redis = aioredis.from_url(redis_url, decode_responses = True)

    await ensure_group(r)

    logger.info('Consumer listening on stream=%s', STREAM_INPUT)

    while True:
        try:
            results = await r.xreadgroup(
                GROUP_NAME,
                CONSUMER_NAME,
                {STREAM_INPUT: '>'},
                count = BATCH_SIZE,
                block = POLL_BLOCK_MS,
            )

            if not results:
                continue

            for stream_name, messages in results:
                for msg_id, msg_data in messages:
                    prediction = await process_message(msg_data)

                    if prediction is not None:
                        await r.xadd(
                            STREAM_OUTPUT,
                            prediction,
                            maxlen = MAXLEN,
                        )

                        logger.info(
                            'Published prediction to %s (msg=%s)',
                            STREAM_OUTPUT,
                            msg_id,
                        )

                    await r.xack(STREAM_INPUT, GROUP_NAME, msg_id)

        except asyncio.CancelledError:
            logger.info('Consumer cancelled.')
            break
        except Exception:
            logger.exception('Consumer error, retrying in 1s ...')
            await asyncio.sleep(1)
