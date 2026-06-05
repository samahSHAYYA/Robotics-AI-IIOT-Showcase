"""
@author: generated
@date: 30-May-2026

@description: REST endpoints for webhook CRUD management.
"""

import logging

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import require_factory_access, require_role
from app.db import WebhookConfig, User, get_session
from app.webhook_engine import (
    create_webhook,
    delete_webhook,
    get_webhook,
    list_webhooks,
    trigger_webhooks,
    update_webhook,
)
from app.webhook_v2 import dispatch_webhook_v2

router: APIRouter = APIRouter(prefix='/api/v1/webhooks')
logger: logging.Logger = logging.getLogger(__name__)


class WebhookCreate(BaseModel):
    """Request body for creating a new webhook."""
    url: str
    trigger: str
    enabled: bool = True


class WebhookUpdate(BaseModel):
    """Request body for updating an existing webhook."""
    url: str | None = None
    trigger: str | None = None
    enabled: bool | None = None


class WebhookTestPayload(BaseModel):
    """Optional custom payload for testing a webhook."""
    payload: dict[str, Any] = {}


@router.get('')
async def get_webhooks(
    user: User = Depends(require_role('factory_admin')),
    _=Depends(require_factory_access()),
):
    """
    Returns all configured webhooks.

    @return response: Dict with webhooks list.
    """
    return {'webhooks': list_webhooks()}


@router.post('', status_code=201)
async def create_webhook_endpoint(
    body: WebhookCreate,
    user: User = Depends(require_role('factory_admin')),
    _=Depends(require_factory_access()),
):
    """
    Creates a new webhook.

    @param body: Webhook configuration.

    @return webhook: The created webhook object.
    """
    wh = await create_webhook(url=body.url, trigger=body.trigger,
                              enabled=body.enabled)
    return wh


@router.put('/{webhook_id}')
async def update_webhook_endpoint(
    webhook_id: str, body: WebhookUpdate,
    user: User = Depends(require_role('factory_admin')),
    _=Depends(require_factory_access()),
):
    """
    Updates an existing webhook.

    @param webhook_id: ID of the webhook to update.
    @param body: Fields to update.

    @return webhook: The updated webhook object.

    @raises HTTPException 404: Webhook not found.
    """
    wh = await update_webhook(
        webhook_id=webhook_id,
        url=body.url,
        trigger=body.trigger,
        enabled=body.enabled,
    )
    if wh is None:
        raise HTTPException(status_code=404, detail='Webhook not found')
    return wh


@router.delete('/{webhook_id}')
async def delete_webhook_endpoint(
    webhook_id: str,
    user: User = Depends(require_role('factory_admin')),
    _=Depends(require_factory_access()),
):
    """
    Deletes a webhook.

    @param webhook_id: ID of the webhook to delete.

    @return response: Confirmation dict.

    @raises HTTPException 404: Webhook not found.
    """
    ok = await delete_webhook(webhook_id)
    if not ok:
        raise HTTPException(status_code=404, detail='Webhook not found')
    return {'status': 'deleted', 'id': webhook_id}


@router.post('/{webhook_id}/test')
async def test_webhook(
    webhook_id: str, body: WebhookTestPayload,
    user: User = Depends(require_role('factory_admin')),
    _=Depends(require_factory_access()),
):
    """
    Sends a test payload to the specified webhook.

    @param webhook_id: ID of the webhook to test.
    @param body: Optional custom payload.

    @return response: Confirmation dict.

    @raises HTTPException 404: Webhook not found.
    """
    wh = get_webhook(webhook_id)
    if wh is None:
        raise HTTPException(status_code=404, detail='Webhook not found')
    test_payload = body.payload or {'test': True, 'webhook_id': webhook_id}
    await trigger_webhooks(wh['trigger'], test_payload)
    return {'status': 'test_sent', 'webhook_id': webhook_id}


@router.post('/{webhook_id}/test-v2')
async def test_webhook_v2(
    webhook_id: int,
    user: User = Depends(require_role('factory_admin')),
    _session: AsyncSession = Depends(get_session),
):
    """
    Test a webhook using the v2 delivery system.

    Looks up the webhook from the database (scoped to the user's factory),
    then dispatches a 'test.v2' event via the v2 webhook engine with
    idempotency key, delivery receipt tracking, and dead-letter queue.

    @param webhook_id: The webhook configuration ID.
    @param user: Authenticated factory_admin user.
    @param _session: Async DB session.
    @return: Confirmation that the test was queued.
    @raises HTTPException 404: If the webhook is not found in the user's factory.
    """
    result = await _session.execute(
        select(WebhookConfig).where(
            WebhookConfig.id == webhook_id,
            WebhookConfig.factory_id == user.factory_id,
        ),
    )
    webhook = result.scalar_one_or_none()
    if not webhook:
        raise HTTPException(status_code=404, detail='Webhook not found')

    await dispatch_webhook_v2(
        webhook_id=webhook.id,
        url=webhook.url,
        event_type='test.v2',
        payload={
            'test': True,
            'timestamp': datetime.now(timezone.utc).isoformat(),
        },
        tenant_id=user.tenant_id,
        factory_id=user.factory_id,
    )
    return {'status': 'queued', 'message': 'Webhook v2 test dispatched'}
