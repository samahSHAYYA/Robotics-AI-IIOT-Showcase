"""
@author: AI Orchestrator
@date: 04-Jun-2026

@description: Unit tests for integration service adapters in mock mode.
All adapters have built-in mock fallbacks when their protocol libraries are
not installed (asyncio-mqtt, asyncua, zeep, pyodata). The RestAdapter is
tested with mocked httpx since it IS installed as a dependency.

Tests cover:
  1. RestAdapter — base_url validation, test_connection, fetch_data
  2. OPC-UA adapter — mock mode config validation, fetch data
  3. MQTT adapter — mock mode URI validation, fetch data
  4. SOAP adapter — mock mode WSDL detection, fetch/push
  5. SAP OData adapter — mock mode URL detection, fetch/push
  6. Adapter registry — count, lookup, error handling
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.adapters.base import BaseAdapter
from app.adapters.mqtt import MqttAdapter
from app.adapters.opcua import OpcUaAdapter
from app.adapters.registry import _registry, get_adapter, list_adapters
from app.adapters.rest import RestAdapter
from app.adapters.sap_odata import SapODataAdapter
from app.adapters.soap import SoapAdapter


# ═══════════════════════════════════════════════════════════════════════════
# 1. RestAdapter
# ═══════════════════════════════════════════════════════════════════════════


class TestRestAdapter:
    """RestAdapter uses httpx (installed) — mock the HTTP client."""

    # ── test_connection ───────────────────────────────────────────────────

    async def test_base_url_required(self):
        """test_connection returns False when base_url is missing."""
        adapter = RestAdapter()
        result = await adapter.test_connection({})
        assert result is False

    @patch('app.adapters.rest.httpx.AsyncClient')
    async def test_test_connection_success(self, mock_client_cls):
        """Returns True when the endpoint responds with status < 500."""
        mock_instance = AsyncMock()
        mock_instance.__aenter__.return_value = mock_instance
        mock_client_cls.return_value = mock_instance

        mock_response = MagicMock(status_code=200)
        mock_instance.get.return_value = mock_response

        adapter = RestAdapter()
        result = await adapter.test_connection({'base_url': 'http://example.com/api'})
        assert result is True
        mock_instance.get.assert_called_once()

    @patch('app.adapters.rest.httpx.AsyncClient')
    async def test_test_connection_server_error(self, mock_client_cls):
        """Returns False when the endpoint returns status >= 500."""
        mock_instance = AsyncMock()
        mock_instance.__aenter__.return_value = mock_instance
        mock_client_cls.return_value = mock_instance

        mock_response = MagicMock(status_code=500)
        mock_instance.get.return_value = mock_response

        adapter = RestAdapter()
        result = await adapter.test_connection({'base_url': 'http://example.com/api'})
        assert result is False

    @patch('app.adapters.rest.httpx.AsyncClient')
    async def test_test_connection_exception(self, mock_client_cls):
        """Returns False when an exception occurs during the request."""
        mock_instance = AsyncMock()
        mock_instance.__aenter__.return_value = mock_instance
        mock_client_cls.return_value = mock_instance

        mock_instance.get.side_effect = ConnectionError('Network unreachable')

        adapter = RestAdapter()
        result = await adapter.test_connection({'base_url': 'http://example.com/api'})
        assert result is False

    # ── fetch_data ────────────────────────────────────────────────────────

    @patch('app.adapters.rest.httpx.AsyncClient')
    async def test_fetch_data_returns_list(self, mock_client_cls):
        """Returns a list when the response body is a JSON array."""
        mock_instance = AsyncMock()
        mock_instance.__aenter__.return_value = mock_instance
        mock_client_cls.return_value = mock_instance

        expected = [{'id': 1, 'name': 'Alpha'}, {'id': 2, 'name': 'Beta'}]
        mock_response = MagicMock(status_code=200)
        mock_response.json.return_value = expected
        mock_instance.get.return_value = mock_response
        mock_response.raise_for_status = MagicMock()

        adapter = RestAdapter()
        result = await adapter.fetch_data({'base_url': 'http://example.com'})
        assert result == expected
        assert isinstance(result, list)

    @patch('app.adapters.rest.httpx.AsyncClient')
    async def test_fetch_data_wraps_object_in_list(self, mock_client_cls):
        """Wraps a single JSON object into a list when no 'data' key exists."""
        mock_instance = AsyncMock()
        mock_instance.__aenter__.return_value = mock_instance
        mock_client_cls.return_value = mock_instance

        single = {'id': 1, 'name': 'Only'}
        mock_response = MagicMock(status_code=200)
        mock_response.json.return_value = single
        mock_instance.get.return_value = mock_response
        mock_response.raise_for_status = MagicMock()

        adapter = RestAdapter()
        result = await adapter.fetch_data({'base_url': 'http://example.com'})
        assert result == [single]

    # ── push_data ─────────────────────────────────────────────────────────

    @patch('app.adapters.rest.httpx.AsyncClient')
    async def test_push_data_returns_count(self, mock_client_cls):
        """Returns the number of records pushed."""
        mock_instance = AsyncMock()
        mock_instance.__aenter__.return_value = mock_instance
        mock_client_cls.return_value = mock_instance

        mock_response = MagicMock(status_code=201)
        mock_instance.post.return_value = mock_response
        mock_response.raise_for_status = MagicMock()

        adapter = RestAdapter()
        records = [{'id': 1}, {'id': 2}, {'id': 3}]
        result = await adapter.push_data({'base_url': 'http://example.com'}, records)
        assert result == 3

    # ── _build_headers ────────────────────────────────────────────────────

    def test_build_headers_api_key(self):
        """Headers include the configured API key header."""
        adapter = RestAdapter()
        headers = adapter._build_headers({
            'auth': {'type': 'api_key', 'header_name': 'X-API-Key', 'api_key': 'secret123'},
        })
        assert headers.get('X-API-Key') == 'secret123'

    def test_build_headers_bearer(self):
        """Headers include the Bearer token."""
        adapter = RestAdapter()
        headers = adapter._build_headers({
            'auth': {'type': 'bearer', 'token': 'tok-abc'},
        })
        assert headers.get('Authorization') == 'Bearer tok-abc'

    def test_build_headers_empty(self):
        """Empty auth config produces empty headers."""
        adapter = RestAdapter()
        headers = adapter._build_headers({})
        assert headers == {}


# ═══════════════════════════════════════════════════════════════════════════
# 2. OPC-UA Adapter (mock mode — asyncua not installed)
# ═══════════════════════════════════════════════════════════════════════════


class TestOpcUaAdapter:
    """OpcUaAdapter operates in mock mode (asyncua import fails)."""

    # ── test_connection ───────────────────────────────────────────────────

    async def test_mock_test_connection_valid(self):
        """Accepts opc.tcp:// URIs and returns True."""
        adapter = OpcUaAdapter()
        result = await adapter.test_connection({'base_url': 'opc.tcp://localhost:4840'})
        assert result is True

    async def test_mock_test_connection_invalid_scheme(self):
        """Rejects non-opc.tcp URIs (returns False)."""
        adapter = OpcUaAdapter()
        result = await adapter.test_connection({'base_url': 'http://plc.example.com'})
        assert result is False

    async def test_mock_test_connection_empty_url(self):
        """Uses default endpoint when base_url is missing; default is opc.tcp:// so OK."""
        adapter = OpcUaAdapter()
        result = await adapter.test_connection({'security_mode': 'None'})
        assert result is True  # default is opc.tcp://localhost:4840

    # ── fetch_data ────────────────────────────────────────────────────────

    async def test_mock_fetch_data_returns_list(self):
        """Returns a list of telemetry dicts with expected keys."""
        adapter = OpcUaAdapter()
        result = await adapter.fetch_data({'base_url': 'opc.tcp://localhost:4840'})
        assert isinstance(result, list)
        assert len(result) > 0
        assert 'node_id' in result[0]
        assert 'value' in result[0]
        assert 'timestamp' in result[0]

    async def test_mock_fetch_data_empty_nodes(self):
        """Returns an empty list when the nodes list is explicitly empty."""
        adapter = OpcUaAdapter()
        result = await adapter.fetch_data({
            'base_url': 'opc.tcp://localhost:4840',
            'nodes': [],
        })
        assert isinstance(result, list)
        assert len(result) == 0

    async def test_mock_fetch_data_custom_nodes(self):
        """Uses the configured node IDs instead of defaults."""
        adapter = OpcUaAdapter()
        result = await adapter.fetch_data({
            'base_url': 'opc.tcp://localhost:4840',
            'nodes': ['ns=2;s=CustomSensor'],
        })
        assert len(result) == 1
        assert result[0]['node_id'] == 'ns=2;s=CustomSensor'

    # ── push_data ─────────────────────────────────────────────────────────

    async def test_mock_push_data_returns_count(self):
        """Returns the number of records successfully written."""
        adapter = OpcUaAdapter()
        records = [
            {'node_id': 'ns=2;s=Temp', 'value': 42.0},
            {'node_id': 'ns=2;s=Pressure', 'value': 1.5},
        ]
        result = await adapter.push_data({'base_url': 'opc.tcp://localhost:4840'}, records)
        assert result == 2

    async def test_mock_push_data_empty(self):
        """Returns 0 when pushing an empty list."""
        adapter = OpcUaAdapter()
        result = await adapter.push_data({'base_url': 'opc.tcp://localhost:4840'}, [])
        assert result == 0


