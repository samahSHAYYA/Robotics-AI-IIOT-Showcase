"""
@author: generated
@date: 30-May-2026

@description: REST endpoints for audit log retrieval and export.
"""

import logging

from fastapi import APIRouter, Query
from fastapi.responses import PlainTextResponse

from app.audit_logger import export_audit_csv, get_audit_log

router: APIRouter = APIRouter(prefix='/api/v1/audit')
logger: logging.Logger = logging.getLogger(__name__)


@router.get('')
async def list_audit_logs(
    robot_id: str | None = Query(None, description='Filter by robot ID'),
    action: str | None = Query(None, description='Filter by action'),
    from_date: str | None = Query(None, alias='from_date',
                                   description='Filter from ISO timestamp'),
    to_date: str | None = Query(None, alias='to_date',
                                 description='Filter to ISO timestamp'),
    role: str | None = Query(None, description='Filter by user role'),
    page: int = Query(1, ge=1, description='Page number'),
    per_page: int = Query(50, ge=1, le=100, description='Items per page'),
):
    """
    Returns paginated audit log entries with optional filters.

    @param robot_id: Filter by robot ID.
    @param action: Filter by action.
    @param from_date: Include entries after this timestamp.
    @param to_date: Include entries before this timestamp.
    @param role: Filter by user role.
    @param page: Page number (1-indexed).
    @param per_page: Items per page.

    @return response: Dict with entries, total, page, per_page.
    """

    entries, total = get_audit_log(
        robot_id=robot_id,
        action=action,
        from_date=from_date,
        to_date=to_date,
        role=role,
        page=page,
        per_page=per_page,
    )

    return {
        'entries': entries,
        'total': total,
        'page': page,
        'per_page': per_page,
    }


@router.get('/export')
async def export_audit(
    robot_id: str | None = Query(None, description='Filter by robot ID'),
    action: str | None = Query(None, description='Filter by action'),
    from_date: str | None = Query(None, alias='from_date',
                                   description='Filter from ISO timestamp'),
    to_date: str | None = Query(None, alias='to_date',
                                 description='Filter to ISO timestamp'),
    role: str | None = Query(None, description='Filter by user role'),
):
    """
    Exports filtered audit log as a CSV file download.

    @return response: CSV plain-text response with Content-Disposition header.
    """

    csv_content = export_audit_csv(
        robot_id=robot_id,
        action=action,
        from_date=from_date,
        to_date=to_date,
        role=role,
    )

    return PlainTextResponse(
        content=csv_content,
        media_type='text/csv',
        headers={'Content-Disposition': 'attachment; filename="audit-log.csv"'},
    )
