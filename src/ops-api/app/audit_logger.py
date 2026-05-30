"""
@author: generated
@date: 30-May-2026

@description: Audit logging module for ops-api. Maintains an in-memory,
append-only log of actions with a bounded size (10,000 entries).
"""

import logging
import uuid

from datetime import datetime, timezone
from typing import Any

logger: logging.Logger = logging.getLogger(__name__)

MAX_AUDIT_ENTRIES: int = 10_000

_audit_log: list[dict[str, Any]] = []


def log_action(
    robot_id: str,
    action: str,
    user_role: str,
    details: str,
    ip_address: str = "",
) -> dict[str, Any]:
    """
    Records an audit log entry in the in-memory store.

    @param robot_id: Affected robot identifier.
    @param action: Action performed (e.g., 'start', 'stop', 'emergency_stop',
                   'assign_task').
    @param user_role: Role of the user who performed the action.
    @param details: Human-readable description.
    @param ip_address: Originating IP address (optional).

    @return entry: The created audit log entry dict.
    """

    entry: dict[str, Any] = {
        'id': str(uuid.uuid4()),
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'robot_id': robot_id,
        'action': action,
        'user_role': user_role,
        'details': details,
        'ip_address': ip_address,
    }

    _audit_log.append(entry)

    # Bounded size: discard oldest when over limit
    if len(_audit_log) > MAX_AUDIT_ENTRIES:
        _audit_log.pop(0)

    logger.info('Audit: action=%s robot=%s role=%s', action, robot_id, user_role)

    return entry


def get_audit_log(
    robot_id: str | None = None,
    action: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    role: str | None = None,
    page: int = 1,
    per_page: int = 50,
) -> tuple[list[dict[str, Any]], int]:
    """
    Returns a filtered, paginated slice of the audit log.

    @param robot_id: Filter by robot ID (exact match).
    @param action: Filter by action (exact match).
    @param from_date: Filter entries after this ISO timestamp.
    @param to_date: Filter entries before this ISO timestamp.
    @param role: Filter by user role (exact match).
    @param page: Page number (1-indexed).
    @param per_page: Items per page.

    @return (entries, total_count): Filtered entries and total before
                                    pagination.
    """

    filtered = list(_audit_log)

    if robot_id:
        filtered = [e for e in filtered if e['robot_id'] == robot_id]
    if action:
        filtered = [e for e in filtered if e['action'] == action]
    if from_date:
        filtered = [e for e in filtered if e['timestamp'] >= from_date]
    if to_date:
        filtered = [e for e in filtered if e['timestamp'] <= to_date]
    if role:
        filtered = [e for e in filtered if e['user_role'] == role]

    total = len(filtered)

    # Sort newest first
    filtered.sort(key=lambda e: e['timestamp'], reverse=True)

    start = (page - 1) * per_page
    end = start + per_page
    page_entries = filtered[start:end]

    return page_entries, total


def export_audit_csv(
    robot_id: str | None = None,
    action: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    role: str | None = None,
) -> str:
    """
    Returns filtered audit entries as CSV string.

    @return csv_content: CSV string with header row.
    """

    entries, _ = get_audit_log(
        robot_id=robot_id,
        action=action,
        from_date=from_date,
        to_date=to_date,
        role=role,
        page=1,
        per_page=MAX_AUDIT_ENTRIES,
    )

    lines = ['id,timestamp,robot_id,action,user_role,details,ip_address']
    for e in entries:
        # Escape quotes in details for CSV safety
        details = e['details'].replace('"', '""')
        lines.append(
            f"{e['id']},{e['timestamp']},{e['robot_id']},{e['action']},"
            f"{e['user_role']},\"{details}\",{e['ip_address']}"
        )

    return '\n'.join(lines)
