"""
@author: AI Orchestrator
@date: 04-Jun-2026

@description: REST endpoints for shift scheduling and worker management.
Tenant-scoped CRUD for both shifts and workers.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, delete, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import require_role, require_factory_access
from app.db import User, Shift, Worker, get_session

router = APIRouter(prefix='/api/v1')
logger = logging.getLogger(__name__)


# ── Schemas ──────────────────────────────────────────────────────────────────

class ShiftCreate(BaseModel):
    name: str
    start_time: str  # HH:MM
    end_time: str    # HH:MM
    days_of_week: list[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4])


class ShiftUpdate(BaseModel):
    name: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    days_of_week: list[int] | None = None


class ShiftResponse(BaseModel):
    id: int
    tenant_id: int
    factory_id: int
    name: str
    start_time: str
    end_time: str
    days_of_week: list[int]
    created_at: datetime | None = None
    updated_at: datetime | None = None
    model_config = {'from_attributes': True}


class WorkerCreate(BaseModel):
    name: str
    role: str = 'operator'
    email: str | None = None
    phone: str | None = None
    shift_id: int | None = None
    active: bool = True


class WorkerUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    email: str | None = None
    phone: str | None = None
    shift_id: int | None = None
    active: bool | None = None


class WorkerResponse(BaseModel):
    id: int
    tenant_id: int
    factory_id: int
    shift_id: int | None
    name: str
    role: str
    email: str | None
    phone: str | None
    active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None
    model_config = {'from_attributes': True}


# ── Shift Endpoints ──────────────────────────────────────────────────────────

@router.get('/shifts', response_model=list[ShiftResponse])
async def list_shifts(
    user: User = Depends(require_role('factory_admin')),
    _=Depends(require_factory_access()),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Shift).where(
            Shift.tenant_id == user.tenant_id,
            Shift.factory_id == user.factory_id,
        ).order_by(Shift.created_at.desc()),
    )
    return result.scalars().all()


@router.post('/shifts', response_model=ShiftResponse, status_code=201)
async def create_shift(
    payload: ShiftCreate,
    user: User = Depends(require_role('factory_admin')),
    _=Depends(require_factory_access()),
    session: AsyncSession = Depends(get_session),
):
    shift = Shift(
        tenant_id=user.tenant_id,
        factory_id=user.factory_id,
        name=payload.name,
        start_time=payload.start_time,
        end_time=payload.end_time,
        days_of_week=payload.days_of_week,
    )
    session.add(shift)
    await session.commit()
    await session.refresh(shift)
    return shift


@router.put('/shifts/{shift_id}', response_model=ShiftResponse)
async def update_shift(
    shift_id: int,
    payload: ShiftUpdate,
    user: User = Depends(require_role('factory_admin')),
    _=Depends(require_factory_access()),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Shift).where(Shift.id == shift_id, Shift.factory_id == user.factory_id),
    )
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail='Shift not found')
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(shift, field, value)
    shift.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(shift)
    return shift


@router.delete('/shifts/{shift_id}', status_code=204)
async def delete_shift(
    shift_id: int,
    user: User = Depends(require_role('factory_admin')),
    _=Depends(require_factory_access()),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Shift).where(Shift.id == shift_id, Shift.factory_id == user.factory_id),
    )
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail='Shift not found')
    # Unassign workers from this shift
    await session.execute(
        update(Worker).where(Worker.shift_id == shift_id).values(shift_id=None),
    )
    await session.delete(shift)
    await session.commit()


# ── Worker Endpoints ─────────────────────────────────────────────────────────

@router.get('/workers', response_model=list[WorkerResponse])
async def list_workers(
    user: User = Depends(require_role('factory_admin')),
    _=Depends(require_factory_access()),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Worker).where(
            Worker.tenant_id == user.tenant_id,
            Worker.factory_id == user.factory_id,
        ).order_by(Worker.name.asc()),
    )
    return result.scalars().all()


@router.post('/workers', response_model=WorkerResponse, status_code=201)
async def create_worker(
    payload: WorkerCreate,
    user: User = Depends(require_role('factory_admin')),
    _=Depends(require_factory_access()),
    session: AsyncSession = Depends(get_session),
):
    # Validate shift_id if provided
    if payload.shift_id:
        result = await session.execute(
            select(Shift).where(Shift.id == payload.shift_id, Shift.factory_id == user.factory_id),
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail='Shift not found in this factory')
    worker = Worker(
        tenant_id=user.tenant_id,
        factory_id=user.factory_id,
        shift_id=payload.shift_id,
        name=payload.name,
        role=payload.role,
        email=payload.email,
        phone=payload.phone,
        active=payload.active,
    )
    session.add(worker)
    await session.commit()
    await session.refresh(worker)
    return worker


@router.put('/workers/{worker_id}', response_model=WorkerResponse)
async def update_worker(
    worker_id: int,
    payload: WorkerUpdate,
    user: User = Depends(require_role('factory_admin')),
    _=Depends(require_factory_access()),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Worker).where(Worker.id == worker_id, Worker.factory_id == user.factory_id),
    )
    worker = result.scalar_one_or_none()
    if not worker:
        raise HTTPException(status_code=404, detail='Worker not found')
    # Validate shift if provided
    if payload.shift_id:
        result = await session.execute(
            select(Shift).where(Shift.id == payload.shift_id, Shift.factory_id == user.factory_id),
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail='Shift not found in this factory')
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(worker, field, value)
    worker.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(worker)
    return worker


@router.delete('/workers/{worker_id}', status_code=204)
async def delete_worker(
    worker_id: int,
    user: User = Depends(require_role('factory_admin')),
    _=Depends(require_factory_access()),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Worker).where(Worker.id == worker_id, Worker.factory_id == user.factory_id),
    )
    worker = result.scalar_one_or_none()
    if not worker:
        raise HTTPException(status_code=404, detail='Worker not found')
    await session.delete(worker)
    await session.commit()


# ── Aggregation / KPI Endpoint ────────────────────────────────────────────────


@router.get('/shifts/summary')
async def shifts_summary(
    user: User = Depends(require_role('operator')),
    _=Depends(require_factory_access()),
    session: AsyncSession = Depends(get_session),
):
    """Return aggregate KPI data for shifts and workers."""
    # Count total shifts
    shifts_result = await session.execute(
        select(func.count()).where(
            Shift.tenant_id == user.tenant_id,
            Shift.factory_id == user.factory_id,
        ),
    )
    total_shifts = shifts_result.scalar() or 0

    # Count active workers
    workers_result = await session.execute(
        select(func.count()).where(
            Worker.tenant_id == user.tenant_id,
            Worker.factory_id == user.factory_id,
            Worker.active == True,
        ),
    )
    active_workers = workers_result.scalar() or 0

    # Count total workers
    total_workers_result = await session.execute(
        select(func.count()).where(
            Worker.tenant_id == user.tenant_id,
            Worker.factory_id == user.factory_id,
        ),
    )
    total_workers = total_workers_result.scalar() or 0

    # Count workers per shift
    workers_per_shift = {}
    shifts_query = await session.execute(
        select(Shift).where(
            Shift.tenant_id == user.tenant_id,
            Shift.factory_id == user.factory_id,
        ),
    )
    shifts = shifts_query.scalars().all()
    for shift in shifts:
        count_query = await session.execute(
            select(func.count()).where(
                Worker.shift_id == shift.id,
                Worker.active == True,
            ),
        )
        workers_per_shift[shift.name] = count_query.scalar() or 0

    # Determine active shifts based on current time
    now = datetime.now(timezone.utc)
    current_hour = now.hour
    current_minute = now.minute
    current_time_str = f'{current_hour:02d}:{current_minute:02d}'
    current_day = now.weekday()  # 0=Monday

    active_shifts_count = 0
    for shift in shifts:
        if current_day in (shift.days_of_week or []):
            if shift.start_time <= current_time_str <= shift.end_time:
                active_shifts_count += 1

    return {
        'total_shifts': total_shifts,
        'total_workers': total_workers,
        'active_workers': active_workers,
        'active_shifts': active_shifts_count,
        'worker_utilization': round(active_workers / max(total_workers, 1) * 100, 1),
        'workers_per_shift': workers_per_shift,
    }
