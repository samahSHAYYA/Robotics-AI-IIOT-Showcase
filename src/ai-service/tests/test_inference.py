"""
@author: Samah SHAYYA
@description: Unit tests for mock ML inference module.
"""

import asyncio
import json

from app.consumer import process_message
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


def test_process_message_accepts_allowed_event_types():
    """
    Verify that process_message accepts both sensor.reading and camera.frame
    event types and returns a prediction dict, while rejecting unknown types.
    """

    async def _run():
        sensor_result = await process_message({"event_type": "sensor.reading"})
        camera_result = await process_message({"event_type": "camera.frame"})
        unknown_result = await process_message({"event_type": "robot.jog"})

        return sensor_result, camera_result, unknown_result

    sensor_result, camera_result, unknown_result = asyncio.run(_run())

    # Allowed types must yield a prediction dict
    assert sensor_result is not None, "sensor.reading should be accepted"
    assert "model_name" in sensor_result
    assert "defect_detection" in camera_result.get("prediction_type", "") or \
        "maintenance_forecast" in camera_result.get("prediction_type", "")
    assert camera_result is not None, "camera.frame should be accepted"
    assert "model_name" in camera_result

    # Unknown event type must be rejected
    assert unknown_result is None, "robot.jog should be rejected"
