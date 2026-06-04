"""
@author: Samah SHAYYA
@date: 04-Jun-2026

@description: REST endpoints for managing external system integrations — CRUD
operations, connection testing, sync log history, adapter type discovery,
and event-triggered sync. All endpoints are tenant-scoped via JWT authentication.
"""

import logging

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.base import BaseAdapter
from app.adapters.registry import get_adapter, list_adapters
from app.db import get_session
from app.deps import get_current_user
from app.models import Integration, SyncLog
from app.schemas import (
    AdapterListResponse,
    IntegrationCreate,
    IntegrationResponse,
    IntegrationUpdate,
    SyncLogPage,
    SyncLogResponse,
    TestConnectionResult,
    TriggerEvent,
    TriggerResult,
)
from app.sync_engine import trigger_integration

router: APIRouter = APIRouter(prefix='/api/v1')
logger: logging.Logger = logging.getLogger(__name__)


def _get_tenant_id(user: dict[str, Any]) -> int:
    """
    Extract tenant_id from the authenticated user's JWT payload.

    @param user: The JWT payload dict.
    @return: The tenant_id integer.
    @raises HTTPException 403: If the user has no tenant_id.
    """
    tenant_id: int | None = user.get('tenant_id')
    if tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='User has no tenant association.',
        )
    return tenant_id


