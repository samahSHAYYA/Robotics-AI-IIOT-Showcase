"""
@author: Samah SHAYYA
@description: Unit tests for in-memory TelemetryStore.
"""

import json
from app.store import TelemetryStore


def test_store_initial_snapshot():
    store = TelemetryStore()
    snap = store.get_snapshot()
    assert len(snap["robots"]) == 3
    assert len(snap["alerts"]) == 3
    assert snap["throughput"] > 0


def test_store_initial_robots():
    store = TelemetryStore()
    robots = store.get_robots()
    assert len(robots) == 3
    assert robots[0]["robot_id"] == "C3"


def test_store_update_from_sensor_event():
    store = TelemetryStore()
    before = store.get_snapshot()["events_consumed"]
    store.update_from_sensor_event({"event_type": "sensor.reading", "trace_id": "t1"})
    assert store.get_snapshot()["events_consumed"] == before + 1


def test_store_update_from_prediction_critical():
    store = TelemetryStore()
    before = store.get_snapshot()["predictions_consumed"]
    store.update_from_prediction({
        "prediction_type": "defect_detection",
        "triggered_alert": "critical",
    })
    snap = store.get_snapshot()
    assert snap["predictions_consumed"] == before + 1
    assert snap["alerts"][0]["severity"] == "critical"


def test_store_update_from_prediction_warning():
    store = TelemetryStore()
    store.update_from_prediction({
        "prediction_type": "maintenance_forecast",
        "triggered_alert": "warning",
    })
    snap = store.get_snapshot()
    assert snap["alerts"][0]["severity"] == "warning"


def test_store_alerts_rolling():
    store = TelemetryStore()
    for i in range(25):
        store.update_from_prediction({"prediction_type": f"type_{i}", "triggered_alert": "warning"})
    snap = store.get_snapshot()
    assert len(snap["alerts"]) == 20


def test_store_get_alerts():
    store = TelemetryStore()
    alerts = store.get_alerts()
    assert len(alerts) == 3


def test_store_get_robots():
    store = TelemetryStore()
    robots = store.get_robots()
    assert len(robots) == 3
    assert robots[1]["robot_id"] == "W2"


def test_store_json_serializable():
    store = TelemetryStore()
    snap = store.get_snapshot()
    dumped = json.dumps(snap)
    loaded = json.loads(dumped)
    assert loaded["throughput"] == 1248
    assert len(loaded["robots"]) == 3
