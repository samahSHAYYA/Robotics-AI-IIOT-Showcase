"""
@author: Samah SHAYYA
@description: Integration tests for ops-api REST routes.
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.deps import get_current_user
from app.db import User
from app.auth import create_access_token

client = TestClient(app)

# Mock user used to override the get_current_user dependency
MOCK_USER = User(
    id=1,
    username='testadmin',
    role='admin',
    password_hash='$2b$12$fakehash',
)


async def _mock_get_current_user():
    return MOCK_USER


def _auth_header() -> dict[str, str]:
    """Returns an Authorization header with a valid Bearer token for the mock user."""
    token = create_access_token(data={'sub': 'testadmin', 'role': 'admin'})
    return {'Authorization': f'Bearer {token}'}


@pytest.fixture
def _auth_override():
    """Apply mock user override for tests that need authentication."""
    app.dependency_overrides[get_current_user] = _mock_get_current_user
    yield
    app.dependency_overrides.pop(get_current_user, None)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_get_telemetry(_auth_override):
    resp = client.get("/api/v1/telemetry", headers=_auth_header())
    assert resp.status_code == 200
    data = resp.json()
    assert "robots" in data
    assert "alerts" in data


def test_get_robot_status(_auth_override):
    resp = client.get("/api/v1/robots", headers=_auth_header())
    assert resp.status_code == 200
    data = resp.json()
    assert "robots" in data
    assert isinstance(data["robots"], list)


def test_register_robot(_auth_override):
    resp = client.post("/api/v1/robots/register", json={
        "name": "TestBot",
        "type": "humanoid",
    }, headers=_auth_header())
    assert resp.status_code == 201
    data = resp.json()
    assert "robot_id" in data
    assert data["name"] == "TestBot"


def test_inspect(_auth_override):
    resp = client.post("/api/v1/inspect", json={
        "camera_id": "cam_main",
    }, headers=_auth_header())
    assert resp.status_code == 200
    assert resp.json()["status"] == "inspection triggered"


def test_unauthorized_no_token():
    """Requests without a Bearer token should return 401."""
    resp = client.get("/api/v1/telemetry")
    assert resp.status_code == 401
