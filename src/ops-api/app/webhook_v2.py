"""
@author: AI Orchestrator
@date: 04-Jun-2026

@description: Webhook v2 engine — delivery receipts, idempotency keys,
retry with dead-letter queue after 5 attempts.
Additive to existing webhook_engine.py (v1 still works).
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

DATA_DIR: str = os.getenv(
    'DATA_DIR',
    os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        'data',
    ),
)

# In-memory retry queue with dead-letter tracking
_retry_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
MAX_RETRIES: int = 5
BASE_DELAY_S: int = 1


async def dispatch_webhook_v2(
    webhook_id: int,
    url: str,
    event_type: str,
    payload: dict[str, Any],
    tenant_id: int,
    factory_id: int | None = None,
) -> None:
    """
    Dispatch a webhook with idempotency key and delivery tracking.

    Returns immediately; retries happen in the background via the retry queue
    processor.

    @param webhook_id: The webhook configuration ID.
    @param url: The target URL to POST to.
    @param event_type: The event type identifier (e.g. 'test.v2').
    @param payload: The JSON-serialisable payload to deliver.
    @param tenant_id: The tenant that owns this webhook.
    @param factory_id: Optional factory scope for the webhook.
    """
    delivery: dict[str, Any] = {
        'id': str(uuid.uuid4()),
        'webhook_id': webhook_id,
        'url': url,
        'event_type': event_type,
        'payload': payload,
        'tenant_id': tenant_id,
        'factory_id': factory_id,
        'idempotency_key': str(uuid.uuid4()),
        'attempts': 0,
        'max_retries': MAX_RETRIES,
        'created_at': datetime.now(timezone.utc).isoformat(),
    }
    await _retry_queue.put(delivery)


async def _process_retry_queue() -> None:
    """
    Background: process retry queue with exponential backoff.

    Delivers the webhook payload, records a receipt on success or failure,
    and moves to the dead-letter queue after MAX_RETRIES attempts.
    """
    while True:
        try:
            delivery: dict[str, Any] = await _retry_queue.get()
            delivery['attempts'] += 1

            headers: dict[str, str] = {
                'Content-Type': 'application/json',
                'X-Idempotency-Key': delivery['idempotency_key'],
                'X-Delivery-ID': delivery['id'],
            }

            async with httpx.AsyncClient(timeout=10) as client:
                try:
                    response = await client.post(
                        delivery['url'],
                        json={
                            'event_type': delivery['event_type'],
                            'payload': delivery['payload'],
                            'delivery_id': delivery['id'],
                            'idempotency_key': delivery['idempotency_key'],
                            'timestamp': datetime.now(timezone.utc).isoformat(),
                        },
                        headers=headers,
                    )
                    logger.info(
                        'Webhook v2 delivered: id=%s url=%s status=%d attempt=%d',
                        delivery['id'], delivery['url'],
                        response.status_code, delivery['attempts'],
                    )
                    # Record delivery receipt
                    await _record_receipt(delivery, response.status_code)

                except (httpx.RequestError, httpx.HTTPStatusError) as exc:
                    logger.warning(
                        'Webhook v2 attempt %d/%d failed: %s',
                        delivery['attempts'], delivery['max_retries'], exc,
                    )

                    if delivery['attempts'] < delivery['max_retries']:
                        # Exponential backoff: 1s, 2s, 4s, 8s, 16s
                        delay = BASE_DELAY_S * (2 ** (delivery['attempts'] - 1))
                        await asyncio.sleep(delay)
                        await _retry_queue.put(delivery)
                    else:
                        logger.error(
                            'Webhook v2 dead-letter: id=%s url=%s '
                            'after %d attempts',
                            delivery['id'], delivery['url'],
                            delivery['attempts'],
                        )
                        await _record_dead_letter(delivery)

        except Exception as exc:
            logger.error('Retry queue error: %s', exc)
        finally:
            _retry_queue.task_done()


async def _record_receipt(delivery: dict[str, Any], status_code: int) -> None:
    """
    Record a delivery receipt to a JSONL file.

    @param delivery: The delivery dictionary.
    @param status_code: The HTTP status code returned by the target.
    """
    receipt: dict[str, Any] = {
        'delivery_id': delivery['id'],
        'webhook_id': delivery['webhook_id'],
        'url': delivery['url'],
        'event_type': delivery['event_type'],
        'status_code': status_code,
        'attempt': delivery['attempts'],
        'success': status_code < 500,
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }
    _append_to_log('delivery_receipts.jsonl', receipt)


async def _record_dead_letter(delivery: dict[str, Any]) -> None:
    """
    Record a dead-lettered delivery to a JSONL file.

    @param delivery: The delivery dictionary that exhausted all retries.
    """
    record: dict[str, Any] = {
        'delivery_id': delivery['id'],
        'webhook_id': delivery['webhook_id'],
        'url': delivery['url'],
        'event_type': delivery['event_type'],
        'payload': delivery['payload'],
        'attempts': delivery['attempts'],
        'reason': 'Max retries exceeded',
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }
    _append_to_log('dead_letters.jsonl', record)


def _append_to_log(filename: str, record: dict[str, Any]) -> None:
    """
    Thread-safe append to a JSONL log file.

    Creates the data directory if it does not exist.

    @param filename: The name of the log file (e.g. 'delivery_receipts.jsonl').
    @param record: The dictionary to serialise as a JSON line.
    """
    os.makedirs(DATA_DIR, exist_ok=True)
    filepath: str = os.path.join(DATA_DIR, filename)
    try:
        with open(filepath, 'a') as f:
            f.write(json.dumps(record) + '\n')
    except IOError as exc:
        logger.error('Failed to write %s: %s', filename, exc)


def start_webhook_v2_engine() -> asyncio.Task:
    """
    Start the background retry queue processor.

    Call from the FastAPI lifespan. The returned task should be cancelled
    on shutdown.

    @return: The asyncio.Task for the retry queue processor.
    """
    loop = asyncio.get_event_loop()
    task = loop.create_task(_process_retry_queue())
    logger.info('Webhook v2 engine started')
    return task
