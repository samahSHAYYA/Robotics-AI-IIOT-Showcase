"""
@author: Samah SHAYYA
@date: 29-May-2026

@description: Factory agent with PydanticAI real-LLM and mock fallback modes.
"""

from pathlib import Path
from typing import Any

from pydantic_ai import Agent, RunContext
from pydantic_ai.models.openai import OpenAIChatModel

from app.tools import (
    format_snapshot,
    format_robot_status,
    get_robot_status,
    get_telemetry_snapshot,
)

_PROMPT: str = (Path(__file__).parent / 'prompt.md').read_text()


def _build_agent(llm_url: str) -> Agent | None:
    """
    Builds a PydanticAI Agent wired to an OpenAI-compatible LLM endpoint.

    @param llm_url: Base URL for the LLM API (e.g. Ollama).
    @return agent: Configured Agent or None if setup fails.
    """

    try:
        model = OpenAIChatModel(
            'qwen3:14b',
            base_url = llm_url.rstrip('/') + '/v1',
        )
        agent = Agent(
            model,
            system_prompt = _PROMPT,
            deps_type = str,
        )

        @agent.tool
        async def get_telemetry(ctx: RunContext[str]) -> str:
            """
            Fetches the latest telemetry snapshot (throughput, defect rate,
            uptime, robot states, alerts).
            """

            data = await get_telemetry_snapshot(ctx.deps)
            return format_snapshot(data)

        @agent.tool
        async def get_fleet_status(ctx: RunContext[str]) -> str:
            """
            Fetches the current robot fleet status (each robot's id, status,
            uptime, current task).
            """

            data = await get_robot_status(ctx.deps)
            return format_robot_status(data)

        return agent
    except Exception:
        return None


class FactoryAgent:
    """
    Factory supervisor agent with two modes:

    - **Real mode**: Uses PydanticAI Agent backed by an OpenAI-compatible LLM
      (e.g. Ollama). The LLM decides which tools to call.
    - **Mock mode**: Keyword-based fallback with canned responses and chart data
      when no LLM is available.
    """

    def __init__(self, llm_url: str = '', ops_api_url: str = ''):
        """
        Initializes the agent, attempting real LLM connection first.

        @param llm_url: Base URL for an OpenAI-compatible LLM (may be empty).
        @param ops_api_url: Base URL for the ops-api service.
        """

        self._ops_api_url: str = ops_api_url
        self._agent: Agent | None = _build_agent(llm_url)
        self.ready: bool = self._agent is not None

    async def chat(self, message: str) -> dict[str, Any]:
        """
        Processes a chat message and returns a response.

        @param message: User message.
        @return result: Dict with 'reply' (str) and optionally 'chart' (dict).
        """

        if self.ready and self._agent is not None:
            return await self._agent_chat(message)
        return self._mock_chat(message)

    async def _agent_chat(self, message: str) -> dict[str, Any]:
        """
        Sends the message to the PydanticAI Agent for processing.

        @param message: User message.
        @return result: Dict with the LLM's text reply.
        """

        try:
            result = await self._agent.run(message, deps = self._ops_api_url)
            return {'reply': result.data, 'chart': None}
        except Exception as exc:
            return {'reply': f'AI Agent error: {exc}', 'chart': None}

    @staticmethod
    def _mock_chat(message: str) -> dict[str, Any]:
        """
        Keyword-based mock fallback when no LLM is available.

        @param message: User message.
        @return result: Dict with canned reply and optional chart data.
        """

        msg_lower = message.lower()

        if 'temperature' in msg_lower or 'temp' in msg_lower:
            return {
                'reply': (
                    'Robot CPU temperatures are within normal range '
                    '(42-58 °C). No thermal anomalies detected.'
                ),
                'chart': {
                    'title': 'CPU Temperature (°C)',
                    'y_label': 'Temperature (°C)',
                    'series': [
                        {
                            'name': 'robot-01',
                            'data': [
                                {'timestamp': 'T-30s', 'value': 45.2},
                                {'timestamp': 'T-20s', 'value': 47.1},
                                {'timestamp': 'T-10s', 'value': 46.8},
                                {'timestamp': 'T-0s', 'value': 48.3},
                            ],
                        },
                        {
                            'name': 'robot-02',
                            'data': [
                                {'timestamp': 'T-30s', 'value': 52.1},
                                {'timestamp': 'T-20s', 'value': 53.4},
                                {'timestamp': 'T-10s', 'value': 55.0},
                                {'timestamp': 'T-0s', 'value': 54.2},
                            ],
                        },
                    ],
                },
            }

        if 'battery' in msg_lower:
            return {
                'reply': (
                    'All robot batteries above 60%. robot-03 at 62% — '
                    'schedule recharge within 2h.'
                ),
                'chart': {
                    'title': 'Battery Level (%)',
                    'y_label': 'Charge (%)',
                    'series': [
                        {
                            'name': 'robot-01',
                            'data': [
                                {'timestamp': 'T-30s', 'value': 85},
                                {'timestamp': 'T-20s', 'value': 83},
                                {'timestamp': 'T-10s', 'value': 81},
                                {'timestamp': 'T-0s', 'value': 79},
                            ],
                        },
                        {
                            'name': 'robot-03',
                            'data': [
                                {'timestamp': 'T-30s', 'value': 68},
                                {'timestamp': 'T-20s', 'value': 66},
                                {'timestamp': 'T-10s', 'value': 64},
                                {'timestamp': 'T-0s', 'value': 62},
                            ],
                        },
                    ],
                },
            }

        if 'alert' in msg_lower or 'error' in msg_lower or 'critical' in msg_lower:
            return {
                'reply': (
                    'No critical alerts in the last 5 minutes. '
                    '3 warnings logged: high motor load on robot-02, '
                    'network latency spike on robot-03.'
                ),
                'chart': None,
            }

        return {
            'reply': (
                'All systems nominal. 3 robots online, 0 errors, '
                'average CPU 48 °C, battery 74%. '
                'Ask about temperature, battery, or alerts for details.'
            ),
            'chart': None,
        }
