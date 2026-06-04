"""
@author: Samah SHAYYA
@date: 03-Jun-2026

@description: Streaming analytics engine for ops-api backed by PostgreSQL.
Maintains a small in-memory cache of the last 5 minutes for hot-path reads;
older history is queried from the TelemetrySnapshot table.
"""

import logging
import threading

from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select

from app.db import TelemetrySnapshot, async_session_factory

logger: logging.Logger = logging.getLogger(__name__)

MAX_HISTORY_MINUTES: int = 60
IN_MEMORY_CACHE_MINUTES: int = 5

# Rolling buffer: list of (timestamp_iso, snapshot_dict) — last 5 minutes only
_history: deque[tuple[str, dict[str, Any]]] = deque(maxlen=100)
_history_lock: threading.Lock = threading.Lock()

# Cache for the last computed analytics result
_last_analytics: dict[str, Any] | None = None
_last_analytics_lock: threading.Lock = threading.Lock()


def update(snapshot: dict[str, Any], factory_id: int = 1):
    """
    Appends a telemetry snapshot to the in-memory cache.

    Only keeps the last 5 minutes in memory; older data is queried from DB.

    @param snapshot: The latest telemetry snapshot dict from
                     store.get_snapshot().
    @param factory_id: Factory context (default 1 for backward compat).
    """
    now = datetime.now(timezone.utc)
    with _history_lock:
        _history.append((now.isoformat(), snapshot))

        # Prune entries older than 5 minutes from memory
        cutoff = now - timedelta(minutes=IN_MEMORY_CACHE_MINUTES)
        while _history and _history[0][0] < cutoff.isoformat():
            _history.popleft()


def get_current() -> dict[str, Any]:
    """
    Returns current analytics computed from the latest snapshot in cache.

    @return analytics: Dict with avg/max/min uptime, alert rate,
                       robot utilization, and robot counts.
    """
    with _history_lock:
        if not _history:
            return _empty_analytics()

        _, latest = _history[-1]

    return _compute_analytics(latest)


