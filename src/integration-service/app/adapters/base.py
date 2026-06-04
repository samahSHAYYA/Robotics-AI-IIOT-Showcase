"""
@author: Samah SHAYYA
@date: 04-Jun-2026

@description: Abstract base class defining the pluggable adapter contract for
external system integrations. All concrete adapters must implement
test_connection, fetch_data, and push_data.
"""

from abc import ABC, abstractmethod
from typing import Any


class BaseAdapter(ABC):
    """
    Abstract interface for external system adapters.

    Each adapter wraps a specific protocol or API style (REST, SOAP, MQTT,
    custom) and exposes three standard operations.
    """

    @abstractmethod
    async def test_connection(self, config: dict[str, Any]) -> bool:
        """
        Verify connectivity to the external system using the given config.

        @param config: Adapter-specific configuration dictionary (base_url,
                       auth, endpoint, etc.).
        @return: True if the connection succeeds, False otherwise.
        """

    @abstractmethod
    async def fetch_data(
        self,
        config: dict[str, Any],
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """
        Retrieve data from the external system.

        @param config: Adapter-specific configuration.
        @param params: Optional query/filter parameters.
        @return: A list of records as dictionaries.
        """

    @abstractmethod
    async def push_data(
        self,
        config: dict[str, Any],
        data: list[dict[str, Any]],
    ) -> int:
        """
        Send data to the external system.

        @param config: Adapter-specific configuration.
        @param data: A list of records to push.
        @return: The number of records successfully pushed.
        """