@router.get('/integrations', response_model=list[IntegrationResponse])
async def list_integrations(
    user: dict[str, Any] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    List all integrations for the authenticated user's tenant.

    @param user: Authenticated user JWT payload.
    @param session: Async DB session.
    @return: A list of Integration records scoped to the tenant.
    """
    tenant_id: int = _get_tenant_id(user)
    result = await session.execute(
        select(Integration).where(Integration.tenant_id == tenant_id)
        .order_by(Integration.created_at.desc()),
    )
    return result.scalars().all()


@router.post(
    '/integrations',
    response_model=IntegrationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_integration(
    payload: IntegrationCreate,
    user: dict[str, Any] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Create a new integration configuration for the authenticated user's tenant.

    @param payload: The integration creation data.
    @param user: Authenticated user JWT payload.
    @param session: Async DB session.
    @return: The newly created Integration record.
    """
    tenant_id: int = _get_tenant_id(user)
    integration: Integration = Integration(
        tenant_id=tenant_id,
        name=payload.name,
        adapter_type=payload.adapter_type,
        base_url=payload.base_url,
        auth_type=payload.auth_type,
        auth_config=payload.auth_config,
        sync_interval_minutes=payload.sync_interval_minutes,
        enabled=payload.enabled,
        trigger_on_event=payload.trigger_on_event,
        event_types=payload.event_types,
    )
    session.add(integration)
    await session.commit()
    await session.refresh(integration)
    logger.info(
        'Integration created: id=%d tenant=%d name=%s',
        integration.id, tenant_id, integration.name,
    )
    return integration


@router.get('/integrations/{integration_id}', response_model=IntegrationResponse)
async def get_integration(
    integration_id: int,
    user: dict[str, Any] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Get details of a specific integration by ID (tenant-scoped).

    @param integration_id: The integration record ID.
    @param user: Authenticated user JWT payload.
    @param session: Async DB session.
    @return: The matching Integration record.
    @raises HTTPException 404: If not found or not in the user's tenant.
    """
    tenant_id: int = _get_tenant_id(user)
    result = await session.execute(
        select(Integration).where(
            Integration.id == integration_id,
            Integration.tenant_id == tenant_id,
        ),
    )
    integration: Integration | None = result.scalar_one_or_none()
    if integration is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Integration not found.',
        )
    return integration


@router.put('/integrations/{integration_id}', response_model=IntegrationResponse)
async def update_integration(
    integration_id: int,
    payload: IntegrationUpdate,
    user: dict[str, Any] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Update an existing integration configuration (tenant-scoped).

    Only provided fields are updated; omitted fields remain unchanged.

    @param integration_id: The integration record ID.
    @param payload: The fields to update.
    @param user: Authenticated user JWT payload.
    @param session: Async DB session.
    @return: The updated Integration record.
    @raises HTTPException 404: If not found.
    """
    tenant_id: int = _get_tenant_id(user)
    result = await session.execute(
        select(Integration).where(
            Integration.id == integration_id,
            Integration.tenant_id == tenant_id,
        ),
    )
    integration: Integration | None = result.scalar_one_or_none()
    if integration is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Integration not found.',
        )

    update_data: dict[str, Any] = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(integration, field, value)

    integration.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(integration)
    logger.info(
        'Integration updated: id=%d tenant=%d', integration.id, tenant_id,
    )
    return integration


@router.delete('/integrations/{integration_id}', status_code=status.HTTP_204_NO_CONTENT)
async def delete_integration(
    integration_id: int,
    user: dict[str, Any] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Delete an integration configuration (tenant-scoped).

    Also removes associated sync log entries.

    @param integration_id: The integration record ID.
    @param user: Authenticated user JWT payload.
    @param session: Async DB session.
    @raises HTTPException 404: If not found.
    """
    tenant_id: int = _get_tenant_id(user)
    result = await session.execute(
        select(Integration).where(
            Integration.id == integration_id,
            Integration.tenant_id == tenant_id,
        ),
    )
    integration: Integration | None = result.scalar_one_or_none()
    if integration is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Integration not found.',
        )

    # Remove associated sync logs first
    await session.execute(
        delete(SyncLog).where(SyncLog.integration_id == integration_id),
    )
    await session.delete(integration)
    await session.commit()
    logger.info(
        'Integration deleted: id=%d tenant=%d', integration_id, tenant_id,
    )


@router.post(
    '/integrations/{integration_id}/test',
    response_model=TestConnectionResult,
)
async def test_integration_connection(
    integration_id: int,
    user: dict[str, Any] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Test the connection to an external system using the integration's adapter.

    Loads the adapter class from the registry, builds the config from the
    integration record, and calls test_connection.

    @param integration_id: The integration record ID.
    @param user: Authenticated user JWT payload.
    @param session: Async DB session.
    @return: A result indicating success or failure with a descriptive message.
    """
    tenant_id: int = _get_tenant_id(user)
    result = await session.execute(
        select(Integration).where(
            Integration.id == integration_id,
            Integration.tenant_id == tenant_id,
        ),
    )
    integration: Integration | None = result.scalar_one_or_none()
    if integration is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Integration not found.',
        )

    try:
        adapter_cls: type[BaseAdapter] = get_adapter(integration.adapter_type)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    adapter: BaseAdapter = adapter_cls()
    config: dict[str, Any] = {
        'base_url': integration.base_url,
        'auth': integration.auth_config,
    }

    try:
        success: bool = await adapter.test_connection(config)
        message: str = 'Connection successful.' if success else 'Connection failed.'
        return TestConnectionResult(success=success, message=message)
    except Exception as exc:
        logger.error('Connection test failed for integration %d: %s', integration_id, exc)
        return TestConnectionResult(
            success=False,
            message=f'Connection error: {exc}',
        )


@router.get('/integrations/{integration_id}/sync-log', response_model=SyncLogPage)
async def get_sync_log(
    integration_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: dict[str, Any] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Retrieve paginated sync log history for a specific integration.

    @param integration_id: The integration record ID.
    @param page: Page number (1-indexed).
    @param page_size: Number of records per page (max 100).
    @param user: Authenticated user JWT payload.
    @param session: Async DB session.
    @return: A page of SyncLog records with total count.
    @raises HTTPException 404: If the integration is not found in the tenant.
    """
    tenant_id: int = _get_tenant_id(user)

    # Verify the integration belongs to the user's tenant
    result = await session.execute(
        select(Integration).where(
            Integration.id == integration_id,
            Integration.tenant_id == tenant_id,
        ),
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Integration not found.',
        )

    # Count total records
    count_result = await session.execute(
        select(func.count()).where(SyncLog.integration_id == integration_id),
    )
    total: int = count_result.scalar() or 0

    # Fetch paginated results
    offset: int = (page - 1) * page_size
    items_result = await session.execute(
        select(SyncLog)
        .where(SyncLog.integration_id == integration_id)
        .order_by(SyncLog.started_at.desc())
        .offset(offset)
        .limit(page_size),
    )
    items = items_result.scalars().all()

    return SyncLogPage(
        items=[SyncLogResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get('/adapters', response_model=AdapterListResponse)
async def get_adapters():
    """
    List all available adapter types registered in the system.

    @return: A list of adapter type names (e.g. 'rest').
    """
    return AdapterListResponse(adapters=list_adapters())


@router.post(
    '/integrations/{integration_id}/trigger',
    response_model=TriggerResult,
)
async def trigger_sync(
    integration_id: int,
    event: TriggerEvent = TriggerEvent(),
    user: dict[str, Any] = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Trigger an immediate sync for a specific integration.

    Useful for event-based triggering when an external system signals
    that new data is available. The integration's adapter will be called
    immediately, outside the normal polling schedule.

    @param integration_id: The integration record ID.
    @param event: Optional event metadata (event_type, payload).
    @param user: Authenticated user JWT payload.
    @param session: Async DB session.
    @return: Result with status and message.
    @raises HTTPException 404: If the integration is not found in the tenant.
    """
    tenant_id: int = _get_tenant_id(user)
    result = await session.execute(
        select(Integration).where(
            Integration.id == integration_id,
            Integration.tenant_id == tenant_id,
        ),
    )
    integration: Integration | None = result.scalar_one_or_none()
    if integration is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Integration not found.',
        )

    logger.info(
        'Triggering sync for integration %d (event=%s, tenant=%d)',
        integration_id, event.event_type, tenant_id,
    )

    try:
        result_data = await trigger_integration(integration_id)
        return TriggerResult(
            status=result_data.get('status', 'triggered'),
            integration_id=integration_id,
            message=f'Sync triggered by event "{event.event_type}" — status: {result_data.get("status", "unknown")}',
        )
    except Exception as exc:
        logger.error('Trigger sync failed for integration %d: %s', integration_id, exc)
        return TriggerResult(
            status='error',
            integration_id=integration_id,
            message=f'Trigger failed: {exc}',
        )
