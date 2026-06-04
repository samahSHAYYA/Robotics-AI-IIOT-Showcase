"""
@author: Samah SHAYYA
@date: 04-Jun-2026

@description: Generic REST adapter implementing the BaseAdapter interface.
Supports API key, Basic Auth, and Bearer token authentication schemes.
"""

import base64
import logging

from typing import Any

import httpx

from app.adapters.base import BaseAdapter

logger: logging.Logger = logging.getLogger(__name__)


class RestAdapter(BaseAdapter):
    """
    Adapter for RESTful HTTP APIs.

    Authentication is configured via the 'auth' key inside the config dict:
      - type: 'api_key'  → sends header_name + api_key
      - type: 'basic'    → sends Basic Auth with username + password
      - type: 'bearer'   → sends Bearer token
    """

    async def test_connection(self, config: dict[str, Any]) -> bool:
        """
        Verify connectivity by sending a GET to the base URL.

        Considers any response with status < 500 as reachable.

        @param config: Adapter configuration containing 'base_url' and 'auth'.
        @return: True if the endpoint responds, False on any error.
        """
        async with httpx.AsyncClient(timeout = 10) as client:
            try:
                headers: dict[str, str] = self._build_headers(config)
                resp = await client.get(config['base_url'], headers = headers)
                return resp.status_code < 500
            except Exception as exc:
                logger.warning('test_connection failed: %s', exc)
                return False

    async def fetch_data(
        self,
        config: dict[str, Any],
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """
        Retrieve data from a configurable endpoint.

        Expects the response body to be either a JSON array or a JSON object
        with a 'data' key containing the array.

        @param config: Adapter configuration.
        @param params: Optional query parameters.
        @return: A list of record dictionaries.
        @raises httpx.HTTPError: On non-2xx response.
        """
        async with httpx.AsyncClient(timeout = 30) as client:
            headers: dict[str, str] = self._build_headers(config)
            endpoint: str = config.get('endpoint', '/api/data')
            url: str = f"{config['base_url'].rstrip('/')}{endpoint}"
            resp = await client.get(url, headers = headers, params = params)
            resp.raise_for_status()
            data: Any = resp.json()
            if isinstance(data, list):
                return data
            return data.get('data', [data])

    async def push_data(
        self,
        config: dict[str, Any],
        data: list[dict[str, Any]],
    ) -> int:
        """
        Push records to a configurable endpoint via POST.

        @param config: Adapter configuration.
        @param data: A list of record dictionaries to send.
        @return: The number of records sent.
        @raises httpx.HTTPError: On non-2xx response.
        """
        async with httpx.AsyncClient(timeout = 30) as client:
            headers: dict[str, str] = self._build_headers(config)
            headers['Content-Type'] = 'application/json'
            endpoint: str = config.get('endpoint', '/api/data')
            url: str = f"{config['base_url'].rstrip('/')}{endpoint}"
            resp = await client.post(url, headers = headers, json = data)
            resp.raise_for_status()
            return len(data)

    def _build_headers(self, config: dict[str, Any]) -> dict[str, str]:
        """
        Construct HTTP headers from the auth configuration.

        @param config: Adapter configuration containing optional 'auth' block.
        @return: A dictionary of header key-value pairs.
        """
        headers: dict[str, str] = {}
        auth: dict[str, Any] = config.get('auth', {})

        auth_type: str = auth.get('type', '')

        if auth_type == 'api_key':
            header_name: str = auth.get('header_name', 'X-API-Key')
            headers[header_name] = auth.get('api_key', '')

        elif auth_type == 'basic':
            raw_token: str = (
                f"{auth.get('username', '')}:{auth.get('password', '')}"
            )
            encoded: str = base64.b64encode(raw_token.encode()).decode()
            headers['Authorization'] = f'Basic {encoded}'

        elif auth_type == 'bearer':
            headers['Authorization'] = f"Bearer {auth.get('token', '')}"

        return headers