# ═══════════════════════════════════════════════════════════════════════════
# 3. MQTT Adapter (mock mode — asyncio_mqtt not installed)
# ═══════════════════════════════════════════════════════════════════════════


class TestMqttAdapter:
    """MqttAdapter operates in mock mode (asyncio_mqtt import fails)."""

    # ── test_connection ───────────────────────────────────────────────────

    async def test_mock_test_connection_mqtt_scheme(self):
        """Accepts mqtt:// URIs and returns True."""
        adapter = MqttAdapter()
        result = await adapter.test_connection({'base_url': 'mqtt://broker.local:1883'})
        assert result is True

    async def test_mock_test_connection_tcp_scheme(self):
        """Also accepts tcp:// URIs (common for MQTT brokers)."""
        adapter = MqttAdapter()
        result = await adapter.test_connection({'base_url': 'tcp://broker.local:1883'})
        assert result is True

    async def test_mock_test_connection_invalid_scheme(self):
        """Rejects non-mqtt/tcp URIs."""
        adapter = MqttAdapter()
        result = await adapter.test_connection({'base_url': 'http://broker.local'})
        assert result is False

    # ── fetch_data ────────────────────────────────────────────────────────

    async def test_mock_fetch_data_returns_list(self):
        """Returns a list of sensor data dicts."""
        adapter = MqttAdapter()
        result = await adapter.fetch_data({'base_url': 'mqtt://broker.local:1883'})
        assert isinstance(result, list)
        assert len(result) > 0
        assert 'topic' in result[0]
        assert 'payload' in result[0]
        assert 'timestamp' in result[0]

    async def test_mock_fetch_data_custom_topics(self):
        """Uses the configured topic list."""
        adapter = MqttAdapter()
        result = await adapter.fetch_data({
            'base_url': 'mqtt://broker.local:1883',
            'topics': ['factory/temperature'],
        })
        assert len(result) == 1
        assert result[0]['topic'] == 'factory/temperature'

    async def test_mock_fetch_data_payload_is_json(self):
        """Each payload is valid JSON with value and unit."""
        import json
        adapter = MqttAdapter()
        result = await adapter.fetch_data({'base_url': 'mqtt://broker.local:1883'})
        for entry in result:
            payload = json.loads(entry['payload'])
            assert 'value' in payload
            assert 'unit' in payload

    # ── push_data ─────────────────────────────────────────────────────────

    async def test_mock_push_data_returns_count(self):
        """Returns the number of records published."""
        adapter = MqttAdapter()
        records = [{'command': 'start'}, {'command': 'stop'}]
        result = await adapter.push_data({'base_url': 'mqtt://broker.local:1883'}, records)
        assert result == 2


