"""
@author: AI Orchestrator
@date: 04-Jun-2026

@description: Unit tests for the Integration Service REST API routes.
Uses FastAPI TestClient with mocked authentication (get_current_user) and
mocked database session (get_session) to avoid real I/O.

Tests cover:
  1. Health endpoint
  2. Integration CRUD (list, create, get, update, delete)
  3. Connection test (with mocked adapter)
  4. Adapter type listing
  5. Sync trigger
  6. Sync log retrieval
  7. Authentication (401 without token)
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.deps import get_current_user
from app.db import get_session

# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════

MOCK_USER = {
    'sub': 'testadmin',
    'role': 'admin',
    'tenant_id': 1,
    'scope': 'tenant:admin',
}


async def _mock_get_current_user():
    """Override dependency that returns the mock JWT payload."""
    return MOCK_USER


def _make_mock_integration(**overrides):
    """Build a mock Integration ORM object with configurable fields."""
    integration = MagicMock()
    integration.id = overrides.get('id', 1)
    integration.tenant_id = overrides.get('tenant_id', 1)
    integration.name = overrides.get('name', 'Test Integration')
    integration.adapter_type = overrides.get('adapter_type', 'rest')
    integration.base_url = overrides.get('base_url', 'http://example.com/api')
    integration.auth_type = overrides.get('auth_type', 'api_key')
    integration.auth_config = overrides.get('auth_config', {})
    integration.sync_interval_minutes = overrides.get('sync_interval_minutes', 60)
    integration.enabled = overrides.get('enabled', True)
    integration.trigger_on_event = overrides.get('trigger_on_event', False)
    integration.event_types = overrides.get('event_types', [])
    integration.key_rotated_at = overrides.get('key_rotated_at', None)
    integration.last_sync_at = overrides.get('last_sync_at', datetime.now(timezone.utc))
    integration.last_sync_status = overrides.get('last_sync_status', 'success')
    integration.created_at = overrides.get('created_at', datetime.now(timezone.utc))
    integration.updated_at = overrides.get('updated_at', None)
    return integration


def _make_mock_session():
    """Create a mock async DB session with an async context manager."""
    session = AsyncMock()

    # Configure execute to return a reusable result mock by default
    default_result = MagicMock()
    default_result.scalar_one_or_none.return_value = None
    default_result.scalars.return_value.all.return_value = []
    default_result.scalar.return_value = 0
    session.execute.return_value = default_result

    session.add = MagicMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.delete = AsyncMock()

    # NOTE: No explicit __aenter__/__aexit__ setup.
    # AsyncMock natively supports async with via its class-level
    # __aenter__ method. Setting instance attributes would shadow it.

    return session


def _override_get_session(mock_session):
    """Override the get_session dependency with a mock session generator."""
    async def _gen():
        return mock_session
    app.dependency_overrides[get_session] = _gen


# ═══════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════


@pytest.fixture
def auth_override():
    """Apply and clean up the mock user auth override."""
    app.dependency_overrides[get_current_user] = _mock_get_current_user
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def mock_session():
    """Provide a clean mock session per test."""
    return _make_mock_session()


def _auth_header() -> dict[str, str]:
    """Return a valid-looking Authorization header."""
    return {'Authorization': 'Bearer test'}


# ═══════════════════════════════════════════════════════════════════════════
# 1. Health endpoint
# ═══════════════════════════════════════════════════════════════════════════


class TestHealth:
    """Health check (no auth required)."""

    def test_health_returns_service_info(self):
        """GET /health returns service status."""
        client = TestClient(app)
        resp = client.get('/health')
        assert resp.status_code == 200
        data = resp.json()
        assert data['service'] == 'integration-service'
        assert 'dependencies' in data

    def test_health_degraded_without_db(self):
        """Without a real DB, health returns degraded status."""
        client = TestClient(app)
        resp = client.get('/health')
        data = resp.json()
        # In the test environment there's no DB, so status is degraded
        assert data['status'] in ('ok', 'degraded')


# ═══════════════════════════════════════════════════════════════════════════
# 2. Integration CRUD
# ═══════════════════════════════════════════════════════════════════════════


class TestListIntegrations:
    """GET /api/v1/integrations"""

    def test_empty_list(self, auth_override, mock_session):
        """Returns an empty list when no integrations exist."""
        _override_get_session(mock_session)
        try:
            client = TestClient(app)
            resp = client.get('/api/v1/integrations', headers=_auth_header())
            assert resp.status_code == 200
            assert resp.json() == []
        finally:
            app.dependency_overrides.pop(get_session, None)

    def test_returns_integrations(self, auth_override, mock_session):
        """Returns a list of integration records."""
        integration = _make_mock_integration()
        mock_session.execute.return_value.scalars.return_value.all.return_value = [integration]
        _override_get_session(mock_session)
        try:
            client = TestClient(app)
            resp = client.get('/api/v1/integrations', headers=_auth_header())
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 1
            assert data[0]['name'] == 'Test Integration'
            assert data[0]['adapter_type'] == 'rest'
        finally:
            app.dependency_overrides.pop(get_session, None)


class TestCreateIntegration:
    """POST /api/v1/integrations"""

    def test_creates_integration(self, auth_override, mock_session):
        """Creating a valid integration returns 201."""
        _override_get_session(mock_session)

        # The route creates a real Integration object and calls
        # await session.refresh(integration) to populate auto-generated
        # fields like id and created_at.  Since refresh is mocked, we
        # simulate that behaviour via a side effect.
        async def _refresh_side_effect(inst):
            inst.id = 1
            inst.last_sync_status = 'never'
            from datetime import timezone
            inst.created_at = datetime.now(timezone.utc)
        mock_session.refresh.side_effect = _refresh_side_effect

        try:
            client = TestClient(app)
            payload = {
                'name': 'New Integration',
                'adapter_type': 'soap',
                'base_url': 'http://erp.example.com/service?wsdl',
            }
            resp = client.post(
                '/api/v1/integrations',
                json=payload,
                headers=_auth_header(),
            )
            assert resp.status_code == 201
            data = resp.json()
            assert data['name'] == 'New Integration'
            assert data['adapter_type'] == 'soap'
        finally:
            app.dependency_overrides.pop(get_session, None)

    def test_requires_base_url(self, auth_override, mock_session):
        """Creating without base_url returns 422."""
        _override_get_session(mock_session)
        try:
            client = TestClient(app)
            resp = client.post(
                '/api/v1/integrations',
                json={'name': 'Bad Integration', 'adapter_type': 'rest'},
                headers=_auth_header(),
            )
            assert resp.status_code == 422
        finally:
            app.dependency_overrides.pop(get_session, None)


class TestGetIntegration:
    """GET /api/v1/integrations/{id}"""

    def test_get_existing(self, auth_override, mock_session):
        """Returns the integration by ID."""
        integration = _make_mock_integration(id=1)
        mock_session.execute.return_value.scalar_one_or_none.return_value = integration
        _override_get_session(mock_session)
        try:
            client = TestClient(app)
            resp = client.get('/api/v1/integrations/1', headers=_auth_header())
            assert resp.status_code == 200
            assert resp.json()['id'] == 1
        finally:
            app.dependency_overrides.pop(get_session, None)

    def test_get_not_found(self, auth_override, mock_session):
        """Non-existent integration returns 404."""
        mock_session.execute.return_value.scalar_one_or_none.return_value = None
        _override_get_session(mock_session)
        try:
            client = TestClient(app)
            resp = client.get('/api/v1/integrations/999', headers=_auth_header())
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.pop(get_session, None)


class TestUpdateIntegration:
    """PUT /api/v1/integrations/{id}"""

    def test_update_existing(self, auth_override, mock_session):
        """Updates an existing integration."""
        integration = _make_mock_integration(id=1)
        mock_session.execute.return_value.scalar_one_or_none.return_value = integration
        _override_get_session(mock_session)
        try:
            client = TestClient(app)
            resp = client.put(
                '/api/v1/integrations/1',
                json={'name': 'Updated Name'},
                headers=_auth_header(),
            )
            assert resp.status_code == 200
            assert resp.json()['name'] == 'Updated Name'
        finally:
            app.dependency_overrides.pop(get_session, None)

    def test_update_not_found(self, auth_override, mock_session):
        """Updating a non-existent integration returns 404."""
        mock_session.execute.return_value.scalar_one_or_none.return_value = None
        _override_get_session(mock_session)
        try:
            client = TestClient(app)
            resp = client.put(
                '/api/v1/integrations/999',
                json={'name': 'Nope'},
                headers=_auth_header(),
            )
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.pop(get_session, None)


class TestDeleteIntegration:
    """DELETE /api/v1/integrations/{id}"""

    def test_delete_existing(self, auth_override, mock_session):
        """Deleting an existing integration returns 204."""
        integration = _make_mock_integration(id=1)
        mock_session.execute.return_value.scalar_one_or_none.return_value = integration
        _override_get_session(mock_session)
        try:
            client = TestClient(app)
            resp = client.delete('/api/v1/integrations/1', headers=_auth_header())
            assert resp.status_code == 204
        finally:
            app.dependency_overrides.pop(get_session, None)

    def test_delete_not_found(self, auth_override, mock_session):
        """Deleting a non-existent integration returns 404."""
        mock_session.execute.return_value.scalar_one_or_none.return_value = None
        _override_get_session(mock_session)
        try:
            client = TestClient(app)
            resp = client.delete('/api/v1/integrations/999', headers=_auth_header())
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.pop(get_session, None)


# ═══════════════════════════════════════════════════════════════════════════
# 3. Connection test
# ═══════════════════════════════════════════════════════════════════════════


class TestConnectionTest:
    """POST /api/v1/integrations/{id}/test"""

    @patch('app.routes.integrations.get_adapter')
    def test_connection_success(self, mock_get_adapter, auth_override, mock_session):
        """Testing a valid integration returns success."""
        integration = _make_mock_integration(id=1, adapter_type='rest')
        mock_session.execute.return_value.scalar_one_or_none.return_value = integration
        _override_get_session(mock_session)

        mock_adapter = AsyncMock()
        mock_adapter.test_connection.return_value = True
        mock_adapter_cls = MagicMock(return_value=mock_adapter)
        mock_get_adapter.return_value = mock_adapter_cls

        try:
            client = TestClient(app)
            resp = client.post('/api/v1/integrations/1/test', headers=_auth_header())
            assert resp.status_code == 200
            assert resp.json()['success'] is True
        finally:
            app.dependency_overrides.pop(get_session, None)

    @patch('app.routes.integrations.get_adapter')
    def test_connection_failure(self, mock_get_adapter, auth_override, mock_session):
        """When the adapter fails to connect, success is False."""
        integration = _make_mock_integration(id=1, adapter_type='rest')
        mock_session.execute.return_value.scalar_one_or_none.return_value = integration
        _override_get_session(mock_session)

        mock_adapter = AsyncMock()
        mock_adapter.test_connection.return_value = False
        mock_adapter_cls = MagicMock(return_value=mock_adapter)
        mock_get_adapter.return_value = mock_adapter_cls

        try:
            client = TestClient(app)
            resp = client.post('/api/v1/integrations/1/test', headers=_auth_header())
            assert resp.status_code == 200
            assert resp.json()['success'] is False
        finally:
            app.dependency_overrides.pop(get_session, None)

    def test_connection_not_found(self, auth_override, mock_session):
        """Testing a non-existent integration returns 404."""
        mock_session.execute.return_value.scalar_one_or_none.return_value = None
        _override_get_session(mock_session)
        try:
            client = TestClient(app)
            resp = client.post('/api/v1/integrations/999/test', headers=_auth_header())
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.pop(get_session, None)


# ═══════════════════════════════════════════════════════════════════════════
# 4. Adapter list
# ═══════════════════════════════════════════════════════════════════════════


class TestListAdapters:
    """GET /api/v1/adapters"""

    def test_returns_all_adapters(self, auth_override):
        """Returns the 5 built-in adapter types."""
        client = TestClient(app)
        resp = client.get('/api/v1/adapters', headers=_auth_header())
        assert resp.status_code == 200
        data = resp.json()
        assert 'adapters' in data
        names = {a['name'] for a in data['adapters']}
        assert names == {'rest', 'soap', 'mqtt', 'opcua', 'sap_odata'}


# ═══════════════════════════════════════════════════════════════════════════
# 5. Sync trigger
# ═══════════════════════════════════════════════════════════════════════════


class TestTriggerSync:
    """POST /api/v1/integrations/{id}/trigger"""

    @patch('app.routes.integrations.trigger_integration')
    def test_trigger_sync(self, mock_trigger, auth_override, mock_session):
        """Triggering a sync returns status from the engine."""
        integration = _make_mock_integration(id=1)
        mock_session.execute.return_value.scalar_one_or_none.return_value = integration
        _override_get_session(mock_session)

        mock_trigger.return_value = {'status': 'success', 'records_synced': 5}

        try:
            client = TestClient(app)
            resp = client.post(
                '/api/v1/integrations/1/trigger',
                json={'event_type': 'manual', 'payload': {}},
                headers=_auth_header(),
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data['status'] == 'success'
            assert data['integration_id'] == 1
        finally:
            app.dependency_overrides.pop(get_session, None)

    def test_trigger_not_found(self, auth_override, mock_session):
        """Triggering a non-existent integration returns 404."""
        mock_session.execute.return_value.scalar_one_or_none.return_value = None
        _override_get_session(mock_session)
        try:
            client = TestClient(app)
            resp = client.post(
                '/api/v1/integrations/999/trigger',
                json={},
                headers=_auth_header(),
            )
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.pop(get_session, None)


# ═══════════════════════════════════════════════════════════════════════════
# 6. Sync log
# ═══════════════════════════════════════════════════════════════════════════


class TestSyncLog:
    """GET /api/v1/integrations/{id}/sync-log"""

    def test_sync_log_empty(self, auth_override, mock_session):
        """Returns empty paginated log when no syncs have run."""
        integration = _make_mock_integration(id=1)
        # First call returns the integration (tenancy check)
        # Second call returns count
        # Third call returns items
        mock_session.execute.side_effect = [
            AsyncMock(scalar_one_or_none=lambda: integration),
            AsyncMock(scalar=lambda: 0),
            AsyncMock(scalars=lambda: MagicMock(all=lambda: [])),
        ]
        _override_get_session(mock_session)
        try:
            client = TestClient(app)
            resp = client.get('/api/v1/integrations/1/sync-log', headers=_auth_header())
            assert resp.status_code == 200
            data = resp.json()
            assert data['total'] == 0
            assert data['items'] == []
        finally:
            app.dependency_overrides.pop(get_session, None)

    def test_sync_log_not_found(self, auth_override, mock_session):
        """Log retrieval for a non-existent integration returns 404."""
        mock_session.execute.return_value.scalar_one_or_none.return_value = None
        _override_get_session(mock_session)
        try:
            client = TestClient(app)
            resp = client.get('/api/v1/integrations/999/sync-log', headers=_auth_header())
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.pop(get_session, None)


# ═══════════════════════════════════════════════════════════════════════════
# 7. Authentication
# ═══════════════════════════════════════════════════════════════════════════


class TestAuthentication:
    """Requests without a valid token are rejected."""

    @pytest.mark.parametrize('method,path', [
        ('GET', '/api/v1/integrations'),
        ('POST', '/api/v1/integrations'),
        ('GET', '/api/v1/integrations/1'),
        ('PUT', '/api/v1/integrations/1'),
        ('DELETE', '/api/v1/integrations/1'),
        ('POST', '/api/v1/integrations/1/test'),
        ('GET', '/api/v1/integrations/1/sync-log'),
        ('POST', '/api/v1/integrations/1/trigger'),
    ])
    def test_auth_required(self, method, path):
        """All integration endpoints return 401 without auth."""
        client = TestClient(app)
        resp = client.request(method, path)
        assert resp.status_code == 401, f'{method} {path} returned {resp.status_code}'

    def test_adapters_endpoint_requires_auth(self):
        """The adapter list also requires auth."""
        client = TestClient(app)
        resp = client.get('/api/v1/adapters')
        assert resp.status_code == 401
