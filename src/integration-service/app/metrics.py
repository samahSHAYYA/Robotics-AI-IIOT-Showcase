"""
@author: AI Orchestrator
@date: 04-Jun-2026

@description: Prometheus metrics definitions for the integration service.
"""

from prometheus_client import Counter, Histogram

SYNC_COUNTER = Counter(
    'integration_sync_total',
    'Total syncs',
    ['integration_id', 'status'],
)

SYNC_DURATION = Histogram(
    'integration_sync_duration_seconds',
    'Sync duration in seconds',
    ['integration_id'],
)

EVENT_COUNTER = Counter(
    'integration_events_received_total',
    'Events received',
    ['event_type'],
)