# ═══════════════════════════════════════════════════════════════════════════
# 4. SOAP Adapter (mock mode — zeep not installed)
# ═══════════════════════════════════════════════════════════════════════════


class TestSoapAdapter:
    """SoapAdapter operates in mock mode (zeep import fails)."""

    # ── test_connection ───────────────────────────────────────────────────

    async def test_mock_test_connection_with_wsdl(self):
        """Accepts URLs containing 'wsdl'."""
        adapter = SoapAdapter()
        result = await adapter.test_connection({'base_url': 'http://erp.example.com/service?wsdl'})
        assert result is True

    async def test_mock_test_connection_with_soap(self):
        """Accepts URLs containing 'soap'."""
        adapter = SoapAdapter()
        result = await adapter.test_connection({'base_url': 'http://erp.example.com/soap'})
        assert result is True

    async def test_mock_test_connection_question_wsdl(self):
        """Accepts URLs ending with ?wsdl."""
        adapter = SoapAdapter()
        result = await adapter.test_connection({'base_url': 'http://erp.example.com?wsdl'})
        assert result is True

    async def test_mock_test_connection_invalid(self):
        """Rejects URLs without wsdl or soap."""
        adapter = SoapAdapter()
        result = await adapter.test_connection({'base_url': 'http://erp.example.com/api'})
        assert result is False

    async def test_mock_test_connection_empty_url(self):
        """Rejects empty base_url."""
        adapter = SoapAdapter()
        result = await adapter.test_connection({'base_url': ''})
        assert result is False

    # ── fetch_data ────────────────────────────────────────────────────────

    async def test_mock_fetch_data_get_data(self):
        """Returns mock ERP data for the GetData operation."""
        adapter = SoapAdapter()
        result = await adapter.fetch_data({
            'base_url': 'http://erp.example.com/service?wsdl',
            'operation': 'GetData',
        })
        assert isinstance(result, list)
        assert len(result) > 0
        assert '_fetched_at' in result[0]
        assert result[0].get('id') == 1
        assert result[0].get('name') == 'Order-1001'

    async def test_mock_fetch_data_get_orders(self):
        """Returns mock data for the GetOrders operation."""
        adapter = SoapAdapter()
        result = await adapter.fetch_data({
            'base_url': 'http://erp.example.com/service?wsdl',
            'operation': 'GetOrders',
        })
        assert len(result) == 1
        assert result[0]['OrderID'] == 'PO-001'

    async def test_mock_fetch_data_unknown_operation(self):
        """Returns a fallback dict for unknown operations."""
        adapter = SoapAdapter()
        result = await adapter.fetch_data({
            'base_url': 'http://erp.example.com/service?wsdl',
            'operation': 'UnknownOp',
        })
        assert len(result) == 1
        assert result[0]['operation'] == 'UnknownOp'

    # ── push_data ─────────────────────────────────────────────────────────

    async def test_mock_push_data_returns_count(self):
        """Returns the number of records pushed."""
        adapter = SoapAdapter()
        result = await adapter.push_data({
            'base_url': 'http://erp.example.com/service?wsdl',
        }, [{'id': 1}, {'id': 2}, {'id': 3}])
        assert result == 3


