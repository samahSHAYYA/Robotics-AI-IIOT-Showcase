"""
@author: generated
@date: 30-May-2026

@description: Streaming analytics engine for ops-api. Maintains a rolling
1-hour buffer of telemetry snapshots and computes current analytics.
"""

import logging

from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Any

logger: logging.Logger = logging.getLogger(__name__)

MAX_HISTORY_MINUTES: int = 60

# Rolling buffer: list of (timestamp_iso, snapshot_dict)
_history: deque[tuple[str, dict[str, Any]]] = deque(maxlen=200)


def update(snapshot: dict[str, Any]):
    """
    Appends a telemetry snapshot with the current timestamp.

    Prunes entries older than 1 hour.

    @param snapshot: The latest telemetry snapshot dict from
                     store.get_snapshot().
    """

    now = datetime.now(timezone.utc)
    _history.append((now.isoformat(), snapshot))

    # Prune entries older than 1 hour
    cutoff = now - timedelta(minutes=MAX_HISTORY_MINUTES)
    while _history and _history[0][0] < cutoff.isoformat():
        _history.popleft()


def get_current() -> dict[str, Any]:
    """
    Returns current analytics computed from the latest snapshot.

    @return analytics: Dict with avg/max/min uptime, alert rate,
                       robot utilization, and robot counts.
    """

    if not _history:
        return _empty_analytics()

    _, latest = _history[-1]
    robots: list[dict[str, Any]] = latest.get('robots', [])
    alerts: list[dict[str, Any]] = latest.get('alerts', [])

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
        'timestamp': latest.get('last_update',
                                datetime.now(timezone.utc).isoformat()),
    }


def get_history() -> list[dict[str, Any]]:
    """
    Returns time-series data for the last hour at 5-minute granularity.

    Snapshots within each 5-minute bucket are averaged together.

    @return snapshots: List of dicts with timestamp, avg_uptime, alert_rate,
                       robot_utilization, robot_count.
    """

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=MAX_HISTORY_MINUTES)

    # Filter entries within the window
    recent = [(ts, snap) for ts, snap in _history
              if ts >= cutoff.isoformat()]

    if not recent:
        return []

    # Group into 5-minute buckets
    buckets: dict[str, list[dict[str, Any]]] = {}
    for ts, snap in recent:
        dt = datetime.fromisoformat(ts)
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
