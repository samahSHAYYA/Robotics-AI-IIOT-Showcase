"""
@author: Samah SHAYYA
@description: Unit tests for mock ML inference module.
"""

import json
from app.inference import run_mock_inference


def test_inference_returns_prediction():
    result = run_mock_inference({"event_type": "sensor.reading"})
    assert "model_name" in result
    assert "prediction_type" in result
    assert "confidence" in result
    assert "result" in result


def test_inference_sensor_event_type():
    result = run_mock_inference({"event_type": "sensor.reading"})
    assert result["prediction_type"] == "maintenance_forecast"


def test_inference_camera_event_type():
    result = run_mock_inference({"event_type": "camera.frame"})
    assert result["prediction_type"] == "defect_detection"


def test_inference_default_type():
    result = run_mock_inference({})
    assert result["prediction_type"] in ("maintenance_forecast", "defect_detection")


def test_inference_has_confidence():
    result = run_mock_inference({"event_type": "sensor.reading"})
    assert 0.0 <= result["confidence"] <= 1.0


def test_inference_triggered_alert_none():
    result = run_mock_inference({"event_type": "sensor.reading"})
    assert result["triggered_alert"] in (None, "warning", "critical")


def test_inference_result_has_health_score():
    result = run_mock_inference({"event_type": "sensor.reading"})
    assert "health_score" in result["result"] or "days_to_maintenance" in result["result"]


def test_inference_result_has_defects():
    result = run_mock_inference({"event_type": "camera.frame"})
    assert "defects_found" in result["result"] or "inspection_pass" in result["result"]


def test_inference_json_roundtrip():
    result = run_mock_inference({"event_type": "sensor.reading"})
    dumped = json.dumps(result)
    loaded = json.loads(dumped)
    assert loaded["event_type"] == "ml.prediction"
    assert loaded["confidence"] == result["confidence"]
