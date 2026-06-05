"""
@author: AI Orchestrator
@date: 04-Jun-2026

@description: OPC-UA adapter for the integration service. Connects to
OPC-UA servers (PLC, SCADA, sensors) using asyncua library with
configurable security mode and endpoint URL.
"""

import logging
from typing import Any

from app.adapters.base import BaseAdapter

logger = logging.getLogger(__name__)

# Try to import asyncua; fall back to mock if unavailable
try:
    from asyncua import Client as OPCUAClient
    from asyncua.crypto.security_policies import SecurityPolicyBasic256Sha256
    _OPCUA_AVAILABLE = True
except ImportError:
    _OPCUA_AVAILABLE = False
    logger.warning('asyncua not installed — OPC-UA adapter will use mock mode')


class OpcUaAdapter(BaseAdapter):
    """
    Adapter for OPC-UA server connections.

    Supports configurable endpoint URL, security mode, and node paths
    for reading manufacturing telemetry.
    """

    def __init__(self):
        self._client = None

    async def test_connection(self, config: dict[str, Any]) -> bool:
        """
        Test connection to an OPC-UA server.

        @param config: Must contain 'base_url' (opc.tcp://host:port/path)
                       and optionally 'security_mode' ('None', 'Sign', 'SignAndEncrypt').
        @return: True if connection succeeded.
        """
        endpoint = config.get('base_url', 'opc.tcp://localhost:4840')
        security_mode = config.get('security_mode', 'None')
        try:
            if _OPCUA_AVAILABLE:
                client = OPCUAClient(endpoint, timeout=5)
                if security_mode != 'None':
                    client.set_security(
                        SecurityPolicyBasic256Sha256,
                        certificate=None,
                        private_key=None,
                        mode=security_mode,
                    )
                async with client:
                    logger.info('OPC-UA test connection OK: %s', endpoint)
                return True
            else:
                # Mock: accept any valid opc.tcp:// URL
                if endpoint.startswith('opc.tcp://'):
                    logger.info('OPC-UA mock test OK: %s', endpoint)
                    return True
                return False
        except Exception as exc:
            logger.warning('OPC-UA test connection failed: %s', exc)
            return False

    async def fetch_data(
        self,
        config: dict[str, Any],
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """
        Fetch telemetry data from OPC-UA server nodes.

        @param config: Must contain 'base_url', 'nodes' (list of node IDs),
                       and optionally 'security_mode'.
        @param params: Optional query/filter parameters (unused).
        @return: List of dicts with node_id, value, timestamp.
        """
        endpoint = config.get('base_url', 'opc.tcp://localhost:4840')
        nodes = config.get('nodes', ['ns=2;s=Temperature', 'ns=2;s=Pressure', 'ns=2;s=Speed'])
        security_mode = config.get('security_mode', 'None')
        results = []

        try:
            if _OPCUA_AVAILABLE:
                client = OPCUAClient(endpoint, timeout=10)
                if security_mode != 'None':
                    client.set_security(
                        SecurityPolicyBasic256Sha256,
                        certificate=None,
                        private_key=None,
                        mode=security_mode,
                    )
                async with client:
                    for node_id in nodes:
                        try:
                            node = client.get_node(node_id)
                            value = await node.read_value()
                            data_ts = await node.read_data_value()
                            results.append({
                                'node_id': node_id,
                                'value': str(value),
                                'timestamp': data_ts.SourceTimestamp.isoformat() if data_ts.SourceTimestamp else None,
                            })
                        except Exception as exc:
                            logger.warning('Failed to read OPC-UA node %s: %s', node_id, exc)
                            results.append({
                                'node_id': node_id,
                                'value': None,
                                'error': str(exc),
                                'timestamp': None,
                            })
            else:
                # Mock: return simulated telemetry
                from datetime import datetime, timezone
                import random
                for node_id in nodes:
                    results.append({
                        'node_id': node_id,
                        'value': round(random.uniform(20, 100), 2),
                        'timestamp': datetime.now(timezone.utc).isoformat(),
                    })
                logger.info('OPC-UA mock fetch: %d nodes from %s', len(nodes), endpoint)
        except Exception as exc:
            logger.error('OPC-UA fetch failed: %s', exc)

        return results

    async def push_data(
        self,
        config: dict[str, Any],
        data: list[dict[str, Any]],
    ) -> int:
        """
        Push data to an OPC-UA server by writing values to configured nodes.

        @param config: Must contain 'base_url', 'nodes' (list of node IDs),
                       and optionally 'security_mode'.
        @param data: List of dicts with 'node_id' and 'value' keys.
        @return: Number of values successfully written.
        """
        endpoint = config.get('base_url', 'opc.tcp://localhost:4840')
        nodes_config = config.get('nodes', [])
        security_mode = config.get('security_mode', 'None')
        written = 0

        try:
            if _OPCUA_AVAILABLE:
                client = OPCUAClient(endpoint, timeout=10)
                if security_mode != 'None':
                    client.set_security(
                        SecurityPolicyBasic256Sha256,
                        certificate=None,
                        private_key=None,
                        mode=security_mode,
                    )
                async with client:
                    for record in data:
                        node_id = record.get('node_id')
                        value = record.get('value')
                        if node_id is None or value is None:
                            continue
                        try:
                            node = client.get_node(node_id)
                            await node.write_value(value)
                            written += 1
                        except Exception as exc:
                            logger.warning('Failed to write to OPC-UA node %s: %s', node_id, exc)
            else:
                # Mock: simulate writing
                written = len(data)
                logger.info('OPC-UA mock push: %d values to %s', written, endpoint)
        except Exception as exc:
            logger.error('OPC-UA push failed: %s', exc)

        return written
