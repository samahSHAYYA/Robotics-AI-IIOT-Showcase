"""
@author: Samah SHAYYA
@description: Unit tests for AI Agent LLM client and router.
"""

from app.llm import LLMClient
from app.telemetry import build_context


def test_mock_llm_returns_reply():
    llm = LLMClient()
    result = llm.chat("Hello")
    assert "reply" in result
    assert len(result["reply"]) > 0


def test_mock_llm_temperature_request():
    llm = LLMClient()
    result = llm.chat("Show me temperature data")
    assert result["chart"] is not None
    assert result["chart"]["title"].lower().startswith("cpu")


def test_mock_llm_battery_request():
    llm = LLMClient()
    result = llm.chat("What is the battery status?")
    assert result["chart"] is not None
    assert "battery" in result["chart"]["title"].lower()


def test_mock_llm_alert_request():
    llm = LLMClient()
    result = llm.chat("Any critical alerts?")
    assert "reply" in result
    assert "critical" in result["reply"].lower()


def test_mock_llm_general():
    llm = LLMClient()
    result = llm.chat("How is the factory doing?")
    assert "reply" in result
    assert "nominal" in result["reply"].lower()


def test_llm_not_ready_without_url():
    llm = LLMClient()
    assert llm.ready is False


def test_build_context_no_server():
    ctx = build_context("http://does-not-exist:9999")
    assert "No telemetry" in ctx or "No robot" in ctx


def test_parse_reply_with_chart():
    reply_text = 'Here is the data.\n```json\n{"chart": {"title": "Test", "series": []}}\n```'
    parsed = LLMClient._parse_reply(reply_text)
    assert parsed["reply"] == "Here is the data."
    assert parsed["chart"]["title"] == "Test"
