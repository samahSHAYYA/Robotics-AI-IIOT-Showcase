"""
@author: Samah SHAYYA
@date: 28-May-2026

@description: Mock ML inference functions for the showcase.
Produces canned predictions for sensor and camera events.
"""

import random

from typing import Any, Dict


def _mock_defect_detection() -> Dict[str, Any]:
    """
    Simulates a computer vision defect detection result.

    @return result: Dict with defect count and confidence.
    """

    return {
        'defects_found': random.randint(0, 3),
        'confidence': round(random.uniform(0.85, 0.99), 3),
        'inspection_pass': random.random() > 0.15,
    }


def _mock_maintenance_forecast() -> Dict[str, Any]:
    """
    Simulates a predictive maintenance score for a motor or bearing.

    @return result: Dict with health score and days to maintenance.
    """

    health: float = round(random.uniform(60.0, 100.0), 1)

    return {
        'health_score': health,
        'days_to_maintenance': max(0, int((health - 50) * 2)),
        'risk_level': 'low' if health > 80 else 'medium' if health > 60 else 'high',
    }


PREDICTION_TYPE_MAP: Dict[str, str] = {
    'camera.frame': 'defect_detection',
    'sensor.reading': 'maintenance_forecast',
}

MODEL_NAME_MAP: Dict[str, str] = {
    'defect_detection': 'cv_inspector_v12',
    'maintenance_forecast': 'tcn_motor_health_v7',
}

INFERENCE_FN_MAP = {
    'defect_detection': _mock_defect_detection,
    'maintenance_forecast': _mock_maintenance_forecast,
}


def run_mock_inference(event_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Runs mock inference on a single event payload.

    @param event_data: Raw event fields from Redis stream.

    @return prediction: Dict with model_name, prediction_type, confidence, result.
    """

    event_type: str = event_data.get('event_type', 'sensor.reading')
    prediction_type: str = PREDICTION_TYPE_MAP.get(event_type, 'maintenance_forecast')
    model_name: str = MODEL_NAME_MAP.get(prediction_type, 'default-model')
    infer_fn = INFERENCE_FN_MAP.get(prediction_type, _mock_maintenance_forecast)

    result: Dict[str, Any] = infer_fn()
    confidence: float = result.get('confidence', round(random.uniform(0.7, 0.99), 3))

    triggered_alert: str | None = None

    if prediction_type == 'defect_detection' and result.get('defects_found', 0) > 2:
        triggered_alert = 'critical'
    elif prediction_type == 'maintenance_forecast' and result.get('health_score', 100) < 60:
        triggered_alert = 'warning'

    return {
        'event_type': 'ml.prediction',
        'model_name': model_name,
        'prediction_type': prediction_type,
        'confidence': confidence,
        'result': result,
        'triggered_alert': triggered_alert,
    }