# ═══════════════════════════════════════════════════════════════════════════
# 5. SAP OData Adapter (mock mode — pyodata not installed)
# ═══════════════════════════════════════════════════════════════════════════


class TestSapODataAdapter:
    """SapODataAdapter operates in mock mode (pyodata import fails)."""

    # ── test_connection ───────────────────────────────────────────────────

    async def test_mock_test_connection_with_sap(self):
        """Accepts URLs containing 'sap'."""
        adapter = SapODataAdapter()
        result = await adapter.test_connection({'base_url': 'http://sapgw.example.com/sap/opu/odata'})
        assert result is True

    async def test_mock_test_connection_with_odata(self):
        """Accepts URLs containing 'odata'."""
        adapter = SapODataAdapter()
        result = await adapter.test_connection({'base_url': 'http://gw.example.com/odata/service'})
        assert result is True

    async def test_mock_test_connection_invalid(self):
        """Rejects URLs without sap or odata."""
        adapter = SapODataAdapter()
        result = await adapter.test_connection({'base_url': 'http://gw.example.com/api'})
        assert result is False

    async def test_mock_test_connection_empty_url(self):
        """Rejects empty base_url."""
        adapter = SapODataAdapter()
        result = await adapter.test_connection({'base_url': ''})
        assert result is False

    # ── fetch_data ────────────────────────────────────────────────────────

    async def test_mock_fetch_data_material_set(self):
        """Returns mock SAP material data."""
        adapter = SapODataAdapter()
        result = await adapter.fetch_data({
            'base_url': 'http://sapgw.example.com/sap/opu/odata',
            'entity_set': 'MaterialSet',
        })
        assert isinstance(result, list)
        assert len(result) > 0
        assert '_fetched_at' in result[0]
        assert result[0].get('Material') == 'M-001'

    async def test_mock_fetch_data_production_order_set(self):
        """Returns mock production order data."""
        adapter = SapODataAdapter()
        result = await adapter.fetch_data({
            'base_url': 'http://sapgw.example.com/sap/opu/odata',
            'entity_set': 'ProductionOrderSet',
        })
        assert len(result) == 2
        assert result[0]['OrderID'] == 'PRD-001'

    async def test_mock_fetch_data_unknown_entity(self):
        """Returns a fallback for unknown entity sets."""
        adapter = SapODataAdapter()
        result = await adapter.fetch_data({
            'base_url': 'http://sapgw.example.com/sap/opu/odata',
            'entity_set': 'UnknownSet',
        })
        assert len(result) == 1
        assert result[0]['entity_set'] == 'UnknownSet'

    async def test_mock_fetch_data_respects_top(self):
        """Limits results to the configured 'top' parameter."""
        adapter = SapODataAdapter()
        result = await adapter.fetch_data({
            'base_url': 'http://sapgw.example.com/sap/opu/odata',
            'entity_set': 'MaterialSet',
            'top': 1,
        })
        assert len(result) == 1

    # ── push_data ─────────────────────────────────────────────────────────

    async def test_mock_push_data_returns_count(self):
        """Returns the number of records pushed."""
        adapter = SapODataAdapter()
        result = await adapter.push_data({
            'base_url': 'http://sapgw.example.com/sap/opu/odata',
        }, [{'Material': 'M-004'}])
        assert result == 1


