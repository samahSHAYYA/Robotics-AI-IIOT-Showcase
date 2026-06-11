"""
@author: Samah SHAYYA
@description: Unit tests for shared Pydantic schemas.
"""

import json

from schemas.events import (
    SensorEvent, SensorReading, SafetyEvent, CameraEvent, MLPrediction, CommandEvent,
)
from schemas.telemetry import RobotStatus, TelemetrySnapshot


def test_sensor_event_with_readings():
    ev = SensorEvent(
        trace_id="trace-001",
        readings=[
            SensorReading(
                sensor_type="temperature",
                sensor_id="temp-01",
                measure="temperature",
                value=45.2,
                unit="°C",
            )
        ],
    )
    d = json.loads(ev.model_dump_json())
    assert d["trace_id"] == "trace-001"
    assert d["readings"][0]["value"] == 45.2
    assert d["event_type"] == "sensor.reading"


def test_safety_event_critical():
    ev = SafetyEvent(trace_id="trace-002", safe_state="critical", details="Emergency stop")
    assert ev.safe_state == "critical"
    assert ev.details == "Emergency stop"


def test_safety_event_defaults():
    ev = SafetyEvent(trace_id="trace-003", safe_state="healthy")
    assert ev.details is None


def test_camera_event():
    ev = CameraEvent(trace_id="trace-004", camera_id="cam-main", frame_id="frame-001")
    assert ev.camera_id == "cam-main"
    assert ev.width == 640
    assert ev.height == 480


def test_ml_prediction():
    pred = MLPrediction(
        trace_id="trace-005",
        model_name="cv_inspector_v12",
        prediction_type="defect_detection",
        confidence=0.95,
        result={"defect": True, "location": "joint_3"},
    )
    assert pred.confidence == 0.95
    assert pred.model_name == "cv_inspector_v12"
    assert pred.triggered_alert is None


def test_ml_prediction_with_alert():
    pred = MLPrediction(
        trace_id="trace-006",
        model_name="temp_monitor",
        prediction_type="anomaly",
        confidence=0.88,
        triggered_alert="warning",
    )
    assert pred.triggered_alert == "warning"


def test_command_event():
    cmd = CommandEvent(trace_id="trace-007", command="safe-stop", target="C3")
    assert cmd.command == "safe-stop"
    assert cmd.target == "C3"
    assert cmd.params == {}


def test_command_event_with_params():
    cmd = CommandEvent(
        trace_id="trace-008",
        command="move",
        target="W2",
        params={"speed": 0.5, "angle": 90},
    )
    assert cmd.params["speed"] == 0.5


def test_robot_status():
    status = RobotStatus(
        robot_id="C3",
        name="C3 Humanoid",
        status="active",
        uptime_pct=99.5,
    )
    assert status.status == "active"
    assert status.current_task is None
    assert status.joint_angles == {}


def test_robot_status_with_joints():
    status = RobotStatus(
        robot_id="W2",
        name="W2 Welder",
        status="active",
        uptime_pct=95.0,
        current_task="Welding",
        joint_angles={"joint_1": 0.0, "joint_2": 45.0},
    )
    assert status.current_task == "Welding"
    assert status.joint_angles["joint_2"] == 45.0


def test_telemetry_snapshot():
    snap = TelemetrySnapshot()
    assert snap.throughput == 0
    assert snap.defect_rate_pct == 0.0
    assert snap.robots == []
    assert snap.alerts == []


def test_telemetry_snapshot_with_data():
    robot = RobotStatus(robot_id="C3", name="C3 Humanoid", status="active", uptime_pct=99.5)
    snap = TelemetrySnapshot(
        throughput=1200,
        defect_rate_pct=1.5,
        robot_uptime_pct=98.0,
        robots=[robot],
        alerts=[{"severity": "warning", "message": "Temp high"}],
    )
    assert snap.throughput == 1200
    assert len(snap.robots) == 1
    assert snap.robots[0].robot_id == "C3"
    assert len(snap.alerts) == 1


def test_json_roundtrip():
    ev = SensorEvent(
        trace_id="trace-009",
        readings=[SensorReading(sensor_type="vibration", sensor_id="vib-01", measure="vibration", value=2.5, unit="mm/s")],
    )
    d = json.loads(ev.model_dump_json())
    restored = SensorEvent.model_validate(d)
    assert restored.trace_id == ev.trace_id
    assert restored.readings[0].value == 2.5
