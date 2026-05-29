"""
@author: Samah SHAYYA
@description: Integration tests for ops-api REST routes.
"""

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_get_telemetry():
    resp = client.get("/api/v1/telemetry")
    assert resp.status_code == 200
    data = resp.json()
    assert "robots" in data
    assert "alerts" in data


def test_get_robot_status():
    resp = client.get("/api/v1/robot/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "robots" in data
    assert isinstance(data["robots"], list)


def test_send_command():
    resp = client.post("/api/v1/robot/command", json={
        "command": "safe-stop",
        "target": "C3",
        "params": {},
    })
    assert resp.status_code == 200
    assert resp.json()["status"] == "acknowledged"
    assert "trace_id" in resp.json()


def test_inspect():
    resp = client.post("/api/v1/inspect", json={
        "camera_id": "cam_main",
    })
    assert resp.status_code == 200
    assert resp.json()["status"] == "inspection triggered"
