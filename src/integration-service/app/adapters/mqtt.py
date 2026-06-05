"""
@author: AI Orchestrator
@date: 04-Jun-2026

@description: MQTT adapter for the integration service. Subscribes to
MQTT topics to receive IoT sensor data from factory-floor devices.
"""

import json
import logging
import random
from datetime import datetime, timezone
from typing import Any

from app.adapters.base import BaseAdapter

logger = logging.getLogger(__name__)

try:
    import asyncio_mqtt as aiomqtt
    _MQTT_AVAILABLE = True
except ImportError:
    _MQTT_AVAILABLE = False
    logger.warning('asyncio-mqtt not installed — MQTT adapter will use mock mode')


class MqttAdapter(BaseAdapter):
    """
    Adapter for MQTT broker connections.

    Connects to an MQTT broker, subscribes to topics, and collects
    messages for processing. Supports configurable QoS and topic filters.
    """

    async def test_connection(self, config: dict[str, Any]) -> bool:
        """
        Test connection to an MQTT broker.

        @param config: Must contain 'base_url' (mqtt://host:port).
        @return: True if connection succeeded.
        """
        broker = config.get('base_url', 'mqtt://localhost:1883')
        try:
            if _MQTT_AVAILABLE:
                async with aiomqtt.Client(broker) as client:
                    await client.ping()
                return True
            else:
                if broker.startswith('mqtt://') or broker.startswith('tcp://'):
                    logger.info('MQTT mock test OK: %s', broker)
                    return True
                return False
        except Exception as exc:
            logger.warning('MQTT test connection failed: %s', exc)
            return False

    async def fetch_data(
        self,
        config: dict[str, Any],
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """
        Fetch data from MQTT topics.

        @param config: Must contain 'base_url', 'topics' (list of topic strings).
        @param params: Optional query/filter parameters (unused in MQTT adapter).
        @return: List of dicts with topic, payload, timestamp.
        """
        broker = config.get('base_url', 'mqtt://localhost:1883')
        topics = config.get('topics', ['factory/temperature', 'factory/pressure', 'factory/speed'])
        results = []

        try:
            if _MQTT_AVAILABLE:
                async with aiomqtt.Client(broker) as client:
                    for topic in topics:
                        try:
                            await client.subscribe(topic)
                            async with client.messages() as messages:
                                async for message in messages:
                                    results.append({
                                        'topic': message.topic.value,
                                        'payload': message.payload.decode(),
                                        'timestamp': datetime.now(timezone.utc).isoformat(),
                                    })
                                    break  # One sample per topic
                        except Exception as exc:
                            logger.warning('MQTT topic %s error: %s', topic, exc)
            else:
                # Mock: return simulated sensor readings
                for topic in topics:
                    sensor_type = topic.split('/')[-1]
                    mock_values = {
                        'temperature': round(random.uniform(20, 35), 1),
                        'pressure': round(random.uniform(0.5, 2.0), 2),
                        'speed': round(random.uniform(100, 500), 1),
                        'humidity': round(random.uniform(40, 80), 1),
                        'vibration': round(random.uniform(0.1, 5.0), 2),
                    }
                    value = mock_values.get(sensor_type, random.random())
                    results.append({
                        'topic': topic,
                        'payload': json.dumps({'value': value, 'unit': sensor_type}),
                        'timestamp': datetime.now(timezone.utc).isoformat(),
                    })
                logger.info('MQTT mock fetch: %d topics from %s', len(topics), broker)
        except Exception as exc:
            logger.error('MQTT fetch failed: %s', exc)

        return results

    async def push_data(
        self,
        config: dict[str, Any],
        data: list[dict[str, Any]],
    ) -> int:
        """
        Publish data to an MQTT topic.

        @param config: Must contain 'base_url' and 'topic'.
        @param data: List of records to publish.
        @return: Number of records published.
        """
        broker = config.get('base_url', 'mqtt://localhost:1883')
        topic = config.get('topic', 'factory/command')
        count = 0

        try:
            if _MQTT_AVAILABLE:
                async with aiomqtt.Client(broker) as client:
                    for record in data:
                        payload = json.dumps(record)
                        await client.publish(topic, payload)
                        count += 1
            else:
                count = len(data)
                logger.info('MQTT mock push: %d records to %s/%s', count, broker, topic)
        except Exception as exc:
            logger.error('MQTT push failed: %s', exc)

        return count
