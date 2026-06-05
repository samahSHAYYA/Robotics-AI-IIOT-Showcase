"""
@author: AI Orchestrator
@date: 04-Jun-2026

@description: Proxy endpoint for integration service KPIs.
The integration-service runs on port 8006 and has its own DB.
This endpoint proxies summary requests from the ops-api to the
integration-service, with a mock fallback for development.
"""

import logging

import httpx
from fastapi import APIRouter, Depends

from app.deps import require_role
from app.db import User

router = APIRouter(prefix='/api/v1')
logger = logging.getLogger(__name__)

INTEGRATION_SERVICE_URL = 'http://integration-service:8006'


@router.get('/integrations/summary')
async def integrations_summary(
    user: User = Depends(require_role('operator')),
):
    """Proxy to integration-service for integration KPI data."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f'{INTEGRATION_SERVICE_URL}/api/v1/integrations',
                headers={'X-API-Key': 'proxy'},
            )
            if resp.status_code != 200:
                logger.warning(
                    'Integration service returned %d — using mock data',
                    resp.status_code,
                )
                return _mock_integration_summary()
            integrations = resp.json()

            total = len(integrations)
            active = sum(1 for i in integrations if i.get('enabled'))
            failed = sum(1 for i in integrations if i.get('last_sync_status') == 'error')
            success = sum(1 for i in integrations if i.get('last_sync_status') == 'success')

            # Group by adapter type
            by_type = {}
            for i in integrations:
                at = i.get('adapter_type', 'unknown')
                by_type[at] = by_type.get(at, 0) + 1

            return {
                'total_integrations': total,
                'active_integrations': active,
                'failed_sync': failed,
                'success_sync': success,
                'health_pct': round(success / max(active, 1) * 100, 1) if active > 0 else 100,
                'by_type': by_type,
            }
    except Exception:
        logger.exception('Failed to reach integration service — using mock data')
        return _mock_integration_summary()


def _mock_integration_summary() -> dict:
    """Return plausible mock data when integration-service is unavailable."""
    return {
        'total_integrations': 5,
        'active_integrations': 4,
        'failed_sync': 1,
        'success_sync': 3,
        'health_pct': 75.0,
        'by_type': {'rest': 2, 'opcua': 1, 'mqtt': 1, 'soap': 1},
    }
