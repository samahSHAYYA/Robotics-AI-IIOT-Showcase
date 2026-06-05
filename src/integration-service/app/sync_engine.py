"""
@author: AI Orchestrator
@date: 04-Jun-2026

@description: Background sync engine that periodically executes
data synchronization for all enabled integrations using registered adapters.
Supports scheduled polling (per-integration sync_interval_minutes) and
event-triggered syncs via the trigger_integration() function.
"""

import asyncio
import logging

from datetime import datetime, timezone

from sqlalchemy import select

from app.adapters.registry import get_adapter
from app.db import async_session_factory
from app.metrics import SYNC_COUNTER, SYNC_DURATION
from app.models import Integration, SyncLog

logger: logging.Logger = logging.getLogger(__name__)
POLL_INTERVAL_S: int = 30  # Check every 30s for due integrations


async def sync_integration(integration_id: int) -> None:
    """
    Execute a single sync for one integration.

    Fetches the integration config, instantiates the appropriate adapter,
    retrieves data, records a SyncLog entry, and updates the integration's
    last_sync_at and last_sync_status fields.

    @param integration_id: The primary key of the Integration to sync.
    """
    async with async_session_factory() as session:
        try:
            result = await session.execute(
                select(Integration).where(Integration.id == integration_id),
            )
            integration = result.scalar_one_or_none()
            if not integration or not integration.enabled:
                return

            adapter_cls = get_adapter(integration.adapter_type)
            adapter = adapter_cls()

            config = {
                'base_url': integration.base_url,
                'endpoint': '/api/data',
                'auth': integration.auth_config,
            }

            started_at = datetime.now(timezone.utc)
            try:
                data = await adapter.fetch_data(config)
                records = len(data) if data else 0
                status = 'success'
                error_msg = None
            except Exception as exc:
                records = 0
                status = 'error'
                error_msg = str(exc)
                logger.error('Sync failed for integration %d: %s',
                             integration_id, exc)

            completed_at = datetime.now(timezone.utc)

            # Record sync log
            sync_log = SyncLog(
                integration_id=integration_id,
                status=status,
                records_synced=records,
                error_message=error_msg,
                started_at=started_at,
                completed_at=completed_at,
            )
            session.add(sync_log)

            # Update integration's last sync info
            integration.last_sync_at = completed_at
            integration.last_sync_status = status
            await session.commit()

            # Record Prometheus metrics
            SYNC_COUNTER.labels(
                integration_id=str(integration_id),
                status=status,
            ).inc()
            SYNC_DURATION.labels(
                integration_id=str(integration_id),
            ).observe(
                (completed_at - started_at).total_seconds(),
            )

            logger.info(
                'Sync %s for integration %d: %d records in %.1fs',
                status, integration_id, records,
                (completed_at - started_at).total_seconds(),
            )

        except Exception as exc:
            await session.rollback()
            logger.error('Sync engine error for integration %d: %s',
                         integration_id, exc)


async def trigger_integration(integration_id: int) -> dict:
    """
    Trigger an immediate sync for a specific integration by ID.

    Called by the event-trigger endpoint or by ops-api webhook events.
    Returns a summary dict with status and records count.

    @param integration_id: The primary key of the Integration to sync.
    @return: Dict with 'status' and 'records_synced' keys.
    """
    async with async_session_factory() as session:
        result = await session.execute(
            select(Integration).where(Integration.id == integration_id),
        )
        integration = result.scalar_one_or_none()
        if not integration:
            return {'status': 'not_found', 'records_synced': 0}
        if not integration.enabled:
            return {'status': 'disabled', 'records_synced': 0}

    # Run sync outside the first session to avoid stale object
    await sync_integration(integration_id)

    # Re-fetch to return the updated status
    async with async_session_factory() as session:
        result = await session.execute(
            select(Integration).where(Integration.id == integration_id),
        )
        integration = result.scalar_one_or_none()
        return {
            'status': integration.last_sync_status if integration else 'error',
            'records_synced': 0,
        }


async def sync_loop() -> None:
    """
    Background loop: every POLL_INTERVAL_S, check for due integrations.

    Integrations whose last_sync_at is None (never synced) are scheduled
    immediately. Others are scheduled when their sync_interval_minutes has
    elapsed since last_sync_at.
    """
    while True:
        try:
            async with async_session_factory() as session:
                result = await session.execute(
                    select(Integration).where(
                        Integration.enabled == True,  # noqa: E712
                    ),
                )
                integrations = result.scalars().all()

            now = datetime.now(timezone.utc)
            for integration in integrations:
                if not integration.last_sync_at:
                    # Never synced — due immediately
                    asyncio.create_task(sync_integration(integration.id))
                else:
                    elapsed = (now - integration.last_sync_at).total_seconds()
                    due_in = integration.sync_interval_minutes * 60
                    if elapsed >= due_in:
                        asyncio.create_task(
                            sync_integration(integration.id),
                        )

        except Exception as exc:
            logger.error('Sync loop error: %s', exc)

        await asyncio.sleep(POLL_INTERVAL_S)


def start_sync_engine() -> asyncio.Task:
    """
    Start the background sync engine. Call from the FastAPI lifespan.

    @return: The asyncio.Task for the sync loop, which should be cancelled
             on shutdown.
    """
    loop = asyncio.get_event_loop()
    task = loop.create_task(sync_loop())
    logger.info('Sync engine started (poll interval=%ds)', POLL_INTERVAL_S)
    return task
