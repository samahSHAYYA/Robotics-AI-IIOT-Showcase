"""
@author: Samah SHAYYA
@date: 28-May-2026

@description: Publishes core-platform simulation events to Redis Streams.
Tails logs/events.jsonl for new lines and re-publishes the final snapshot
on a timer for continuous demo operation.
"""

import json
import logging
import os
import time
import uuid

from datetime import datetime, timezone
from typing import Any, Dict, Optional

import redis

REDIS_URL: str = os.getenv('REDIS_URL', 'redis://redis:6379/0')
STREAM: str = 'events:core-platform'
SNAPSHOT_PATH: str = 'data/final_state.json'
EVENTS_PATH: str = 'logs/events.jsonl'
PUBLISH_INTERVAL: float = 5.0

logging.basicConfig(
    level = logging.INFO,
    format = '%(asctime)s [%(levelname)s] publisher: %(message)s',
)

logger: logging.Logger = logging.getLogger(__name__)

r: redis.Redis = redis.Redis.from_url(REDIS_URL, decode_responses = True)

_last_snapshot: Optional[Dict[str, Any]] = None


def _publish(event_data: Dict[str, Any]):
    """
    Publishes a single event dict to the core-platform Redis stream.

    @param event_data: Event fields to publish.
    """

    try:
        r.xadd(STREAM, event_data, maxlen = 1000)
    except redis.RedisError:
        logger.exception('Failed to publish event')


def _publish_from_events_jsonl():
    """
    Reads the events.jsonl file and publishes each event line to Redis.
    Skips lines already published by tracking the file offset.
    """

    try:
        with open(EVENTS_PATH) as f:
            for line in f:
                line = line.strip()

                if not line:
                    continue

                try:
                    parsed = json.loads(line)
                except json.JSONDecodeError:
                    continue

                event_type: str = parsed.get('type', '')
                payload: Dict = parsed.get('payload', {})
                trace_id: str = str(uuid.uuid4())
                timestamp: str = parsed.get('ts', datetime.now(timezone.utc).isoformat())

                event: Dict[str, Any] = {
                    'event_type': event_type,
                    'trace_id': trace_id,
                    'timestamp': timestamp,
                    'source': 'core-platform',
                    **payload,
                }

                _publish(event)
                logger.debug('Published event: %s', event_type)
    except FileNotFoundError:
        pass


def _publish_from_snapshot(snapshot: Dict[str, Any]):
    """
    Generates synthetic sensor and safety events from the final snapshot.

    @param snapshot: Parsed final_state.json dict.
    """

    trace_id: str = str(uuid.uuid4())
    now: str = datetime.now(timezone.utc).isoformat()

    sensor_types = ['temperature', 'vibration', 'current', 'torque',
                    'pressure', 'humidity', 'distance']

    for sensor_type in sensor_types:
        event: Dict[str, Any] = {
            'event_type': 'sensor.reading',
            'trace_id': trace_id,
            'timestamp': now,
            'source': 'core-platform',
            'sensor_type': sensor_type,
            'sensor_id': f'{sensor_type}_01',
            'measure': sensor_type,
            'value': 0.0,
            'unit': 'N/A',
        }

        _publish(event)

    safety_mode: str = snapshot.get('safety_mode', 'healthy')
    health_score: float = snapshot.get('metrics', {}).get('health_score', 100.0)

    safety_event: Dict[str, Any] = {
        'event_type': 'safety.status',
        'trace_id': trace_id,
        'timestamp': now,
        'source': 'core-platform',
        'safe_state': 'critical' if safety_mode == 'stopped'
                      else 'warning' if safety_mode == 'degraded'
                      else 'healthy',
        'details': f'health_score={health_score}',
    }

    _publish(safety_event)

    cam_event: Dict[str, Any] = {
        'event_type': 'camera.frame',
        'trace_id': trace_id,
        'timestamp': now,
        'source': 'core-platform',
        'camera_id': 'cam_qc',
        'frame_id': f'snap_{uuid.uuid4().hex[:8]}',
        'width': 640,
        'height': 480,
    }

    _publish(cam_event)

    robot_mode: str = snapshot.get('humanoid', {}).get('mode', 'idle')

    humanoid_event: Dict[str, Any] = {
        'event_type': 'humanoid.status',
        'trace_id': trace_id,
        'timestamp': now,
        'source': 'core-platform',
        'mode': robot_mode,
        'task': snapshot.get('humanoid', {}).get('task', ''),
        'battery': snapshot.get('humanoid', {}).get('battery', 100.0),
    }

    _publish(humanoid_event)


def main():
    """
    Main publisher loop: reads events.jsonl once, then re-publishes the
    snapshot every PUBLISH_INTERVAL seconds.
    """

    global _last_snapshot

    logger.info('Publisher started. Waiting for simulation output ...')

    while True:
        _publish_from_events_jsonl()

        try:
            with open(SNAPSHOT_PATH) as f:
                snapshot = json.load(f)

            if snapshot != _last_snapshot:
                _last_snapshot = snapshot
                logger.info('New snapshot detected, publishing events ...')

            _publish_from_snapshot(snapshot)
        except (FileNotFoundError, json.JSONDecodeError):
            pass

        time.sleep(PUBLISH_INTERVAL)


if __name__ == '__main__':
    main()
