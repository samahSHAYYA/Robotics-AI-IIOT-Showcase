"""
@author: Samah SHAYYA
@date: 28-May-2026

@description: In-memory telemetry store for the ops-api.
Holds the latest snapshot of sensor readings, robot states, alerts, and ML
predictions. Thread-safe via a lock since the Redis consumer runs in a
background task.
"""

import asyncio
import copy
import math
import threading

from datetime import datetime, timezone
from typing import Any


# Robot waypoint loops (closed loops in 0-10 coordinate space)
ROBOT_PATHS: dict[str, list[tuple[float, float]]] = {
    'C3': [(1, 1), (8, 1), (8, 5), (5, 8), (1, 5)],
    'W2': [(7, 2), (9, 7), (4, 9), (2, 4)],
    'Q1': [(3, 3), (6, 3), (6, 6), (3, 6)],
}

# Priority order for collision avoidance (highest first)
ROBOT_PRIORITY: list[str] = ['C3', 'W2', 'Q1']


class TelemetryStore:
    """
    Thread-safe in-memory store for the latest telemetry snapshot.

    The Redis consumer writes into this store; REST and WebSocket endpoints
    read from it.
    """

    def __init__(self):
        self._lock: threading.Lock = threading.Lock()
        self._data: dict[str, Any] = {
            'throughput': 1248,
            'defect_rate_pct': 1.7,
            'robot_uptime_pct': 99.2,
            'robots': [
                {'robot_id': 'C3', 'name': 'C3 Humanoid', 'status': 'moving',
                 'uptime_pct': 99.5, 'current_task': 'Assembly Line A',
                 'pose': {'x': 1.0, 'y': 1.0, 'theta': 0.0}},
                {'robot_id': 'W2', 'name': 'W2 Welder Arm', 'status': 'moving',
                 'uptime_pct': 97.2, 'current_task': 'Welding Station 3',
                 'pose': {'x': 7.0, 'y': 2.0, 'theta': 0.0}},
                {'robot_id': 'Q1', 'name': 'Q1 Inspector', 'status': 'moving',
                 'uptime_pct': 98.7, 'current_task': 'Visual Inspection',
                 'pose': {'x': 3.0, 'y': 3.0, 'theta': 0.0}},
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
            'last_update': datetime.now(timezone.utc).isoformat(),
        }
        self._robot_fleet: dict[str, dict[str, Any]] = {
            'C3': {'status': 'moving', 'uptime_pct': 99.5, 'pose': {'x': 1.0, 'y': 1.0, 'theta': 0.0}},
            'W2': {'status': 'moving', 'uptime_pct': 97.2, 'pose': {'x': 7.0, 'y': 2.0, 'theta': 0.0}},
            'Q1': {'status': 'moving', 'uptime_pct': 98.7, 'pose': {'x': 3.0, 'y': 3.0, 'theta': 0.0}},
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

    # --- Public movement control methods ---

    def start_robot(self, robot_id: str) -> bool:
        with self._lock:
            if robot_id not in self._robot_moving:
                return False
            self._robot_moving[robot_id] = True
            for r in self._data['robots']:
                if r['robot_id'] == robot_id:
                    r['status'] = 'moving'
            if robot_id in self._robot_fleet:
                self._robot_fleet[robot_id]['status'] = 'moving'
            return True

    def stop_robot(self, robot_id: str) -> bool:
        with self._lock:
            if robot_id not in self._robot_moving:
                return False
            self._robot_moving[robot_id] = False
            for r in self._data['robots']:
                if r['robot_id'] == robot_id:
                    r['status'] = 'idle'
            if robot_id in self._robot_fleet:
                self._robot_fleet[robot_id]['status'] = 'idle'
            return True

    def assign_task(self, robot_id: str, task: str) -> bool:
        with self._lock:
            if robot_id not in self._robot_tasks:
                return False
            self._robot_tasks[robot_id] = task
            for r in self._data['robots']:
                if r['robot_id'] == robot_id:
                    r['current_task'] = task
            if robot_id in self._robot_fleet:
                self._robot_fleet[robot_id]['current_task'] = task
            return True

    def get_robot_info(self, robot_id: str) -> dict[str, Any] | None:
        with self._lock:
            for r in self._data['robots']:
                if r['robot_id'] == robot_id:
                    return copy.deepcopy(r)
            return None

    def start_movement_simulation(self):
        """Public entry point to create the async movement task."""
        return asyncio.create_task(self._simulate_robot_movement())

    async def _simulate_robot_movement(self):
        """
        Background coroutine: every 500ms moves each robot toward its next
        waypoint, applies collision avoidance, and updates the snapshot.
        """
        WHILE_SLEEP_S = 0.5
        COLLISION_DIST = 0.8
        COLLISION_PAUSE_S = 1.0

        while True:
            try:
                now = datetime.now(timezone.utc).timestamp()
                updates: dict[str, dict[str, Any]] = {}
                current_poses: dict[str, dict[str, float]] = {}

                with self._lock:
                    for rid in self._robot_paths:
                        for r in self._data['robots']:
                            if r['robot_id'] == rid:
                                current_poses[rid] = dict(r['pose'])
                                break

                # Compute movement per robot
                for rid in self._robot_paths:
                    pose = current_poses.get(rid)
                    if pose is None:
                        continue

                    paused_until = self._robot_paused_until.get(rid, 0.0)
                    if now < paused_until:
                        continue

                    if not self._robot_moving.get(rid, False):
                        continue

                    path = self._robot_paths[rid]
                    idx = self._robot_waypoint_idx.get(rid, 0)
                    target = path[idx % len(path)]

                    dx = target[0] - pose['x']
                    dy = target[1] - pose['y']
                    dist = math.hypot(dx, dy)

                    speed = self._robot_speed.get(rid, 0.3)
                    step = speed * WHILE_SLEEP_S

                    if dist < 0.1:
                        idx = (idx + 1) % len(path)
                        self._robot_waypoint_idx[rid] = idx
                        target = path[idx % len(path)]
                        dx = target[0] - pose['x']
                        dy = target[1] - pose['y']
                        dist = math.hypot(dx, dy)

                    if dist > 0:
                        pose['x'] += (dx / dist) * min(step, dist)
                        pose['y'] += (dy / dist) * min(step, dist)

                    pose['theta'] = math.atan2(dy, dx)

                    updates[rid] = {'pose': pose, 'status': 'moving'}

                # Collision avoidance
                pose_list = list(current_poses.items())
                for i in range(len(pose_list)):
                    for j in range(i + 1, len(pose_list)):
                        rid_a, pa = pose_list[i]
                        rid_b, pb = pose_list[j]
                        d = math.hypot(pa['x'] - pb['x'], pa['y'] - pb['y'])
                        if d < COLLISION_DIST:
                            # Lower priority robot pauses
                            pri_a = ROBOT_PRIORITY.index(rid_a) if rid_a in ROBOT_PRIORITY else 99
                            pri_b = ROBOT_PRIORITY.index(rid_b) if rid_b in ROBOT_PRIORITY else 99
                            if pri_a < pri_b:
                                self._robot_paused_until[rid_b] = now + COLLISION_PAUSE_S
                            else:
                                self._robot_paused_until[rid_a] = now + COLLISION_PAUSE_S

                # Write updates into snapshot
                with self._lock:
                    for r in self._data['robots']:
                        rid = r['robot_id']
                        if rid in updates:
                            r['pose'] = updates[rid]['pose']
                            r['status'] = updates[rid]['status']
                        if rid in self._robot_moving:
                            moving = self._robot_moving[rid]
                            if not moving and r['status'] != 'idle':
                                r['status'] = 'idle'
                        if rid in self._robot_tasks and self._robot_tasks[rid] is not None:
                            r['current_task'] = self._robot_tasks[rid]
                    self._data['last_update'] = datetime.now(timezone.utc).isoformat()

                await asyncio.sleep(WHILE_SLEEP_S)
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(WHILE_SLEEP_S)

    def update_from_sensor_event(self, event: dict[str, Any]):
        """
        Updates the store with data from a core-platform sensor event.

        @param event: Parsed sensor event dict.
        """

        with self._lock:
            self._data['events_consumed'] += 1
            self._data['last_update'] = datetime.now(timezone.utc).isoformat()

    def update_from_prediction(self, prediction: dict[str, Any]):
        """
        Updates the store with data from an ai-service prediction event.

        @param prediction: Parsed ML prediction dict.
        """

        with self._lock:
            self._data['predictions_consumed'] += 1

            triggered: str | None = prediction.get('triggered_alert')

            if triggered == 'critical':
                self._data['alerts'].insert(0, {
                    'severity': 'critical',
                    'message': f"ML alert: {prediction.get('prediction_type', 'unknown')}",
                    'timestamp': datetime.now(timezone.utc).isoformat(),
                })
            elif triggered == 'warning':
                self._data['alerts'].insert(0, {
                    'severity': 'warning',
                    'message': f"ML warning: {prediction.get('prediction_type', 'unknown')}",
                    'timestamp': datetime.now(timezone.utc).isoformat(),
                })

            self._data['alerts'] = self._data['alerts'][:20]  # keep last 20
            self._data['last_update'] = datetime.now(timezone.utc).isoformat()

    def get_snapshot(self) -> dict[str, Any]:
        """
        Returns a copy of the current telemetry snapshot.

        @return snapshot: Deep copy of the current data dict.
        """

        with self._lock:
            return copy.deepcopy(self._data)

    def get_alerts(self) -> list[dict[str, Any]]:
        """
        Returns the current alert list.

        @return alerts: Copy of the alerts list.
        """

        with self._lock:
            return copy.deepcopy(self._data.get('alerts', []))

    def get_robots(self) -> list[dict[str, Any]]:
        """
        Returns the current robot status list.

        @return robots: Copy of the robots list.
        """

        with self._lock:
            return copy.deepcopy(self._data.get('robots', []))


store: TelemetryStore = TelemetryStore()
