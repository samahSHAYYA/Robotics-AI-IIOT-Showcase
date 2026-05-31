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
    resp = client.get("/api/v1/robots")
    assert resp.status_code == 200
    data = resp.json()
    assert "robots" in data
    assert isinstance(data["robots"], list)


def test_register_robot():
    resp = client.post("/api/v1/robots/register", json={
        "name": "TestBot",
        "type": "humanoid",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert "robot_id" in data
    assert data["name"] == "TestBot"


def test_inspect():
    resp = client.post("/api/v1/inspect", json={
        "camera_id": "cam_main",
    })
    assert resp.status_code == 200
    assert resp.json()["status"] == "inspection triggered"
