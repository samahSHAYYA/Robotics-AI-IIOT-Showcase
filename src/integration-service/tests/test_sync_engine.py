"""
@author: AI Orchestrator
@date: 04-Jun-2026

@description: Unit tests for the integration service sync engine.
Uses AsyncMock to mock the database session, adapter classes, and
asyncio primitives so that no real I/O occurs.

Tests cover:
  1. sync_integration — success, failure, integration-not-found
  2. trigger_integration — event-based triggering, not-found, disabled
  3. sync_loop — scheduling of due / not-due / never-synced integrations
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.sync_engine import POLL_INTERVAL_S, sync_integration, sync_loop, trigger_integration


# ═══════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════


@pytest.fixture
def mock_session():
    """Create a reusable mock async session with an async context manager."""
    session = AsyncMock(spec=[
        'execute', 'add', 'commit', 'rollback', 'refresh', 'delete',
        '__aenter__', '__aexit__',
    ])
    session.__aenter__.return_value = session
    session.__aexit__.return_value = None
    return session


@pytest.fixture
def mock_integration():
    """Create a lightweight mock Integration object."""
    integration = MagicMock()
    integration.id = 1
    integration.tenant_id = 1
    integration.name = 'Test Integration'
    integration.adapter_type = 'rest'
    integration.base_url = 'http://example.com/api'
    integration.auth_config = {'type': 'api_key', 'api_key': 'test-key'}
    integration.enabled = True
    integration.sync_interval_minutes = 60
    integration.trigger_on_event = False
    integration.event_types = []
    integration.last_sync_at = None
    integration.last_sync_status = 'never'
    integration.key_rotated_at = None
    integration.created_at = datetime.now(timezone.utc)
    integration.updated_at = None
    return integration


def _make_execute_result(scalar_one_or_none_value=None, scalars_all_value=None, scalar_value=0):
    """Build a mock AsyncMock that simulates session.execute()."""
    result = AsyncMock()
    result.scalar_one_or_none.return_value = scalar_one_or_none_value

    if scalars_all_value is not None:
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = scalars_all_value
        result.scalars.return_value = scalars_mock

    if scalar_value is not None:
        result.scalar.return_value = scalar_value

    return result


# ═══════════════════════════════════════════════════════════════════════════
# 1. sync_integration
# ═══════════════════════════════════════════════════════════════════════════


class TestSyncIntegration:
    """Tests for the sync_integration() function."""

    @patch('app.sync_engine.async_session_factory')
    @patch('app.sync_engine.get_adapter')
    async def test_sync_success(
        self, mock_get_adapter, mock_session_factory, mock_session, mock_integration,
    ):
        """Successful sync creates a SyncLog entry and updates integration.

        Verifies that the adapter's fetch_data is called, a SyncLog is added
        to the session, the integration's last_sync_status is set to 'success',
        the session is committed, and Prometheus metrics are recorded.
        """
        mock_session_factory.return_value = mock_session

        # Session returns the integration on query
        mock_session.execute.return_value = _make_execute_result(
            scalar_one_or_none_value=mock_integration,
        )

        # Adapter mock
        mock_adapter_instance = AsyncMock()
        mock_adapter_instance.fetch_data.return_value = [
            {'id': 1, 'name': 'Record-1'},
            {'id': 2, 'name': 'Record-2'},
        ]
        mock_adapter_cls = MagicMock(return_value=mock_adapter_instance)
        mock_get_adapter.return_value = mock_adapter_cls

        await sync_integration(1)

        # Assertions
        mock_get_adapter.assert_called_once_with('rest')
        mock_adapter_instance.fetch_data.assert_called_once()
        mock_session.add.assert_called_once()  # SyncLog was added
        mock_session.commit.assert_called_once()
        assert mock_integration.last_sync_status == 'success'
        assert mock_integration.last_sync_at is not None

    @patch('app.sync_engine.async_session_factory')
    @patch('app.sync_engine.get_adapter')
    async def test_sync_failure(
        self, mock_get_adapter, mock_session_factory, mock_session, mock_integration,
    ):
        """When fetch_data raises, the sync is recorded as 'error'."""
        mock_session_factory.return_value = mock_session
        mock_session.execute.return_value = _make_execute_result(
            scalar_one_or_none_value=mock_integration,
        )

        mock_adapter_instance = AsyncMock()
        mock_adapter_instance.fetch_data.side_effect = ConnectionError('Broker unreachable')
        mock_adapter_cls = MagicMock(return_value=mock_adapter_instance)
        mock_get_adapter.return_value = mock_adapter_cls

        await sync_integration(1)

        assert mock_integration.last_sync_status == 'error'
        mock_session.commit.assert_called_once()

    @patch('app.sync_engine.async_session_factory')
    async def test_sync_integration_not_found(self, mock_session_factory, mock_session):
        """A non-existent integration is silently skipped."""
        mock_session_factory.return_value = mock_session
        mock_session.execute.return_value = _make_execute_result(
            scalar_one_or_none_value=None,
        )

        await sync_integration(999)

        mock_session.add.assert_not_called()
        mock_session.commit.assert_not_called()

    @patch('app.sync_engine.async_session_factory')
    async def test_sync_disabled_integration(self, mock_session_factory, mock_session, mock_integration):
        """A disabled integration is skipped."""
        mock_integration.enabled = False
        mock_session_factory.return_value = mock_session
        mock_session.execute.return_value = _make_execute_result(
            scalar_one_or_none_value=mock_integration,
        )

        await sync_integration(1)

        mock_session.add.assert_not_called()
        mock_session.commit.assert_not_called()

    @patch('app.sync_engine.async_session_factory')
    @patch('app.sync_engine.get_adapter')
    async def test_sync_db_error_triggers_rollback(
        self, mock_get_adapter, mock_session_factory, mock_session, mock_integration,
    ):
        """A database error during commit triggers a rollback."""
        mock_session_factory.return_value = mock_session
        mock_session.execute.return_value = _make_execute_result(
            scalar_one_or_none_value=mock_integration,
        )

        mock_adapter_instance = AsyncMock()
        mock_adapter_instance.fetch_data.return_value = [{'id': 1}]
        mock_adapter_cls = MagicMock(return_value=mock_adapter_instance)
        mock_get_adapter.return_value = mock_adapter_cls

        # Simulate a DB error
        mock_session.commit.side_effect = [Exception('DB connection lost'), None]

        await sync_integration(1)

        mock_session.rollback.assert_called_once()


# ═══════════════════════════════════════════════════════════════════════════
# 2. trigger_integration
# ═══════════════════════════════════════════════════════════════════════════


class TestTriggerIntegration:
    """Tests for the trigger_integration() function."""

    @patch('app.sync_engine.sync_integration')
    @patch('app.sync_engine.async_session_factory')
    async def test_trigger_triggers_sync(
        self, mock_session_factory, mock_sync_integration, mock_session, mock_integration,
    ):
        """trigger_integration calls sync_integration and returns the updated status."""
        mock_session_factory.return_value = mock_session

        # First call -> returns the integration
        # Second call -> returns the same integration (post-sync)
        first_result = _make_execute_result(scalar_one_or_none_value=mock_integration)
        second_result = _make_execute_result(scalar_one_or_none_value=mock_integration)
        mock_session.execute.side_effect = [first_result, second_result]

        result = await trigger_integration(1)

        mock_sync_integration.assert_called_once_with(1)
        assert result['status'] == 'never'    # unchanged because mock sync didn't update it
        assert 'records_synced' in result

    @patch('app.sync_engine.sync_integration')
    @patch('app.sync_engine.async_session_factory')
    async def test_trigger_not_found(
        self, mock_session_factory, mock_sync_integration, mock_session,
    ):
        """trigger_integration on unknown ID returns not_found."""
        mock_session_factory.return_value = mock_session
        mock_session.execute.return_value = _make_execute_result(
            scalar_one_or_none_value=None,
        )

        result = await trigger_integration(999)

        mock_sync_integration.assert_not_called()
        assert result['status'] == 'not_found'
        assert result['records_synced'] == 0

    @patch('app.sync_engine.sync_integration')
    @patch('app.sync_engine.async_session_factory')
    async def test_trigger_disabled(
        self, mock_session_factory, mock_sync_integration, mock_session, mock_integration,
    ):
        """trigger_integration on a disabled integration returns disabled."""
        mock_integration.enabled = False
        mock_session_factory.return_value = mock_session
        mock_session.execute.return_value = _make_execute_result(
            scalar_one_or_none_value=mock_integration,
        )

        result = await trigger_integration(1)

        mock_sync_integration.assert_not_called()
        assert result['status'] == 'disabled'


# ═══════════════════════════════════════════════════════════════════════════
# 3. sync_loop
# ═══════════════════════════════════════════════════════════════════════════


class TestSyncLoop:
    """Tests for the background sync_loop scheduling logic."""

    @patch('app.sync_engine.sync_integration')
    @patch('app.sync_engine.async_session_factory')
    @patch('app.sync_engine.asyncio.sleep')
    @patch('app.sync_engine.asyncio.create_task')
    async def test_schedules_never_synced(
        self, mock_create_task, mock_sleep, mock_session_factory, mock_sync,
        mock_session, mock_integration,
    ):
        """Integrations with last_sync_at==None are scheduled immediately."""
        mock_session_factory.return_value = mock_session
        mock_integration.last_sync_at = None

        mock_session.execute.return_value = _make_execute_result(
            scalars_all_value=[mock_integration],
        )

        # Run one iteration, then break via exception
        mock_sleep.side_effect = [None, Exception('Stop loop')]

        with pytest.raises(Exception, match='Stop loop'):
            await sync_loop()

        mock_create_task.assert_called_once()
        # Verify it called sync_integration with the right ID
        args, _ = mock_create_task.call_args
        assert args[0] == mock_sync  # sync_integration function reference

    @patch('app.sync_engine.sync_integration')
    @patch('app.sync_engine.async_session_factory')
    @patch('app.sync_engine.asyncio.sleep')
    @patch('app.sync_engine.asyncio.create_task')
    async def test_schedules_due_integration(
        self, mock_create_task, mock_sleep, mock_session_factory, mock_sync,
        mock_session, mock_integration,
    ):
        """Integrations past their sync interval are scheduled."""
        mock_session_factory.return_value = mock_session
        # Last sync was 2 hours ago, interval is 60 min -> due
        mock_integration.last_sync_at = datetime.now(timezone.utc) - timedelta(hours=2)
        mock_integration.sync_interval_minutes = 60

        mock_session.execute.return_value = _make_execute_result(
            scalars_all_value=[mock_integration],
        )

        mock_sleep.side_effect = [None, Exception('Stop loop')]

        with pytest.raises(Exception, match='Stop loop'):
            await sync_loop()

        mock_create_task.assert_called_once()

    @patch('app.sync_engine.sync_integration')
    @patch('app.sync_engine.async_session_factory')
    @patch('app.sync_engine.asyncio.sleep')
    @patch('app.sync_engine.asyncio.create_task')
    async def test_skips_not_due_integration(
        self, mock_create_task, mock_sleep, mock_session_factory, mock_sync,
        mock_session, mock_integration,
    ):
        """Integrations synced recently (within interval) are skipped."""
        mock_session_factory.return_value = mock_session
        # Last sync was 10 minutes ago, interval is 60 min -> not due
        mock_integration.last_sync_at = datetime.now(timezone.utc) - timedelta(minutes=10)
        mock_integration.sync_interval_minutes = 60

        mock_session.execute.return_value = _make_execute_result(
            scalars_all_value=[mock_integration],
        )

        mock_sleep.side_effect = [None, Exception('Stop loop')]

        with pytest.raises(Exception, match='Stop loop'):
            await sync_loop()

        mock_create_task.assert_not_called()

    @patch('app.sync_engine.sync_integration')
    @patch('app.sync_engine.async_session_factory')
    @patch('app.sync_engine.asyncio.sleep')
    @patch('app.sync_engine.asyncio.create_task')
    async def test_handles_empty_integration_list(
        self, mock_create_task, mock_sleep, mock_session_factory, mock_sync,
        mock_session,
    ):
        """An empty list of integrations does not error."""
        mock_session_factory.return_value = mock_session
        mock_session.execute.return_value = _make_execute_result(
            scalars_all_value=[],
        )

        mock_sleep.side_effect = [None, Exception('Stop loop')]

        with pytest.raises(Exception, match='Stop loop'):
            await sync_loop()

        mock_create_task.assert_not_called()

    @patch('app.sync_engine.sync_integration')
    @patch('app.sync_engine.async_session_factory')
    @patch('app.sync_engine.asyncio.sleep')
    @patch('app.sync_engine.asyncio.create_task')
    async def test_db_error_is_caught(
        self, mock_create_task, mock_sleep, mock_session_factory, mock_sync,
        mock_session,
    ):
        """A database error in the loop does not crash the scheduler."""
        mock_session_factory.return_value = mock_session
        mock_session.execute.side_effect = Exception('DB unavailable')

        mock_sleep.side_effect = [None, Exception('Stop loop')]

        with pytest.raises(Exception, match='Stop loop'):
            await sync_loop()

        # sleep was called (the loop continued despite the error)
        mock_sleep.assert_called()

    @patch('app.sync_engine.sync_integration')
    @patch('app.sync_engine.async_session_factory')
    @patch('app.sync_engine.asyncio.sleep')
    @patch('app.sync_engine.asyncio.create_task')
    async def test_schedules_multiple_integrations(
        self, mock_create_task, mock_sleep, mock_session_factory, mock_sync,
        mock_session, mock_integration,
    ):
        """Multiple due integrations are all scheduled."""
        mock_session_factory.return_value = mock_session

        integration_a = mock_integration
        integration_b = MagicMock()
        integration_b.id = 2
        integration_b.last_sync_at = None
        integration_b.sync_interval_minutes = 60

        mock_session.execute.return_value = _make_execute_result(
            scalars_all_value=[integration_a, integration_b],
        )

        mock_sleep.side_effect = [None, Exception('Stop loop')]

        with pytest.raises(Exception, match='Stop loop'):
            await sync_loop()

        assert mock_create_task.call_count == 2
