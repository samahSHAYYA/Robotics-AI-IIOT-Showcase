"""
@author: AI Orchestrator
@date: 04-Jun-2026

@description: SAP OData adapter for the integration service. Connects to
SAP Gateway via OData v2/v4 protocol for ERP data exchange.
"""

import logging
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin

from app.adapters.base import BaseAdapter

logger = logging.getLogger(__name__)

try:
    from pyodata import ODataService
    from pyodata.exceptions import PyODataException
    import requests
    _ODATA_AVAILABLE = True
except ImportError:
    _ODATA_AVAILABLE = False
    logger.warning('pyodata not installed — SAP OData adapter will use mock mode')


class SapODataAdapter(BaseAdapter):
    """
    Adapter for SAP OData service connections.

    Connects to SAP Gateway OData v2/v4 endpoints, queries entity sets,
    and returns structured data for ERP integration (materials, orders,
    production schedules).
    """

    async def test_connection(self, config: dict[str, Any]) -> bool:
        """
        Test connection to an SAP OData service.

        @param config: Must contain 'base_url' pointing to the OData service root,
                       and optionally 'username', 'password' for basic auth.
        @return: True if the service metadata is accessible.
        """
        base_url = config.get('base_url', '')
        username = config.get('username', '')
        password = config.get('password', '')
        if not base_url:
            return False
        try:
            if _ODATA_AVAILABLE:
                session = requests.Session()
                if username and password:
                    session.auth = (username, password)
                metadata_url = urljoin(base_url.rstrip('/') + '/', '$metadata')
                resp = session.get(metadata_url, timeout=10)
                return resp.status_code == 200
            else:
                if 'sap' in base_url.lower() or 'odata' in base_url.lower():
                    logger.info('SAP OData mock test OK: %s', base_url)
                    return True
                return False
        except Exception as exc:
            logger.warning('SAP OData test connection failed: %s', exc)
            return False

    async def fetch_data(
        self,
        config: dict[str, Any],
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """
        Fetch data from an SAP OData entity set.

        @param config: Must contain 'base_url', 'entity_set' (e.g. 'MaterialSet'),
                       and optionally 'top', 'filter', 'username', 'password'.
        @param params: Optional query/filter parameters (merged into config).
        @return: List of dicts with entity data.
        """
        base_url = config.get('base_url', '')
        entity_set = config.get('entity_set', 'MaterialSet')
        top = params.get('top', config.get('top', 10)) if params else config.get('top', 10)
        filter_str = params.get('filter', config.get('filter', '')) if params else config.get('filter', '')
        username = config.get('username', '')
        password = config.get('password', '')
        results = []

        try:
            if _ODATA_AVAILABLE:
                session = requests.Session()
                if username and password:
                    session.auth = (username, password)
                query_url = urljoin(base_url.rstrip('/') + '/', entity_set)
                query_params = {'$top': top}
                if filter_str:
                    query_params['$filter'] = filter_str
                resp = session.get(query_url, params=query_params, timeout=30)
                if resp.status_code == 200:
                    data = resp.json()
                    for entry in data.get('d', data).get('results', data if isinstance(data, list) else []):
                        results.append(entry if isinstance(entry, dict) else {'value': str(entry)})
                else:
                    logger.warning('SAP OData query failed: %d %s', resp.status_code, resp.text)
            else:
                # Mock: return simulated SAP data
                mock_entities = {
                    'MaterialSet': [
                        {'Material': 'M-001', 'Description': 'Steel Plate', 'Quantity': 5000, 'Unit': 'KG'},
                        {'Material': 'M-002', 'Description': 'Copper Wire', 'Quantity': 2000, 'Unit': 'M'},
                        {'Material': 'M-003', 'Description': 'Aluminum Frame', 'Quantity': 150, 'Unit': 'EA'},
                    ],
                    'ProductionOrderSet': [
                        {'OrderID': 'PRD-001', 'Material': 'M-001', 'Qty': 100, 'Status': 'Released'},
                        {'OrderID': 'PRD-002', 'Material': 'M-002', 'Qty': 500, 'Status': 'InProgress'},
                    ],
                    'StockSet': [
                        {'Plant': 'PLANT-01', 'Material': 'M-001', 'Stock': 5000},
                        {'Plant': 'PLANT-01', 'Material': 'M-002', 'Stock': 2000},
                    ],
                }
                data = mock_entities.get(entity_set, [{'mock': True, 'entity_set': entity_set}])
                for item in data[:top]:
                    item['_fetched_at'] = datetime.now(timezone.utc).isoformat()
                    results.append(item)
                logger.info('SAP OData mock fetch: entity=%s, %d records', entity_set, len(results))
        except Exception as exc:
            logger.error('SAP OData fetch failed: %s', exc)

        return results

    async def push_data(
        self,
        config: dict[str, Any],
        data: list[dict[str, Any]],
    ) -> int:
        """
        Push data to an SAP OData entity set (POST new entity).

        @param config: Must contain 'base_url', 'entity_set',
                       and optionally 'username', 'password'.
        @param data: List of entity records to create.
        @return: Number of records successfully created.
        """
        base_url = config.get('base_url', '')
        entity_set = config.get('entity_set', 'MaterialSet')
        username = config.get('username', '')
        password = config.get('password', '')
        count = 0

        try:
            if _ODATA_AVAILABLE:
                session = requests.Session()
                if username and password:
                    session.auth = (username, password)
                post_url = urljoin(base_url.rstrip('/') + '/', entity_set)
                for record in data:
                    resp = session.post(post_url, json=record, timeout=30)
                    if resp.status_code in (201, 204):
                        count += 1
                    else:
                        logger.warning('SAP OData push failed: %d %s', resp.status_code, resp.text)
            else:
                count = len(data)
                logger.info('SAP OData mock push: %d records to %s/%s', count, base_url, entity_set)
        except Exception as exc:
            logger.error('SAP OData push failed: %s', exc)

        return count
