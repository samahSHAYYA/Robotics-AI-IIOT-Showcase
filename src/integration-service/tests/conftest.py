"""
@author: AI Orchestrator
@date: 04-Jun-2026

@description: Pytest configuration for the integration service tests.
Adds the app directory to sys.path so that imports resolve correctly.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'app'))

import pytest  # noqa: E402, F401 — re-exported for convenience
