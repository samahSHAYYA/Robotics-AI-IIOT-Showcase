"""
@author: Samah SHAYYA
@date: 29-May-2026

@description: Factory agent with PydanticAI real-LLM and mock fallback modes.
"""

import json
import os

from pathlib import Path
from typing import Any, AsyncGenerator

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

    model_name: str = os.getenv('LLM_MODEL', 'qwen3:14b')

    try:
        model = OpenAIChatModel(
            model_name,
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

    async def chat(self, message: str, history: list[dict] | None = None) -> dict[str, Any]:
        """
        Processes a chat message and returns a response.

        @param message: User message.
        @param history: Optional list of previous messages (each with 'role' and 'content').
        @return result: Dict with 'reply' (str) and optionally 'chart' (dict).
        """

        if self.ready and self._agent is not None:
            return await self._agent_chat(message, history=history)
        return self._mock_chat(message)

    async def chat_stream(self, message: str, history: list[dict] | None = None) -> AsyncGenerator[str, None]:
        """
        Streaming chat — yields SSE-formatted JSON strings.

        @param message: User message.
        @param history: Optional list of previous messages for context.
        @yield: 'data: {"token": "..."}\\n\\n' or 'data: {"done": true, "reply": "..."}\\n\\n'
        """

        if self.ready and self._agent is not None:
            async for chunk in self._agent_chat_stream(message, history=history):
                yield chunk
        else:
            result = self._mock_chat(message)
            reply = result.get('reply', '')
            yield json.dumps({'token': reply})
            yield json.dumps({'done': True, 'reply': reply})

    async def _agent_chat(self, message: str, history: list[dict] | None = None) -> dict[str, Any]:
        """
        Sends the message to the PydanticAI Agent for processing.

        @param message: User message.
        @param history: Optional conversation history for context.
        @return result: Dict with the LLM's text reply.
        """

        try:
            prompt = self._build_prompt_with_history(message, history)
            result = await self._agent.run(prompt, deps=self._ops_api_url)
            return {'reply': result.data, 'chart': None}
        except Exception as exc:
            return {'reply': f'AI Agent error: {exc}', 'chart': None}

    async def _agent_chat_stream(self, message: str, history: list[dict] | None = None) -> AsyncGenerator[str, None]:
        """
        Streams tokens from the PydanticAI Agent.

        @param message: User message.
        @param history: Optional conversation history.
        @yield: SSE JSON strings with tokens / done signal.
        """

        try:
            prompt = self._build_prompt_with_history(message, history)
            # PydanticAI doesn't have a native streaming API for Agent.run,
            # so we simulate progressive tokens by sending the full reply as one token.
            # In production with an OpenAI streaming client, replace this block.
            result = await self._agent.run(prompt, deps=self._ops_api_url)
            reply = result.data

            # Yield the response in word-sized chunks for a streaming effect
            words = reply.split(' ')
            for i, word in enumerate(words):
                token = word + (' ' if i < len(words) - 1 else '')
                yield json.dumps({'token': token})
                import asyncio
                await asyncio.sleep(0.02)  # Small delay to simulate streaming

            yield json.dumps({'done': True, 'reply': reply})
        except Exception as exc:
            yield json.dumps({'token': f'AI Agent error: {exc}'})
            yield json.dumps({'done': True, 'reply': f'AI Agent error: {exc}'})

    @staticmethod
    def _build_prompt_with_history(message: str, history: list[dict] | None = None) -> str:
        """
        Builds a prompt by prepending conversation history to the current message.

        @param message: Current user message.
        @param history: Previous messages (role + content).
        @return prompt: Formatted prompt string.
        """

        if not history:
            return message

        lines: list[str] = []
        for msg in history[-20:]:  # Keep last 20 messages as context
            role = msg.get('role', 'user')
            content = msg.get('content', '')
            lines.append(f'{role.capitalize()}: {content}')
        lines.append(f'User: {message}')
        lines.append('Assistant:')
        return '\n'.join(lines)

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