# ═══════════════════════════════════════════════════════════════════════════
# 6. Adapter Registry
# ═══════════════════════════════════════════════════════════════════════════


class TestAdapterRegistry:
    """Validate the pluggable adapter registry."""

    def test_contains_all_five_adapters(self):
        """Registry contains exactly 5 adapter types."""
        adapters = list_adapters()
        names = {a['name'] for a in adapters}
        assert names == {'rest', 'soap', 'mqtt', 'opcua', 'sap_odata'}
        assert len(adapters) == 5

    @pytest.mark.parametrize('type_name,expected_cls', [
        ('rest', RestAdapter),
        ('soap', SoapAdapter),
        ('mqtt', MqttAdapter),
        ('opcua', OpcUaAdapter),
        ('sap_odata', SapODataAdapter),
    ])
    def test_get_adapter_returns_correct_class(self, type_name, expected_cls):
        """Each adapter type returns its registered class."""
        cls = get_adapter(type_name)
        assert cls is expected_cls
        assert issubclass(cls, BaseAdapter)

    def test_get_adapter_invalid_type_raises(self):
        """Looking up an unregistered adapter type raises ValueError."""
        with pytest.raises(ValueError, match='Unknown adapter: nonexistent'):
            get_adapter('nonexistent')

    def test_registry_internal_dict(self):
        """The internal registry dict has exactly 5 entries."""
        assert len(_registry) == 5
        assert all(issubclass(cls, BaseAdapter) for cls in _registry.values())
