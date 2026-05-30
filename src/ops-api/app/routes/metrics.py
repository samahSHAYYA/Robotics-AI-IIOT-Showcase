"""
@author: generated
@date: 30-May-2026

@description: Prometheus metrics endpoint for ops-api.
Exposes /metrics as text/plain with key factory supervisor metrics
using an in-memory counter approach.
"""

import logging
import time

from fastapi import APIRouter, Response

from app.store import store

router: APIRouter = APIRouter()
logger: logging.Logger = logging.getLogger(__name__)

# ── In-memory counters ──────────────────────────────────────────────────────

_start_time: float = time.time()
_http_requests_total: int = 0
_critical_alerts_total: int = 0


def increment_requests() -> None:
    """Increment the HTTP requests counter (called from middleware if desired)."""
    global _http_requests_total  # noqa: PLW0603
    _http_requests_total += 1


def increment_critical_alert() -> None:
    """Increment the critical alerts counter (called when a critical alert fires)."""
    global _critical_alerts_total  # noqa: PLW0603
    _critical_alerts_total += 1


# ── Helpers ─────────────────────────────────────────────────────────────────

def _compute_uptime() -> float:
    """Return server uptime in seconds."""
    return time.time() - _start_time


def _active_robot_count() -> int:
    """Return the number of robots currently in 'active' status."""
    snapshot = store.get_snapshot()
    robots = snapshot.get('robots', [])
    return sum(1 for r in robots if r.get('status') == 'active')


# ── /metrics endpoint ───────────────────────────────────────────────────────

@router.get('/metrics', include_in_schema=False)
async def metrics() -> Response:
    """
    Expose Prometheus-formatted metrics at GET /metrics.

    Content-Type: text/plain; charset=utf-8
    """

    uptime = _compute_uptime()
    active_robots = _active_robot_count()

    # Count critical alerts from the store snapshot
    snapshot = store.get_snapshot()
    alerts = snapshot.get('alerts', [])
    critical_now = sum(1 for a in alerts if a.get('severity') == 'critical')

    lines = [
        '# HELP http_requests_total Total number of HTTP requests processed.',
        '# TYPE http_requests_total counter',
        f'http_requests_total {_http_requests_total}',
        '',
        '# HELP robots_active_total Current number of active robots.',
        '# TYPE robots_active_total gauge',
        f'robots_active_total {active_robots}',
        '',
        '# HELP alerts_critical_total Total number of critical alerts.',
        '# TYPE alerts_critical_total counter',
        f'alerts_critical_total {_critical_alerts_total + critical_now}',
        '',
        '# HELP uptime_seconds Server uptime in seconds.',
        '# TYPE uptime_seconds gauge',
        f'uptime_seconds {uptime:.2f}',
    ]

    return Response(
        content='\n'.join(lines) + '\n',
        media_type='text/plain; charset=utf-8',
    )