def _compute_analytics(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Compute analytics from a single snapshot dict."""
    robots: list[dict[str, Any]] = snapshot.get('robots', [])
    alerts: list[dict[str, Any]] = snapshot.get('alerts', [])

    uptimes = [r.get('uptime_pct', 0.0) for r in robots]
    active_count = sum(1 for r in robots
                       if r.get('status') in ('active', 'moving'))
    idle_count = sum(1 for r in robots
                     if r.get('status') == 'idle')
    error_count = sum(1 for r in robots
                      if r.get('status') == 'error')
    total_robots = len(robots) or 1

    # Alert rate: fraction of alerts that are critical or warning
    total_alerts = len(alerts) or 1
    critical_alerts = sum(1 for a in alerts
                          if a.get('severity') == 'critical')
    warning_alerts = sum(1 for a in alerts
                         if a.get('severity') == 'warning')
    alert_rate = round((critical_alerts + warning_alerts) / total_alerts, 2)

    # Robot utilization: fraction of non-idle robots
    utilization = round((total_robots - idle_count) / total_robots, 2)

    return {
        'avg_uptime': round(sum(uptimes) / len(uptimes), 1) if uptimes else 0.0,
        'max_uptime': round(max(uptimes), 1) if uptimes else 0.0,
        'min_uptime': round(min(uptimes), 1) if uptimes else 0.0,
        'alert_rate': alert_rate,
        'robot_utilization': utilization,
        'active_robot_count': active_count,
        'idle_robot_count': idle_count,
        'error_robot_count': error_count,
        'total_robot_count': total_robots,
        'timestamp': snapshot.get('last_update',
                                  datetime.now(timezone.utc).isoformat()),
    }


async def get_history(factory_id: int = 1) -> list[dict[str, Any]]:
    """
    Returns time-series data for the last hour at 5-minute granularity.

    Combines in-memory cache (last 5 min) with DB queries (older data).
    Snapshots within each 5-minute bucket are averaged together.

    @param factory_id: Factory context.

    @return snapshots: List of dicts with timestamp, avg_uptime, alert_rate,
                       robot_utilization, robot_count.
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=MAX_HISTORY_MINUTES)

    # Collect all snapshots from in-memory cache (last 5 min)
    recent_snapshots: list[tuple[str, dict[str, Any]]] = []
    with _history_lock:
        for ts, snap in _history:
            if ts >= cutoff.isoformat():
                recent_snapshots.append((ts, snap))

    # Query older snapshots from DB if needed
    db_cutoff = now - timedelta(minutes=IN_MEMORY_CACHE_MINUTES)
    if db_cutoff > cutoff:
        try:
            async with async_session_factory() as session:
                result = await session.execute(
                    select(TelemetrySnapshot)
                    .where(TelemetrySnapshot.factory_id == factory_id)
                    .where(TelemetrySnapshot.timestamp >= cutoff)
                    .where(TelemetrySnapshot.timestamp < db_cutoff)
                    .order_by(TelemetrySnapshot.timestamp)
                )
                db_snapshots = result.scalars().all()

            for snap in db_snapshots:
                ts = snap.timestamp.isoformat() if snap.timestamp else ''
                recent_snapshots.append((ts, snap.data))
        except Exception as exc:
            logger.warning('Failed to query analytics history from DB: %s', exc)

    if not recent_snapshots:
        return []

    # Group into 5-minute buckets
    buckets: dict[str, list[dict[str, Any]]] = {}
    for ts, snap in recent_snapshots:
        try:
            dt = datetime.fromisoformat(ts)
        except (ValueError, TypeError):
            continue
        rounded_min = (dt.minute // 5) * 5
        bucket_key = dt.replace(
            minute=rounded_min, second=0, microsecond=0
        ).isoformat()
        if bucket_key not in buckets:
            buckets[bucket_key] = []
        buckets[bucket_key].append(snap)

    result: list[dict[str, Any]] = []
    for bucket_ts in sorted(buckets.keys()):
        snaps = buckets[bucket_ts]

        uptimes_all: list[float] = []
        alert_rates_all: list[float] = []
        utilization_all: list[float] = []
        robot_counts: set[int] = set()

        for snap in snaps:
            robots = snap.get('robots', [])
            alerts = snap.get('alerts', [])
            uptimes = [r.get('uptime_pct', 0.0) for r in robots]
            if uptimes:
                uptimes_all.append(sum(uptimes) / len(uptimes))
            total_alerts = max(len(alerts), 1)
            crit = sum(1 for a in alerts
                       if a.get('severity') == 'critical')
            warn = sum(1 for a in alerts
                       if a.get('severity') == 'warning')
            alert_rates_all.append((crit + warn) / total_alerts)
            idle = sum(1 for r in robots if r.get('status') == 'idle')
            total = max(len(robots), 1)
            utilization_all.append((total - idle) / total)
            robot_counts.add(len(robots))

        result.append({
            'timestamp': bucket_ts,
            'avg_uptime': (
                round(sum(uptimes_all) / len(uptimes_all), 1)
                if uptimes_all else 0.0
            ),
            'alert_rate': (
                round(sum(alert_rates_all) / len(alert_rates_all), 2)
                if alert_rates_all else 0.0
            ),
            'robot_utilization': (
                round(sum(utilization_all) / len(utilization_all), 2)
                if utilization_all else 0.0
            ),
            'robot_count': max(robot_counts) if robot_counts else 0,
        })

    return result


def _empty_analytics() -> dict[str, Any]:
    """Returns a zeroed analytics dict when no data is available."""
    return {
        'avg_uptime': 0.0,
        'max_uptime': 0.0,
        'min_uptime': 0.0,
        'alert_rate': 0.0,
        'robot_utilization': 0.0,
        'active_robot_count': 0,
        'idle_robot_count': 0,
        'error_robot_count': 0,
        'total_robot_count': 0,
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }
