"""
@author: Samah SHAYYA
@date: 03-Jun-2026

@description: Telemetry store with in-memory cache + periodic database
persistence. The movement simulation runs in-memory for speed; telemetry
snapshots and robot states are flushed to PostgreSQL periodically.
"""

import asyncio
import copy
import json
import logging
import math
import random
import threading
import time

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.event_bus import publish_event
from app.db import (
    Alert,
    Robot,
    TelemetrySnapshot,
    async_session_factory,
)

# Feature 42: Robot Fleet Auto-Discovery — registered robots in-memory store
registered_robots: dict[str, dict[str, Any]] = {}
_registered_robots_lock: threading.Lock = threading.Lock()
_robot_sequence_counters: dict[str, int] = {'H': 0, 'W': 0, 'I': 0}
ROBOT_TYPE_PREFIX: dict[str, str] = {
    'humanoid': 'H',
    'welder': 'W',
    'inspector': 'I',
}

logger: logging.Logger = logging.getLogger(__name__)


# Robot waypoint loops (closed loops in 0-10 coordinate space)
ROBOT_PATHS: dict[str, list[tuple[float, float]]] = {
    'C3': [(3, 1.5), (7, 1.5), (7.5, 3), (6, 5.5), (3.5, 5.5), (2.5, 3.5)],
    'W2': [(6.5, 2), (7.5, 4), (5, 5.5), (3.5, 4), (5, 2)],
    'Q1': [(4, 3), (5.5, 3), (6, 4.5), (5, 5), (4, 5), (3.5, 4.5)],
}

# Priority order for collision avoidance (highest first)
ROBOT_PRIORITY: list[str] = ['C3', 'W2', 'Q1']

# Worker simulation constants
WORKER_ZONE_BOUNDS: dict[str, dict[str, float]] = {
    'assembly': {'x_min': 0.5, 'x_max': 4.0, 'y_min': 0.5, 'y_max': 4.0},
    'welding': {'x_min': 4.0, 'x_max': 8.0, 'y_min': 3.0, 'y_max': 6.5},
    'inspection': {'x_min': 2.0, 'x_max': 6.0, 'y_min': 5.0, 'y_max': 9.0},
}
WORKER_WAYPOINT_COUNT: int = 3
WORKER_SPEED: float = 0.12  # units per second (slower than robots)
WORKER_UPDATE_INTERVAL_S: float = 2.0

# DB flush interval
DB_FLUSH_INTERVAL_S: float = 5.0

# Default factory ID for backward compatibility
DEFAULT_FACTORY_ID: int = 1


def _maybe_publish_event(
    event_type: str,
    payload: dict[str, Any],
    tenant_id: int,
    factory_id: int | None = None,
):
    """
    Schedule an event publication if a running event loop exists.

    This is a fire-and-forget wrapper around publish_event that safely
    degrades when called from a synchronous context (e.g. test suite)
    where no event loop is running.
    """
    try:
        loop = asyncio.get_running_loop()
        if loop.is_running():
            asyncio.ensure_future(
                publish_event(event_type, payload, tenant_id, factory_id),
            )
    except RuntimeError:
        pass  # No running event loop — likely in test context


