"""
@author: Samah SHAYYA
@date: 28-May-2026

@description: In-memory telemetry store for the ops-api.
Holds the latest snapshot of sensor readings, robot states, alerts, and ML
predictions. Thread-safe via a lock since the Redis consumer runs in a
background task.
"""

import copy
import threading

from datetime import datetime
from typing import Any, Dict, List, Optional


class TelemetryStore:
    """
    Thread-safe in-memory store for the latest telemetry snapshot.

    The Redis consumer writes into this store; REST and WebSocket endpoints
    read from it.
    """

    def __init__(self):
        self._lock: threading.Lock = threading.Lock()
        self._data: Dict[str, Any] = {
            'throughput': 1248,
            'defect_rate_pct': 1.7,
            'robot_uptime_pct': 99.2,
            'robots': [
                {'robot_id': 'C3', 'name': 'C3 Humanoid', 'status': 'active',
                 'uptime_pct': 99.5, 'current_task': 'Assembly Line A'},
                {'robot_id': 'W2', 'name': 'W2 Welder Arm', 'status': 'maintenance',
                 'uptime_pct': 94.1, 'current_task': None},
                {'robot_id': 'Q1', 'name': 'Q1 Inspector', 'status': 'active',
                 'uptime_pct': 98.7, 'current_task': 'Vision QA Line C'},
            ],
            'alerts': [
                {'severity': 'healthy', 'message': 'Safety gate pass',
                 'timestamp': datetime.utcnow().isoformat()},
                {'severity': 'warning', 'message': 'Camera re-focus needed',
                 'timestamp': datetime.utcnow().isoformat()},
                {'severity': 'critical', 'message': 'Bearing temp high on C3',
                 'timestamp': datetime.utcnow().isoformat()},
            ],
            'events_consumed': 0,
            'predictions_consumed': 0,
            'last_update': datetime.utcnow().isoformat(),
        }
        self._robot_fleet: Dict[str, Dict[str, Any]] = {
            'C3': {'status': 'active', 'uptime_pct': 99.5},
            'W2': {'status': 'maintenance', 'uptime_pct': 94.1},
            'Q1': {'status': 'active', 'uptime_pct': 98.7},
        }

    def update_from_sensor_event(self, event: Dict[str, Any]):
        """
        Updates the store with data from a core-platform sensor event.

        @param event: Parsed sensor event dict.
        """

        with self._lock:
            self._data['events_consumed'] += 1
            self._data['last_update'] = datetime.utcnow().isoformat()

    def update_from_prediction(self, prediction: Dict[str, Any]):
        """
        Updates the store with data from an ai-service prediction event.

        @param prediction: Parsed ML prediction dict.
        """

        with self._lock:
            self._data['predictions_consumed'] += 1

            triggered: Optional[str] = prediction.get('triggered_alert')

            if triggered == 'critical':
                self._data['alerts'].insert(0, {
                    'severity': 'critical',
                    'message': f"ML alert: {prediction.get('prediction_type', 'unknown')}",
                    'timestamp': datetime.utcnow().isoformat(),
                })
            elif triggered == 'warning':
                self._data['alerts'].insert(0, {
                    'severity': 'warning',
                    'message': f"ML warning: {prediction.get('prediction_type', 'unknown')}",
                    'timestamp': datetime.utcnow().isoformat(),
                })

            self._data['alerts'] = self._data['alerts'][:20]  # keep last 20
            self._data['last_update'] = datetime.utcnow().isoformat()

    def get_snapshot(self) -> Dict[str, Any]:
        """
        Returns a copy of the current telemetry snapshot.

        @return snapshot: Deep copy of the current data dict.
        """

        with self._lock:
            return copy.deepcopy(self._data)

    def get_alerts(self) -> List[Dict[str, Any]]:
        """
        Returns the current alert list.

        @return alerts: Copy of the alerts list.
        """

        with self._lock:
            return copy.deepcopy(self._data.get('alerts', []))

    def get_robots(self) -> List[Dict[str, Any]]:
        """
        Returns the current robot status list.

        @return robots: Copy of the robots list.
        """

        with self._lock:
            return copy.deepcopy(self._data.get('robots', []))


store: TelemetryStore = TelemetryStore()
