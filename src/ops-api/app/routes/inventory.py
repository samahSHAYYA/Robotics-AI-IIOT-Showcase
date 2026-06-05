"""
@author: AI Orchestrator
@date: 04-Jun-2026

@description: REST endpoints for inventory item management and stock movement tracking.
Tenant-scoped CRUD for inventory items and movement history.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import require_role, require_factory_access
from app.db import User, InventoryItem, StockMovement, get_session

router = APIRouter(prefix='/api/v1')
logger = logging.getLogger(__name__)


# ── Schemas ──────────────────────────────────────────────────────────────────

class InventoryItemCreate(BaseModel):
    sku: str
    name: str
    description: str | None = None
    quantity: int = 0
    unit: str = 'EA'
    min_threshold: int = 10
    location: str | None = None


class InventoryItemUpdate(BaseModel):
    sku: str | None = None
    name: str | None = None
    description: str | None = None
    quantity: int | None = None
    unit: str | None = None
    min_threshold: int | None = None
    location: str | None = None


class InventoryItemResponse(BaseModel):
    id: int
    tenant_id: int
    factory_id: int
    sku: str
    name: str
    description: str | None
    quantity: int
    unit: str
    min_threshold: int
    location: str | None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    model_config = {'from_attributes': True}


class StockMovementCreate(BaseModel):
    quantity_change: int
    reason: str
    reference: str | None = None
    created_by: str | None = None


class StockMovementResponse(BaseModel):
    id: int
    item_id: int
    quantity_change: int
    reason: str
    reference: str | None
    created_by: str | None
    created_at: datetime | None = None
    model_config = {'from_attributes': True}


# ── Inventory Item Endpoints ─────────────────────────────────────────────────

@router.get('/inventory', response_model=list[InventoryItemResponse])
async def list_inventory(
    user: User = Depends(require_role('factory_admin')),
    _=Depends(require_factory_access()),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(InventoryItem).where(
            InventoryItem.tenant_id == user.tenant_id,
            InventoryItem.factory_id == user.factory_id,
        ).order_by(InventoryItem.name.asc()),
    )
    return result.scalars().all()


@router.post('/inventory', response_model=InventoryItemResponse, status_code=201)
async def create_inventory_item(
    payload: InventoryItemCreate,
    user: User = Depends(require_role('factory_admin')),
    _=Depends(require_factory_access()),
    session: AsyncSession = Depends(get_session),
):
    item = InventoryItem(
        tenant_id=user.tenant_id,
        factory_id=user.factory_id,
        sku=payload.sku,
        name=payload.name,
        description=payload.description,
        quantity=payload.quantity,
        unit=payload.unit,
        min_threshold=payload.min_threshold,
        location=payload.location,
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item


@router.put('/inventory/{item_id}', response_model=InventoryItemResponse)
async def update_inventory_item(
    item_id: int,
    payload: InventoryItemUpdate,
    user: User = Depends(require_role('factory_admin')),
    _=Depends(require_factory_access()),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(InventoryItem).where(
            InventoryItem.id == item_id,
            InventoryItem.factory_id == user.factory_id,
        ),
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail='Inventory item not found')
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    item.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(item)
    return item


@router.delete('/inventory/{item_id}', status_code=204)
async def delete_inventory_item(
    item_id: int,
    user: User = Depends(require_role('factory_admin')),
    _=Depends(require_factory_access()),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(InventoryItem).where(
            InventoryItem.id == item_id,
            InventoryItem.factory_id == user.factory_id,
        ),
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail='Inventory item not found')
    # Delete associated stock movements first
    await session.execute(
        delete(StockMovement).where(StockMovement.item_id == item_id),
    )
    await session.delete(item)
    await session.commit()


# ── Stock Movement Endpoints ─────────────────────────────────────────────────

@router.get('/inventory/{item_id}/movements', response_model=list[StockMovementResponse])
async def list_stock_movements(
    item_id: int,
    user: User = Depends(require_role('factory_admin')),
    _=Depends(require_factory_access()),
    session: AsyncSession = Depends(get_session),
):
    # Verify item exists and belongs to user's factory
    result = await session.execute(
        select(InventoryItem).where(
            InventoryItem.id == item_id,
            InventoryItem.factory_id == user.factory_id,
        ),
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail='Inventory item not found')

    movements = await session.execute(
        select(StockMovement).where(
            StockMovement.item_id == item_id,
        ).order_by(StockMovement.created_at.desc()),
    )
    return movements.scalars().all()


@router.post('/inventory/{item_id}/adjust', response_model=StockMovementResponse, status_code=201)
async def adjust_inventory_stock(
    item_id: int,
    payload: StockMovementCreate,
    user: User = Depends(require_role('factory_admin')),
    _=Depends(require_factory_access()),
    session: AsyncSession = Depends(get_session),
):
    # Verify item exists and belongs to user's factory
    result = await session.execute(
        select(InventoryItem).where(
            InventoryItem.id == item_id,
            InventoryItem.factory_id == user.factory_id,
        ),
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail='Inventory item not found')

    # Update item quantity
    item.quantity += payload.quantity_change
    item.updated_at = datetime.now(timezone.utc)

    # Record movement
    movement = StockMovement(
        item_id=item_id,
        quantity_change=payload.quantity_change,
        reason=payload.reason,
        reference=payload.reference,
        created_by=payload.created_by or user.username,
    )
    session.add(movement)
    await session.commit()
    await session.refresh(movement)
    return movement


# ── Aggregation / KPI Endpoint ────────────────────────────────────────────────


@router.get('/inventory/summary')
async def inventory_summary(
    user: User = Depends(require_role('operator')),
    _=Depends(require_factory_access()),
    session: AsyncSession = Depends(get_session),
):
    """Return aggregate KPI data for inventory."""
    # All items for this factory
    result = await session.execute(
        select(InventoryItem).where(
            InventoryItem.tenant_id == user.tenant_id,
            InventoryItem.factory_id == user.factory_id,
        ),
    )
    items = result.scalars().all()

    total_items = len(items)
    total_quantity = sum(item.quantity for item in items)
    low_stock = sum(
        1 for item in items
        if item.quantity <= item.min_threshold and item.quantity > item.min_threshold * 0.5
    )
    critical_stock = sum(
        1 for item in items
        if item.quantity <= item.min_threshold * 0.5
    )
    ok_stock = total_items - low_stock - critical_stock

    # Movement stats (last 24h) — scoped to this factory's items
    yesterday = datetime.now(timezone.utc) - timedelta(hours=24)
    movements_query = await session.execute(
        select(func.count())
        .select_from(StockMovement)
        .join(InventoryItem, StockMovement.item_id == InventoryItem.id)
        .where(
            StockMovement.created_at >= yesterday,
            InventoryItem.tenant_id == user.tenant_id,
            InventoryItem.factory_id == user.factory_id,
        ),
    )
    recent_movements = movements_query.scalar() or 0

    return {
        'total_items': total_items,
        'total_quantity': total_quantity,
        'ok_stock': ok_stock,
        'low_stock': low_stock,
        'critical_stock': critical_stock,
        'recent_movements_24h': recent_movements,
        'stock_health_pct': round(ok_stock / max(total_items, 1) * 100, 1),
    }