class TelemetryStore:
    """
    Thread-safe telemetry store with in-memory cache + periodic DB persistence.

    The movement simulation runs in-memory for performance. A background task
    periodically flushes the latest snapshot and robot states to PostgreSQL.
    Route handlers read from the in-memory cache for fast response times.
    """

    def __init__(self):
        self._lock: threading.Lock = threading.Lock()
        # In-memory cache keyed by factory_id
        self._data: dict[int, dict[str, Any]] = {
            DEFAULT_FACTORY_ID: self._build_default_snapshot(),
        }
        self._robot_fleet: dict[str, dict[str, Any]] = {
            'C3': {'status': 'moving', 'uptime_pct': 99.5, 'pose': {'x': 3.0, 'y': 1.5, 'theta': 0.0}},
            'W2': {'status': 'moving', 'uptime_pct': 97.2, 'pose': {'x': 6.5, 'y': 2.0, 'theta': 0.0}},
            'Q1': {'status': 'moving', 'uptime_pct': 98.7, 'pose': {'x': 4.0, 'y': 3.0, 'theta': 0.0}},
        }

        # Robot movement state
        self._robot_paths: dict[str, list[tuple[float, float]]] = {
            rid: list(path) for rid, path in ROBOT_PATHS.items()
        }
        self._robot_waypoint_idx: dict[str, int] = {rid: 0 for rid in ROBOT_PATHS}
        self._robot_speed: dict[str, float] = {'C3': 0.5, 'W2': 0.6, 'Q1': 0.4}
        self._robot_moving: dict[str, bool] = {rid: True for rid in ROBOT_PATHS}
        self._robot_tasks: dict[str, str] = {
            'C3': 'Assembly Line A',
            'W2': 'Welding Station 3',
            'Q1': 'Visual Inspection',
        }
        self._robot_paused_until: dict[str, float] = {rid: 0.0 for rid in ROBOT_PATHS}

        # Worker simulation state
        self._worker_positions: dict[str, dict[str, Any]] = {
            'WKR-01': {'x': 1.5, 'y': 2.0, 'zone': 'assembly', 'active': True,
                       'waypoints': [(1.0, 0.5), (2.0, 3.5), (3.5, 2.0)], 'target_idx': 0},
            'WKR-02': {'x': 5.0, 'y': 4.5, 'zone': 'welding', 'active': True,
                       'waypoints': [(5.0, 4.0), (7.0, 5.5), (6.0, 3.5)], 'target_idx': 0},
            'WKR-03': {'x': 3.0, 'y': 7.0, 'zone': 'inspection', 'active': True,
                       'waypoints': [(3.0, 7.0), (5.0, 8.0), (4.0, 6.0)], 'target_idx': 0},
            'WKR-04': {'x': 7.5, 'y': 1.0, 'zone': 'assembly', 'active': False,
                       'waypoints': [(1.0, 1.0), (3.5, 0.5), (2.0, 2.5)], 'target_idx': 0},
        }
        self._last_worker_update: float = 0.0

        # ROS2 live data tracking (factory_id -> last update timestamp)
        self._last_ros2_update: dict[int, float] = {}
        # How long before ROS2 data goes stale and mock fallback kicks in
        self._ros2_stale_timeout_s: float = 10.0

        # DB flush tracking
        self._last_db_flush: float = 0.0
        self._db_flush_task: asyncio.Task | None = None

    def _build_default_snapshot(self) -> dict[str, Any]:
        """Build the default telemetry snapshot."""
        return {
            'throughput': 1248,
            'defect_rate_pct': 1.7,
            'robot_uptime_pct': 99.2,
            'robots': [
                {'robot_id': 'C3', 'name': 'C3 Humanoid', 'status': 'moving',
                 'uptime_pct': 99.5, 'current_task': 'Assembly Line A',
                 'pose': {'x': 3.0, 'y': 1.5, 'theta': 0.0}},
                {'robot_id': 'W2', 'name': 'W2 Welder Arm', 'status': 'moving',
                 'uptime_pct': 97.2, 'current_task': 'Welding Station 3',
                 'pose': {'x': 6.5, 'y': 2.0, 'theta': 0.0}},
                {'robot_id': 'Q1', 'name': 'Q1 Inspector', 'status': 'moving',
                 'uptime_pct': 98.7, 'current_task': 'Visual Inspection',
                 'pose': {'x': 4.0, 'y': 3.0, 'theta': 0.0}},
            ],
            'workers': [
                {'worker_id': 'WKR-01', 'name': 'Alex Chen', 'x': 1.5, 'y': 2.0, 'zone': 'assembly', 'active': True},
                {'worker_id': 'WKR-02', 'name': 'Maria Garcia', 'x': 5.0, 'y': 4.5, 'zone': 'welding', 'active': True},
                {'worker_id': 'WKR-03', 'name': 'James Wilson', 'x': 3.0, 'y': 7.0, 'zone': 'inspection', 'active': True},
                {'worker_id': 'WKR-04', 'name': 'Priya Patel', 'x': 7.5, 'y': 1.0, 'zone': 'assembly', 'active': False},
            ],
            'alerts': [
                {'severity': 'healthy', 'message': 'Safety gate pass',
                 'timestamp': datetime.now(timezone.utc).isoformat()},
                {'severity': 'warning', 'message': 'Camera re-focus needed',
                 'timestamp': datetime.now(timezone.utc).isoformat()},
                {'severity': 'critical', 'message': 'Bearing temp high on C3',
                 'timestamp': datetime.now(timezone.utc).isoformat()},
            ],
            'events_consumed': 0,
            'predictions_consumed': 0,
            'data_source': 'mock',
            'last_update': datetime.now(timezone.utc).isoformat(),
        }

    def _get_cache(self, factory_id: int = DEFAULT_FACTORY_ID) -> dict[str, Any]:
        """Get or create the cache for a given factory."""
        if factory_id not in self._data:
            self._data[factory_id] = self._build_default_snapshot()
        return self._data[factory_id]

    # ── Public movement control methods (sync, update cache) ─────────────────

    def start_robot(self, robot_id: str, factory_id: int = DEFAULT_FACTORY_ID) -> bool:
        with self._lock:
            if robot_id not in self._robot_moving:
                return False
            self._robot_moving[robot_id] = True
            cache = self._get_cache(factory_id)
            for r in cache['robots']:
                if r['robot_id'] == robot_id:
                    r['status'] = 'moving'
            if robot_id in self._robot_fleet:
                self._robot_fleet[robot_id]['status'] = 'moving'
            return True

    def stop_robot(self, robot_id: str, factory_id: int = DEFAULT_FACTORY_ID) -> bool:
        with self._lock:
            if robot_id not in self._robot_moving:
                return False
            self._robot_moving[robot_id] = False
            cache = self._get_cache(factory_id)
            for r in cache['robots']:
                if r['robot_id'] == robot_id:
                    r['status'] = 'idle'
            if robot_id in self._robot_fleet:
                self._robot_fleet[robot_id]['status'] = 'idle'
            return True

    def emergency_stop_robot(self, robot_id: str, factory_id: int = DEFAULT_FACTORY_ID) -> bool:
        with self._lock:
            if robot_id not in self._robot_moving:
                return False
            self._robot_moving[robot_id] = False
            cache = self._get_cache(factory_id)
            for r in cache['robots']:
                if r['robot_id'] == robot_id:
                    r['status'] = 'error'
            if robot_id in self._robot_fleet:
                self._robot_fleet[robot_id]['status'] = 'error'
            cache['alerts'].insert(0, {
                'severity': 'critical',
                'message': f'Emergency stop triggered on {robot_id}',
                'timestamp': datetime.now(timezone.utc).isoformat(),
            })
            cache['alerts'] = cache['alerts'][:20]

        _maybe_publish_event('robot.status_changed', {
            'robot_id': robot_id,
            'status': 'error',
            'reason': 'emergency_stop',
        }, tenant_id=1, factory_id=factory_id)
        _maybe_publish_event('alert.raised', {
            'severity': 'critical',
            'message': f'Emergency stop triggered on {robot_id}',
            'robot_id': robot_id,
        }, tenant_id=1, factory_id=factory_id)
        return True

    def assign_task(self, robot_id: str, task: str, factory_id: int = DEFAULT_FACTORY_ID) -> bool:
        with self._lock:
            if robot_id not in self._robot_tasks:
                return False
            self._robot_tasks[robot_id] = task
            cache = self._get_cache(factory_id)
            for r in cache['robots']:
                if r['robot_id'] == robot_id:
                    r['current_task'] = task
            if robot_id in self._robot_fleet:
                self._robot_fleet[robot_id]['current_task'] = task
            return True

    def get_robot_info(self, robot_id: str, factory_id: int = DEFAULT_FACTORY_ID) -> dict[str, Any] | None:
        with self._lock:
            cache = self._get_cache(factory_id)
            for r in cache['robots']:
                if r['robot_id'] == robot_id:
                    return copy.deepcopy(r)
            return None

    def start_movement_simulation(self):
        """Public entry point to create the async movement task."""
        return asyncio.create_task(self._simulate_robot_movement())

    async def _flush_snapshot_to_db(self, factory_id: int = DEFAULT_FACTORY_ID):
        """Flush the current in-memory cache snapshot to the TelemetrySnapshot table."""
        try:
            async with async_session_factory() as session:
                with self._lock:
                    cache = self._get_cache(factory_id)
                    snapshot_data = copy.deepcopy(cache)

                db_snapshot = TelemetrySnapshot(
                    factory_id=factory_id,
                    data=snapshot_data,
                )
                session.add(db_snapshot)

                # Also update robot rows
                for robot_data in snapshot_data.get('robots', []):
                    result = await session.execute(
                        select(Robot).where(
                            Robot.factory_id == factory_id,
                            Robot.robot_id == robot_data['robot_id'],
                        )
                    )
                    db_robot = result.scalar_one_or_none()
                    if db_robot:
                        db_robot.status = robot_data.get('status', db_robot.status)
                        db_robot.pose = robot_data.get('pose', db_robot.pose)
                        db_robot.uptime_pct = robot_data.get('uptime_pct', db_robot.uptime_pct)
                        db_robot.current_task = robot_data.get('current_task', db_robot.current_task)
                        db_robot.last_heartbeat = datetime.now(timezone.utc)

                # Write alerts from cache to Alert table
                # Remove old alerts for this factory, insert current ones
                await session.execute(
                    sa_delete(Alert).where(Alert.factory_id == factory_id)
                )
                for alert_data in snapshot_data.get('alerts', []):
                    db_alert = Alert(
                        factory_id=factory_id,
                        robot_id=alert_data.get('robot_id'),
                        severity=alert_data.get('severity', 'info'),
                        message=alert_data.get('message', ''),
                    )
                    session.add(db_alert)

                await session.commit()
        except Exception as exc:
            logger.warning('DB flush failed (will retry): %s', exc, exc_info=False)

    async def _simulate_robot_movement(self):
        """
        Background coroutine: every 500ms moves each robot toward its next
        waypoint, applies collision avoidance, dynamically varies dashboard
        metrics, generates random alerts, and flushes to DB periodically.
        """
        WHILE_SLEEP_S = 0.5
        PROXIMITY_DIST = 2.0   # slowdown threshold
        COLLISION_DIST = 0.8   # pause threshold
        COLLISION_PAUSE_S = 1.0
        STATUS_CHANGE_INTERVAL_S = 40  # ~every 40s change robot status

        last_status_change: float = 0.0
        error_robot: str | None = None
        error_since: float = 0.0

        # Default factory cache for simulation
        factory_id = DEFAULT_FACTORY_ID

        while True:
            try:
                now = datetime.now(timezone.utc).timestamp()
                updates: dict[str, dict[str, Any]] = {}
                current_poses: dict[str, dict[str, float]] = {}

                with self._lock:
                    cache = self._get_cache(factory_id)
                    for rid in self._robot_paths:
                        for r in cache['robots']:
                            if r['robot_id'] == rid:
                                current_poses[rid] = dict(r['pose'])
                                break

                # ---- Check ROS2 data freshness ----
                with self._lock:
                    cache = self._get_cache(factory_id)
                    ros2_fresh = (
                        factory_id in self._last_ros2_update
                        and (now - self._last_ros2_update[factory_id])
                        < self._ros2_stale_timeout_s
                    )
                    cache['data_source'] = 'ros2' if ros2_fresh else 'mock'

                # When ROS2 is providing live data, skip pose computation
                # but continue with metrics, alerts, and worker movement.
                ros2_controls_poses = ros2_fresh

                # ---- Random data variation every tick ----
                with self._lock:
                    cache = self._get_cache(factory_id)
                    cache['throughput'] += random.uniform(-5, 5)
                    cache['throughput'] = max(1100, min(1400, cache['throughput']))

                    cache['defect_rate_pct'] += random.uniform(-0.05, 0.05)
                    cache['defect_rate_pct'] = max(0.5, min(4.0, cache['defect_rate_pct']))

                    cache['robot_uptime_pct'] += random.uniform(-0.02, 0.02)
                    cache['robot_uptime_pct'] = max(95, min(100, cache['robot_uptime_pct']))

                    # Randomly generate alerts (~2% chance per tick ≈ 1 per 25s)
                    if random.random() < 0.02:
                        severities = ['info', 'warning', 'critical']
                        severity = random.choices(severities, weights=[0.6, 0.3, 0.1])[0]
                        messages = {
                            'info': ['Motor temperature stable', 'Camera recalibrated',
                                     'Network latency normal'],
                            'warning': ['Motor load high on {robot}',
                                        'Camera focus drift on {robot}',
                                        'Battery below 30% on {robot}'],
                            'critical': ['Overheating on {robot}',
                                         'Collision risk detected at zone {zone}',
                                         'Emergency stop triggered on {robot}'],
                        }
                        robot_ids = ['C3', 'W2', 'Q1']
                        robots_names = {'C3': 'C3 Humanoid', 'W2': 'W2 Welder Arm',
                                        'Q1': 'Q1 Inspector'}
                        picked = random.choice(robot_ids)
                        msg = random.choice(messages[severity]).format(
                            robot=robots_names[picked],
                            zone=random.choice(['A', 'B', 'C']),
                        )
                        cache['alerts'].insert(0, {
                            'severity': severity,
                            'message': msg,
                            'timestamp': datetime.now(timezone.utc).isoformat(),
                        })
                        cache['alerts'] = cache['alerts'][:20]

                        _maybe_publish_event('alert.raised', {
                            'severity': severity,
                            'message': msg,
                            'robot_id': picked,
                        }, tenant_id=1, factory_id=factory_id)

                    # Randomly change robot tasks (~1% chance per tick)
                    if random.random() < 0.01:
                        tasks_pool = ['Assembly Line A', 'Assembly Line B',
                                      'Welding Station 3', 'Welding Station 1',
                                      'Visual Inspection', 'Quality Check',
                                      'Material Handling', 'Packaging Zone',
                                      'Charging Station', 'Maintenance Bay']
                        rid = random.choice(list(self._robot_tasks.keys()))
                        if random.random() < 0.15:
                            self._robot_tasks[rid] = random.choice(tasks_pool)
                        else:
                            self._robot_tasks[rid] = None  # idle

                # ---- Random robot status changes every ~40s ----
                if now - last_status_change > STATUS_CHANGE_INTERVAL_S:
                    last_status_change = now
                    with self._lock:
                        cache = self._get_cache(factory_id)
                        # Auto-resolve error after 10s
                        if error_robot is not None and now - error_since > 10.0:
                            for r in cache['robots']:
                                if r['robot_id'] == error_robot:
                                    r['status'] = 'active'
                                    self._robot_fleet[error_robot]['status'] = 'active'
                                    self._robot_moving[error_robot] = True
                                    logger.info('Robot %s error auto-resolved', error_robot)
                                    cache['alerts'].insert(0, {
                                        'severity': 'info',
                                        'message': f'{error_robot} error resolved — back online',
                                        'timestamp': datetime.now(timezone.utc).isoformat(),
                                    })
                                    cache['alerts'] = cache['alerts'][:20]

                                    _maybe_publish_event('robot.status_changed', {
                                        'robot_id': error_robot,
                                        'status': 'active',
                                        'reason': 'error_resolved',
                                    }, tenant_id=1, factory_id=factory_id)
                                    _maybe_publish_event('alert.raised', {
                                        'severity': 'info',
                                        'message': f'{error_robot} error resolved — back online',
                                        'robot_id': error_robot,
                                    }, tenant_id=1, factory_id=factory_id)
                                    break
                            error_robot = None

                        # Pick a random robot to change status
                        rid = random.choice(list(self._robot_fleet.keys()))
                        current_status = self._robot_fleet[rid]['status']

                        if current_status in ('active', 'moving'):
                            choice = random.choices(
                                ['warning', 'error', 'active'],
                                weights=[0.4, 0.1, 0.5],
                            )[0]
                            if choice == 'warning':
                                self._robot_fleet[rid]['status'] = 'maintenance'
                                self._robot_moving[rid] = False
                                for r in cache['robots']:
                                    if r['robot_id'] == rid:
                                        r['status'] = 'maintenance'
                                logger.info('Robot %s status → maintenance', rid)
                                cache['alerts'].insert(0, {
                                    'severity': 'warning',
                                    'message': f'{rid} requires maintenance — robot slowed',
                                    'timestamp': datetime.now(timezone.utc).isoformat(),
                                })
                                cache['alerts'] = cache['alerts'][:20]

                                _maybe_publish_event('robot.status_changed', {
                                    'robot_id': rid,
                                    'status': 'maintenance',
                                    'reason': 'random_status_change',
                                }, tenant_id=1, factory_id=factory_id)
                                _maybe_publish_event('alert.raised', {
                                    'severity': 'warning',
                                    'message': f'{rid} requires maintenance — robot slowed',
                                    'robot_id': rid,
                                }, tenant_id=1, factory_id=factory_id)
                            elif choice == 'error':
                                self._robot_fleet[rid]['status'] = 'error'
                                self._robot_moving[rid] = False
                                for r in cache['robots']:
                                    if r['robot_id'] == rid:
                                        r['status'] = 'error'
                                error_robot = rid
                                error_since = now
                                logger.info('Robot %s status → error', rid)
                                cache['alerts'].insert(0, {
                                    'severity': 'critical',
                                    'message': f'{rid} encountered a fault — emergency stop',
                                    'timestamp': datetime.now(timezone.utc).isoformat(),
                                })
                                cache['alerts'] = cache['alerts'][:20]

                                _maybe_publish_event('robot.status_changed', {
                                    'robot_id': rid,
                                    'status': 'error',
                                    'reason': 'random_status_change',
                                }, tenant_id=1, factory_id=factory_id)
                                _maybe_publish_event('alert.raised', {
                                    'severity': 'critical',
                                    'message': f'{rid} encountered a fault — emergency stop',
                                    'robot_id': rid,
                                }, tenant_id=1, factory_id=factory_id)

                        elif current_status in ('maintenance', 'idle'):
                            if random.random() < 0.5:
                                self._robot_fleet[rid]['status'] = 'active'
                                self._robot_moving[rid] = True
                                for r in cache['robots']:
                                    if r['robot_id'] == rid:
                                        r['status'] = 'active'
                                logger.info('Robot %s status → active', rid)

                                _maybe_publish_event('robot.status_changed', {
                                    'robot_id': rid,
                                    'status': 'active',
                                    'reason': 'random_status_change',
                                }, tenant_id=1, factory_id=factory_id)

                if not ros2_controls_poses:
                    # ---- Compute movement per robot (skipped when ROS2 provides live data) ----
                    for rid in self._robot_paths:
                        pose = current_poses.get(rid)
                        if pose is None:
                            continue

                        paused_until = self._robot_paused_until.get(rid, 0.0)
                        is_paused = now < paused_until

                        if not self._robot_moving.get(rid, False) and not is_paused:
                            continue

                        path = self._robot_paths[rid]
                        idx = self._robot_waypoint_idx.get(rid, 0)
                        target = path[idx % len(path)]

                        dx = target[0] - pose['x']
                        dy = target[1] - pose['y']
                        dist_to_target = math.hypot(dx, dy)

                        speed = self._robot_speed.get(rid, 0.3)
                        step = speed * WHILE_SLEEP_S

                        if is_paused:
                            dodge_dir_x, dodge_dir_y = 0.0, 0.0
                            for other_rid, other_pose in current_poses.items():
                                if other_rid == rid:
                                    continue
                                ox = other_pose['x'] - pose['x']
                                oy = other_pose['y'] - pose['y']
                                od = math.hypot(ox, oy)
                                if od < PROXIMITY_DIST and od > 0.01:
                                    dodge_dir_x += -oy / od
                                    dodge_dir_y += ox / od
                            dodge_len = math.hypot(dodge_dir_x, dodge_dir_y)
                            if dodge_len > 0:
                                dodge_speed = 0.15
                                dodge_dir_x /= dodge_len
                                dodge_dir_y /= dodge_len
                                pose['x'] += dodge_dir_x * dodge_speed * WHILE_SLEEP_S
                                pose['y'] += dodge_dir_y * dodge_speed * WHILE_SLEEP_S
                            if dist_to_target > 0:
                                pose['theta'] = math.atan2(dy, dx)
                            pose['x'] = max(0.5, min(9.5, pose['x']))
                            pose['y'] = max(0.5, min(9.0, pose['y']))
                            updates[rid] = {'pose': pose, 'status': 'moving'}
                            continue

                        if dist_to_target < 0.1:
                            idx = (idx + 1) % len(path)
                            self._robot_waypoint_idx[rid] = idx
                            target = path[idx % len(path)]
                            dx = target[0] - pose['x']
                            dy = target[1] - pose['y']
                            dist_to_target = math.hypot(dx, dy)

                        if dist_to_target > 0:
                            pose['x'] += (dx / dist_to_target) * min(step, dist_to_target)
                            pose['y'] += (dy / dist_to_target) * min(step, dist_to_target)

                        pose['x'] = max(0.5, min(9.5, pose['x']))
                        pose['y'] = max(0.5, min(9.0, pose['y']))
                        pose['theta'] = math.atan2(dy, dx)
                        updates[rid] = {'pose': pose, 'status': 'moving'}

                    # Collision avoidance — two levels (skipped when ROS2 provides live data)
                    pose_list = list(current_poses.items())
                    last_alert_key: str = ''
                    for i in range(len(pose_list)):
                        for j in range(i + 1, len(pose_list)):
                            rid_a, pa = pose_list[i]
                            rid_b, pb = pose_list[j]
                            d = math.hypot(pa['x'] - pb['x'], pa['y'] - pb['y'])

                            pri_a = ROBOT_PRIORITY.index(rid_a) if rid_a in ROBOT_PRIORITY else 99
                            pri_b = ROBOT_PRIORITY.index(rid_b) if rid_b in ROBOT_PRIORITY else 99

                            if d < PROXIMITY_DIST:
                                alert_key = f'proximity_{min(rid_a, rid_b)}_{max(rid_a, rid_b)}'
                                if alert_key != last_alert_key:
                                    last_alert_key = alert_key
                                    slower_rid = rid_b if pri_a < pri_b else rid_a
                                    with self._lock:
                                        cache = self._get_cache(factory_id)
                                        cache['alerts'].insert(0, {
                                            'severity': 'warning',
                                            'message': f'Proximity alert: {rid_a} and {rid_b} within {d:.1f}m — '
                                                       f'{slower_rid} slowing down',
                                            'timestamp': datetime.now(timezone.utc).isoformat(),
                                        })
                                        cache['alerts'] = cache['alerts'][:20]

                                        _maybe_publish_event('alert.raised', {
                                            'severity': 'warning',
                                            'message': f'Proximity alert: {rid_a} and {rid_b} within {d:.1f}m — '
                                                       f'{slower_rid} slowing down',
                                            'robot_id': rid_a if pri_a < pri_b else rid_b,
                                        }, tenant_id=1, factory_id=factory_id)

                            if d < COLLISION_DIST:
                                if pri_a < pri_b:
                                    self._robot_paused_until[rid_b] = now + COLLISION_PAUSE_S
                                else:
                                    self._robot_paused_until[rid_a] = now + COLLISION_PAUSE_S
                            elif d < PROXIMITY_DIST:
                                slower_rid = rid_b if pri_a < pri_b else rid_a
                                original = self._robot_speed.get(slower_rid, 0.3)
                                slowed = self._robot_speed.get(f'{slower_rid}_slowed', False)
                                if not slowed:
                                    self._robot_speed[slower_rid] = original * 0.4
                                    self._robot_speed[f'{slower_rid}_slowed'] = True
                            else:
                                for rid in (rid_a, rid_b):
                                    if self._robot_speed.get(f'{rid}_slowed', False):
                                        defaults = {'C3': 0.5, 'W2': 0.6, 'Q1': 0.4}
                                        self._robot_speed[rid] = defaults.get(rid, 0.3)
                                        self._robot_speed[f'{rid}_slowed'] = False

                # ---- Worker simulation (every WORKER_UPDATE_INTERVAL_S) ----
                if now - self._last_worker_update > WORKER_UPDATE_INTERVAL_S:
                    self._last_worker_update = now
                    for wkr_id, wkr_state in self._worker_positions.items():
                        if not wkr_state['active']:
                            continue
                        waypoints = wkr_state['waypoints']
                        if not waypoints:
                            continue
                        target_idx = wkr_state['target_idx']
                        target = waypoints[target_idx % len(waypoints)]
                        dx = target[0] - wkr_state['x']
                        dy = target[1] - wkr_state['y']
                        dist = math.hypot(dx, dy)
                        if dist < 0.15:
                            target_idx = (target_idx + 1) % len(waypoints)
                            wkr_state['target_idx'] = target_idx
                            target = waypoints[target_idx]
                            dx = target[0] - wkr_state['x']
                            dy = target[1] - wkr_state['y']
                            dist = math.hypot(dx, dy)
                        if dist > 0:
                            step = WORKER_SPEED * WORKER_UPDATE_INTERVAL_S
                            wkr_state['x'] += (dx / dist) * min(step, dist)
                        zone = wkr_state['zone']
                        bounds = WORKER_ZONE_BOUNDS.get(zone)
                        if bounds:
                            wkr_state['x'] = max(bounds['x_min'], min(bounds['x_max'], wkr_state['x']))
                            wkr_state['y'] = max(bounds['y_min'], min(bounds['y_max'], wkr_state['y']))

                # Write updates into cache snapshot
                with self._lock:
                    cache = self._get_cache(factory_id)
                    for r in cache['robots']:
                        rid = r['robot_id']
                        if rid in updates:
                            r['pose'] = updates[rid]['pose']
                            r['status'] = updates[rid]['status']
                        if rid in self._robot_moving:
                            moving = self._robot_moving[rid]
                            if not moving and r['status'] in ('moving', 'active'):
                                r['status'] = 'idle'
                        if rid in self._robot_tasks and self._robot_tasks[rid] is not None:
                            r['current_task'] = self._robot_tasks[rid]
                        elif rid in self._robot_tasks and self._robot_tasks[rid] is None:
                            r['current_task'] = None

                    # Sync worker positions into snapshot
                    for w in cache['workers']:
                        wid = w['worker_id']
                        if wid in self._worker_positions:
                            wp = self._worker_positions[wid]
                            w['x'] = wp['x']
                            w['y'] = wp['y']
                            w['active'] = wp['active']

                    cache['last_update'] = datetime.now(timezone.utc).isoformat()

                # Feature 42: Update heartbeat for registered robots on each tick
                with _registered_robots_lock:
                    for rid in self._robot_paths:
                        if rid in registered_robots:
                            registered_robots[rid]['last_heartbeat'] = (
                                datetime.now(timezone.utc).isoformat()
                            )

                # ── Periodic DB flush ──────────────────────────────────────
                if now - self._last_db_flush > DB_FLUSH_INTERVAL_S:
                    self._last_db_flush = now
                    # Fire-and-forget: flush to DB without blocking simulation
                    asyncio.ensure_future(self._flush_snapshot_to_db(factory_id))

                await asyncio.sleep(WHILE_SLEEP_S)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning('Movement simulation error: %s', exc, exc_info=True)
                await asyncio.sleep(WHILE_SLEEP_S)

    def update_from_sensor_event(self, event: dict[str, Any], factory_id: int = DEFAULT_FACTORY_ID):
        """Updates the store with data from a core-platform sensor event."""
        with self._lock:
            cache = self._get_cache(factory_id)
            cache['events_consumed'] += 1
            cache['last_update'] = datetime.now(timezone.utc).isoformat()

        _maybe_publish_event('telemetry.updated', {
            'event': event,
            'factory_id': factory_id,
        }, tenant_id=1, factory_id=factory_id)

    def update_from_prediction(self, prediction: dict[str, Any], factory_id: int = DEFAULT_FACTORY_ID):
        """Updates the store with data from an ai-service prediction event."""
        with self._lock:
            cache = self._get_cache(factory_id)
            cache['predictions_consumed'] += 1

            triggered: str | None = prediction.get('triggered_alert')

            if triggered == 'critical':
                cache['alerts'].insert(0, {
                    'severity': 'critical',
                    'message': f"ML alert: {prediction.get('prediction_type', 'unknown')}",
                    'timestamp': datetime.now(timezone.utc).isoformat(),
                })
            elif triggered == 'warning':
                cache['alerts'].insert(0, {
                    'severity': 'warning',
                    'message': f"ML warning: {prediction.get('prediction_type', 'unknown')}",
                    'timestamp': datetime.now(timezone.utc).isoformat(),
                })

            cache['alerts'] = cache['alerts'][:20]
            cache['last_update'] = datetime.now(timezone.utc).isoformat()

        if triggered:
            _maybe_publish_event('alert.raised', {
                'severity': triggered,
                'message': f"ML alert: {prediction.get('prediction_type', 'unknown')}",
                'source': 'ml-prediction',
            }, tenant_id=1, factory_id=factory_id)

    def update_from_ros2_snapshot(
        self,
        msg_data: dict[str, Any],
        factory_id: int = DEFAULT_FACTORY_ID,
    ):
        """
        Updates the store with real telemetry from the ROS2 bridge.

        Parses the JSON payload from the Redis stream message and overwrites
        robot poses with live Gazebo data. Falls back to simulated data for
        fields ROS2 doesn't provide.

        @param msg_data: Decoded Redis stream message fields.
        @param factory_id: Factory identifier for multi-tenant routing.
        """
        try:
            payload_raw: str = msg_data.get('payload', '{}')
            snapshot = json.loads(payload_raw) if isinstance(payload_raw, str) else payload_raw
            factory_id = int(msg_data.get('factory_id', factory_id))
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            logger.warning('Invalid ROS2 snapshot payload: %s', exc)
            return

        now = time.time()

        with self._lock:
            cache = self._get_cache(factory_id)

            for robot_data in snapshot.get('robots', []):
                rid = robot_data.get('robot_id')
                pose = robot_data.get('pose', {})

                # Update cache robots list
                for r in cache['robots']:
                    if r['robot_id'] == rid:
                        r['pose'] = pose
                        if 'status' in robot_data:
                            r['status'] = robot_data['status']
                        # Optional ROS2 fields
                        if 'battery' in robot_data:
                            r['battery'] = robot_data['battery']
                        if 'temperature' in robot_data:
                            r['temperature'] = robot_data['temperature']
                        break

                # Update robot fleet tracking
                if rid in self._robot_fleet:
                    self._robot_fleet[rid]['pose'] = pose
                    if 'status' in robot_data:
                        self._robot_fleet[rid]['status'] = robot_data['status']

                # If robot not yet tracked, add it
                if rid not in self._robot_fleet:
                    self._robot_fleet[rid] = {
                        'status': robot_data.get('status', 'moving'),
                        'uptime_pct': 100.0,
                        'pose': pose,
                    }
                    # Also add to movement tracking so simulation doesn't fight it
                    if rid not in self._robot_paths:
                        self._robot_paths[rid] = [(pose['x'], pose['y'])]
                        self._robot_waypoint_idx[rid] = 0
                        self._robot_speed[rid] = 0.5
                        self._robot_moving[rid] = True
                        self._robot_tasks[rid] = robot_data.get('current_task', 'ROS2 Task')
                        self._robot_paused_until[rid] = 0.0

            # Mark data source as live (ROS2)
            cache['data_source'] = 'ros2'
            cache['last_update'] = datetime.now(timezone.utc).isoformat()

        # Track freshness outside the lock
        self._last_ros2_update[factory_id] = now

        logger.debug(
            'ROS2 snapshot applied for factory %d (%d robots)',
            factory_id,
            len(snapshot.get('robots', [])),
        )

    def get_snapshot(self, factory_id: int = DEFAULT_FACTORY_ID) -> dict[str, Any]:
        """Returns a deep copy of the current telemetry snapshot for the factory."""
        with self._lock:
            cache = self._get_cache(factory_id)
            return copy.deepcopy(cache)

    def get_alerts(self, factory_id: int = DEFAULT_FACTORY_ID) -> list[dict[str, Any]]:
        """Returns the current alert list for the factory."""
        with self._lock:
            cache = self._get_cache(factory_id)
            return copy.deepcopy(cache.get('alerts', []))

    def get_robots(self, factory_id: int = DEFAULT_FACTORY_ID) -> list[dict[str, Any]]:
        """Returns the current robot status list for the factory."""
        with self._lock:
            cache = self._get_cache(factory_id)
            return copy.deepcopy(cache.get('robots', []))

    def get_workers(self, factory_id: int = DEFAULT_FACTORY_ID) -> list[dict[str, Any]]:
        """Returns the current worker list for the factory."""
        with self._lock:
            cache = self._get_cache(factory_id)
            return copy.deepcopy(cache.get('workers', []))

    def toggle_worker(self, worker_id: str, factory_id: int = DEFAULT_FACTORY_ID) -> dict[str, Any] | None:
        """Toggle a worker's active/inactive state."""
        with self._lock:
            if worker_id not in self._worker_positions:
                return None
            wp = self._worker_positions[worker_id]
            wp['active'] = not wp['active']
            new_active = wp['active']
            cache = self._get_cache(factory_id)
            for w in cache['workers']:
                if w['worker_id'] == worker_id:
                    w['active'] = new_active
                    break
            return {'worker_id': worker_id, 'active': new_active}

    # ── Feature 42: Robot Fleet Auto-Discovery ────────────────────────────────

    def register_robot(self, name: str, robot_type: str, factory_id: int = DEFAULT_FACTORY_ID) -> dict[str, Any]:
        """Register a new robot, auto-assigning an ID with a type prefix."""
        prefix = ROBOT_TYPE_PREFIX.get(robot_type, 'X')
        with _registered_robots_lock:
            _robot_sequence_counters.setdefault(prefix, 0)
            _robot_sequence_counters[prefix] += 1
            robot_id = f'{prefix}{_robot_sequence_counters[prefix]}'

            record: dict[str, Any] = {
                'robot_id': robot_id,
                'name': name,
                'type': robot_type,
                'status': 'offline',
                'registered_at': datetime.now(timezone.utc).isoformat(),
                'last_heartbeat': None,
            }
            registered_robots[robot_id] = record

            if robot_id not in self._robot_paths:
                path = [(random.uniform(1, 8), random.uniform(1, 7))
                        for _ in range(4)]
                self._robot_paths[robot_id] = path
                self._robot_waypoint_idx[robot_id] = 0
                self._robot_speed[robot_id] = random.uniform(0.3, 0.6)
                self._robot_moving[robot_id] = True
                self._robot_tasks[robot_id] = 'Auto-discovered'
                self._robot_paused_until[robot_id] = 0.0

                cache = self._get_cache(factory_id)
                cache['robots'].append({
                    'robot_id': robot_id,
                    'name': name,
                    'status': 'moving',
                    'uptime_pct': 100.0,
                    'current_task': 'Auto-discovered',
                    'pose': {'x': path[0][0], 'y': path[0][1], 'theta': 0.0},
                })
                self._robot_fleet[robot_id] = {
                    'status': 'moving',
                    'uptime_pct': 100.0,
                    'pose': {'x': path[0][0], 'y': path[0][1], 'theta': 0.0},
                }

        return dict(record)

    def unregister_robot(self, robot_id: str, factory_id: int = DEFAULT_FACTORY_ID) -> bool:
        """Remove a registered robot from the fleet."""
        with _registered_robots_lock:
            if robot_id not in registered_robots:
                return False
            del registered_robots[robot_id]

        with self._lock:
            self._robot_paths.pop(robot_id, None)
            self._robot_waypoint_idx.pop(robot_id, None)
            self._robot_speed.pop(robot_id, None)
            self._robot_moving.pop(robot_id, None)
            self._robot_tasks.pop(robot_id, None)
            self._robot_paused_until.pop(robot_id, None)
            self._robot_fleet.pop(robot_id, None)
            cache = self._get_cache(factory_id)
            cache['robots'] = [
                r for r in cache['robots']
                if r['robot_id'] != robot_id
            ]

        return True

    def record_heartbeat(self, robot_id: str, factory_id: int = DEFAULT_FACTORY_ID) -> bool:
        """Record a heartbeat for a registered robot."""
        with _registered_robots_lock:
            if robot_id not in registered_robots:
                return False
            registered_robots[robot_id]['last_heartbeat'] = (
                datetime.now(timezone.utc).isoformat()
            )
        return True

    def get_registered_robots(self, factory_id: int = DEFAULT_FACTORY_ID) -> list[dict[str, Any]]:
        """Return all registered robots with online/offline status computed."""
        now = datetime.now(timezone.utc)
        result: list[dict[str, Any]] = []
        with _registered_robots_lock:
            for rid, rec in registered_robots.items():
                rec_copy = dict(rec)
                hb = rec_copy.get('last_heartbeat')
                if hb is not None:
                    try:
                        hb_dt = datetime.fromisoformat(hb)
                        if (now - hb_dt).total_seconds() <= 30:
                            rec_copy['status'] = 'online'
                        else:
                            rec_copy['status'] = 'offline'
                    except (ValueError, TypeError):
                        rec_copy['status'] = 'offline'
                else:
                    rec_copy['status'] = 'offline'
                result.append(rec_copy)
        return result


# ── Feature 42: Auto-register the initial 3 robots on module load ──────────
_INITIAL_ROBOT_REGISTRATIONS: list[dict[str, str]] = [
    {'robot_id': 'C3', 'name': 'C3 Humanoid', 'type': 'humanoid'},
    {'robot_id': 'W2', 'name': 'W2 Welder Arm', 'type': 'welder'},
    {'robot_id': 'Q1', 'name': 'Q1 Inspector', 'type': 'inspector'},
]

with _registered_robots_lock:
    for _ir in _INITIAL_ROBOT_REGISTRATIONS:
        rid = _ir['robot_id']
        if rid not in registered_robots:
            prefix = rid[0]
            if prefix in _robot_sequence_counters:
                seq = int(rid[1:])
                if seq > _robot_sequence_counters[prefix]:
                    _robot_sequence_counters[prefix] = seq
            registered_robots[rid] = {
                'robot_id': rid,
                'name': _ir['name'],
                'type': _ir['type'],
                'status': 'online',
                'registered_at': datetime.now(timezone.utc).isoformat(),
                'last_heartbeat': datetime.now(timezone.utc).isoformat(),
            }


store: TelemetryStore = TelemetryStore()
