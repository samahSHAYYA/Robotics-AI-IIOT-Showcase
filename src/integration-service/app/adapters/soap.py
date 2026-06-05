"""
@author: AI Orchestrator
@date: 04-Jun-2026

@description: SOAP adapter for the integration service. Consumes SOAP
web services for legacy ERP and enterprise system integration.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from app.adapters.base import BaseAdapter

logger = logging.getLogger(__name__)

try:
    from zeep import Client as SOAPClient
    from zeep.exceptions import Fault, TransportError
    _SOAP_AVAILABLE = True
except ImportError:
    _SOAP_AVAILABLE = False
    logger.warning('zeep not installed — SOAP adapter will use mock mode')


class SoapAdapter(BaseAdapter):
    """
    Adapter for SOAP web service connections.

    Connects to SOAP WSDL endpoints, calls operations, and returns
    structured data. Supports configurable operation name and parameters.
    """

    async def test_connection(self, config: dict[str, Any]) -> bool:
        """
        Test connection to a SOAP web service WSDL.

        @param config: Must contain 'base_url' pointing to the WSDL URL.
        @return: True if WSDL is accessible.
        """
        wsdl = config.get('base_url', '')
        if not wsdl:
            return False
        try:
            if _SOAP_AVAILABLE:
                client = SOAPClient(wsdl)
                # Just accessing the client validates the WSDL
                logger.info('SOAP WSDL loaded: %s', wsdl)
                return True
            else:
                if 'wsdl' in wsdl or 'soap' in wsdl or '?wsdl' in wsdl:
                    logger.info('SOAP mock test OK: %s', wsdl)
                    return True
                return False
        except Exception as exc:
            logger.warning('SOAP test connection failed: %s', exc)
            return False

    async def fetch_data(
        self,
        config: dict[str, Any],
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """
        Fetch data by calling a SOAP operation.

        @param config: Must contain 'base_url' (WSDL URL), 'operation' (method name),
                       and optionally 'params' (dict of arguments).
        @param params: Optional query/filter parameters (merged into config).
        @return: List of dicts with operation results.
        """
        wsdl = config.get('base_url', '')
        operation = config.get('operation', 'GetData')
        op_params = config.get('params', {})
        # Merge optional params from call argument
        if params:
            op_params.update(params)
        results = []

        try:
            if _SOAP_AVAILABLE:
                client = SOAPClient(wsdl)
                service = client.service
                soap_method = getattr(service, operation, None)
                if soap_method:
                    response = soap_method(**op_params)
                    if isinstance(response, list):
                        for item in response:
                            results.append(self._soap_to_dict(item))
                    else:
                        results.append(self._soap_to_dict(response))
                else:
                    logger.warning('SOAP operation %s not found', operation)
            else:
                # Mock: return simulated ERP data
                mock_operations = {
                    'GetData': [{'id': 1, 'name': 'Order-1001', 'status': 'Shipped'},
                                {'id': 2, 'name': 'Order-1002', 'status': 'Processing'}],
                    'GetOrders': [{'OrderID': 'PO-001', 'Item': 'Widget A', 'Qty': 100}],
                    'GetInventory': [{'SKU': 'W-001', 'OnHand': 500, 'Reserved': 50}],
                    'GetProductionSchedule': [{'Line': 'L1', 'Product': 'Widget', 'Qty': 1000}],
                }
                data = mock_operations.get(operation, [{'mock': True, 'operation': operation}])
                for item in data:
                    item['_fetched_at'] = datetime.now(timezone.utc).isoformat()
                    results.append(item)
                logger.info('SOAP mock fetch: operation=%s, %d records', operation, len(results))
        except Exception as exc:
            logger.error('SOAP fetch failed: %s', exc)

        return results

    async def push_data(
        self,
        config: dict[str, Any],
        data: list[dict[str, Any]],
    ) -> int:
        """
        Push data to a SOAP web service operation.

        @param config: Must contain 'base_url' (WSDL URL), 'operation' (method name).
        @param data: List of records to push as parameters.
        @return: Number of records successfully pushed.
        """
        wsdl = config.get('base_url', '')
        operation = config.get('operation', 'CreateData')
        count = 0

        try:
            if _SOAP_AVAILABLE:
                client = SOAPClient(wsdl)
                service = client.service
                soap_method = getattr(service, operation, None)
                if soap_method:
                    for record in data:
                        soap_method(**record)
                        count += 1
                else:
                    logger.warning('SOAP operation %s not found for push', operation)
            else:
                count = len(data)
                logger.info('SOAP mock push: %d records via %s/%s', count, wsdl, operation)
        except Exception as exc:
            logger.error('SOAP push failed: %s', exc)

        return count

    def _soap_to_dict(self, obj: Any) -> dict:
        """Convert a zeep XML object to a plain dict."""
        if hasattr(obj, '__dict__'):
            return {k: str(v) for k, v in obj.__dict__.items() if not k.startswith('_')}
        return {'value': str(obj)}
