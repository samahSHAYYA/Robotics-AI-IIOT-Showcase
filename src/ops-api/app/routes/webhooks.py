"""
@author: generated
@date: 30-May-2026

@description: REST endpoints for webhook CRUD management.
"""

import logging

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.deps import require_role
from app.db import User
from app.webhook_engine import (
    create_webhook,
    delete_webhook,
    get_webhook,
    list_webhooks,
    trigger_webhooks,
    update_webhook,
)

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
async def get_webhooks(user: User = Depends(require_role('admin'))):
    """
    Returns all configured webhooks.

    @return response: Dict with webhooks list.
    """
    return {'webhooks': list_webhooks()}


@router.post('', status_code=201)
async def create_webhook_endpoint(body: WebhookCreate,
                                  user: User = Depends(require_role('admin'))):
    """
    Creates a new webhook.

    @param body: Webhook configuration.

    @return webhook: The created webhook object.
    """
    wh = create_webhook(url=body.url, trigger=body.trigger,
                        enabled=body.enabled)
    return wh


@router.put('/{webhook_id}')
async def update_webhook_endpoint(webhook_id: str, body: WebhookUpdate,
                                  user: User = Depends(require_role('admin'))):
    """
    Updates an existing webhook.

    @param webhook_id: ID of the webhook to update.
    @param body: Fields to update.

    @return webhook: The updated webhook object.

    @raises HTTPException 404: Webhook not found.
    """
    wh = update_webhook(
        webhook_id=webhook_id,
        url=body.url,
        trigger=body.trigger,
        enabled=body.enabled,
    )
    if wh is None:
        raise HTTPException(status_code=404, detail='Webhook not found')
    return wh


@router.delete('/{webhook_id}')
async def delete_webhook_endpoint(webhook_id: str,
                                  user: User = Depends(require_role('admin'))):
    """
    Deletes a webhook.

    @param webhook_id: ID of the webhook to delete.

    @return response: Confirmation dict.

    @raises HTTPException 404: Webhook not found.
    """
    ok = delete_webhook(webhook_id)
    if not ok:
        raise HTTPException(status_code=404, detail='Webhook not found')
    return {'status': 'deleted', 'id': webhook_id}


@router.post('/{webhook_id}/test')
async def test_webhook(webhook_id: str, body: WebhookTestPayload,
                       user: User = Depends(require_role('admin'))):
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
