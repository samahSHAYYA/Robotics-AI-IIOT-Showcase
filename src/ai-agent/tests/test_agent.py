"""
@author: Samah SHAYYA
@description: Unit tests for AI Agent (PydanticAI refactored).
"""

from app.agent import FactoryAgent
from app.tools import format_snapshot, format_robot_status


def test_mock_returns_reply():
    agent = FactoryAgent()
    result = agent._mock_chat('Hello')
    assert 'reply' in result
    assert len(result['reply']) > 0


def test_mock_temperature_request():
    agent = FactoryAgent()
    result = agent._mock_chat('Show me temperature data')
    assert result['chart'] is not None
    assert result['chart']['title'].lower().startswith('cpu')


def test_mock_battery_request():
    agent = FactoryAgent()
    result = agent._mock_chat('What is the battery status?')
    assert result['chart'] is not None
    assert 'battery' in result['chart']['title'].lower()


def test_mock_alert_request():
    agent = FactoryAgent()
    result = agent._mock_chat('Any critical alerts?')
    assert 'reply' in result
    assert 'critical' in result['reply'].lower()


def test_mock_general():
    agent = FactoryAgent()
    result = agent._mock_chat('How is the factory doing?')
    assert 'reply' in result
    assert 'nominal' in result['reply'].lower()


def test_agent_not_ready_without_url():
    agent = FactoryAgent()
    assert agent.ready is False


def test_format_snapshot_none():
    result = format_snapshot(None)
    assert 'No telemetry data' in result


def test_format_robot_status_none():
    result = format_robot_status(None)
    assert 'No robot status' in result


def test_format_snapshot_with_data():
    data = {'throughput': 1248, 'defect_rate_pct': 1.7}
    result = format_snapshot(data)
    assert '1248' in result
    assert '1.7' in result


def test_async_chat_in_mock_mode():
    import asyncio
    agent = FactoryAgent()
    result = asyncio.run(agent.chat('Hello'))
    assert 'reply' in result
    assert 'nominal' in result['reply'].lower()
