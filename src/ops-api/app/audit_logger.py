"""
@author: Samah SHAYYA
@date: 03-Jun-2026

@description: Audit logging module for ops-api backed by PostgreSQL.
Logs actions to the AuditLog table and provides filtered retrieval + CSV export.
"""

import logging

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select

from app.db import AuditLog, async_session_factory

logger: logging.Logger = logging.getLogger(__name__)

MAX_AUDIT_ENTRIES: int = 10_000


async def log_action(
    robot_id: str,
    action: str,
    user_role: str,
    details: str,
    ip_address: str = "",
    factory_id: int = 1,
    user_id: int | None = None,
) -> dict[str, Any]:
    """
    Records an audit log entry in PostgreSQL.

    @param robot_id: Affected robot identifier.
    @param action: Action performed (e.g., 'start', 'stop', 'emergency_stop',
                   'assign_task').
    @param user_role: Role of the user who performed the action.
    @param details: Human-readable description.
    @param ip_address: Originating IP address (optional).
    @param factory_id: The factory context (default 1 for backward compat).
    @param user_id: The user's database ID (optional).

    @return entry: The created audit log entry dict.
    """
    async with async_session_factory() as session:
        entry = AuditLog(
            factory_id=factory_id,
            user_id=user_id,
            robot_id=robot_id,
            action=action,
            details=details,
            ip_address=ip_address,
        )
        session.add(entry)
        await session.commit()
        await session.refresh(entry)

        logger.info('Audit: action=%s robot=%s role=%s', action, robot_id, user_role)

        return {
            'id': entry.id,
            'timestamp': entry.timestamp.isoformat() if entry.timestamp else '',
            'robot_id': entry.robot_id,
            'action': entry.action,
            'user_role': user_role,
            'details': entry.details,
            'ip_address': entry.ip_address,
        }


async def get_audit_log(
    robot_id: str | None = None,
    action: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    role: str | None = None,
    page: int = 1,
    per_page: int = 50,
    factory_id: int | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """
    Returns a filtered, paginated slice of the audit log from PostgreSQL.

    @param robot_id: Filter by robot ID (exact match).
    @param action: Filter by action (exact match).
    @param from_date: Filter entries after this ISO timestamp.
    @param to_date: Filter entries before this ISO timestamp.
    @param role: Filter by user role (exact match) — applied in Python since
                 user_role is not stored in the DB table directly (it's on User).
    @param page: Page number (1-indexed).
    @param per_page: Items per page.
    @param factory_id: Filter by factory ID.

    @return (entries, total_count): Filtered entries and total before
                                    pagination.
    """
    async with async_session_factory() as session:
        query = select(AuditLog).order_by(AuditLog.timestamp.desc())

        if robot_id:
            query = query.where(AuditLog.robot_id == robot_id)
        if action:
            query = query.where(AuditLog.action == action)
        if from_date:
            try:
                dt = datetime.fromisoformat(from_date)
                query = query.where(AuditLog.timestamp >= dt)
            except (ValueError, TypeError):
                pass
        if to_date:
            try:
                dt = datetime.fromisoformat(to_date)
                query = query.where(AuditLog.timestamp <= dt)
            except (ValueError, TypeError):
                pass
        if factory_id is not None:
            query = query.where(AuditLog.factory_id == factory_id)

        # Get total count
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await session.execute(count_query)
        total = total_result.scalar() or 0

        # Paginate
        offset = (page - 1) * per_page
        query = query.offset(offset).limit(per_page)
        result = await session.execute(query)
        entries = result.scalars().all()

        entry_list = []
        for e in entries:
            entry_list.append({
                'id': str(e.id),
                'timestamp': e.timestamp.isoformat() if e.timestamp else '',
                'robot_id': e.robot_id or '',
                'action': e.action,
                'user_role': role or '',
                'details': e.details or '',
                'ip_address': e.ip_address or '',
            })

        # Apply role filter in Python if specified
        if role:
            entry_list = [e for e in entry_list if e['user_role'] == role]
            total = len(entry_list)

        return entry_list, total


async def export_audit_csv(
    robot_id: str | None = None,
    action: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    role: str | None = None,
    factory_id: int | None = None,
) -> str:
    """
    Returns filtered audit entries as CSV string.

    @return csv_content: CSV string with header row.
    """
    entries, _ = await get_audit_log(
        robot_id=robot_id,
        action=action,
        from_date=from_date,
        to_date=to_date,
        role=role,
        page=1,
        per_page=MAX_AUDIT_ENTRIES,
        factory_id=factory_id,
    )

    lines = ['id,timestamp,robot_id,action,user_role,details,ip_address']
    for e in entries:
        details = e.get('details', '').replace('"', '""')
        lines.append(
            f"{e.get('id', '')},{e.get('timestamp', '')},{e.get('robot_id', '')},"
            f"{e.get('action', '')},{e.get('user_role', '')},\"{details}\","
            f"{e.get('ip_address', '')}"
        )

    return '\n'.join(lines)
