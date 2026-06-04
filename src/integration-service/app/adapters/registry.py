"""
@author: Samah SHAYYA
@date: 04-Jun-2026

@description: Pluggable adapter registry — maps adapter type names to their
concrete implementation classes. Built-in adapters are registered at import
time.
"""

from typing import Any

from app.adapters.base import BaseAdapter
from app.adapters.rest import RestAdapter

_registry: dict[str, type[BaseAdapter]] = {}


def register_adapter(name: str, adapter_cls: type[BaseAdapter]) -> None:
    """
    Register an adapter class under a symbolic name.

    @param name: The adapter type key (e.g. 'rest', 'soap', 'mqtt').
    @param adapter_cls: The concrete adapter class implementing BaseAdapter.
    """
    _registry[name] = adapter_cls


def get_adapter(name: str) -> type[BaseAdapter]:
    """
    Retrieve the adapter class for the given type name.

    @param name: The adapter type key to look up.
    @return: The registered adapter class.
    @raises ValueError: If the adapter type is not registered.
    """
    if name not in _registry:
        raise ValueError(f'Unknown adapter: {name}')
    return _registry[name]


def list_adapters() -> list[dict[str, Any]]:
    """
    Return metadata about all registered adapters.

    @return: A list of adapter info dictionaries, each with a 'name' key.
    """
    return [{'name': name} for name in _registry]


# Register built-in adapters
register_adapter('rest', RestAdapter)
