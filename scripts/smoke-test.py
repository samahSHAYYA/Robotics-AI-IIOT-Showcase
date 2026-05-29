"""
@author: AI Developer
@date: 29-May-2026

@description: End-to-end smoke test for Smart Factory Supervisor.
Verifies all Docker services respond correctly.
"""

import argparse
import asyncio
import json
import sys
import time

import httpx
import websockets


GREEN_CHECK = '+'
RED_CROSS = 'x'
GREEN = '\033[92m'
RED = '\033[91m'
CYAN = '\033[96m'
RESET = '\033[0m'


def log_pass(message: str) -> None:
    """Log a passing check with green formatting.

    @param message: Description of the check that passed.
    """

    print(f'  {GREEN}{GREEN_CHECK} {message}{RESET}')


def log_fail(message: str) -> None:
    """Log a failing check with red formatting.

    @param message: Description of the check that failed.
    """

    print(f'  {RED}{RED_CROSS} {message}{RESET}')


def log_info(message: str) -> None:
    """Log an informational message with cyan formatting.

    @param message: The info text to display.
    """

    print(f'  {CYAN}{message}{RESET}')


async def check_http(
    client: httpx.AsyncClient,
    name: str,
    url: str,
    timeout: float,
    expect_status: int = 200,
    expect_json: bool = False,
    allow_fail: bool = False,
) -> bool:
    """Perform an HTTP GET check and report result.

    @param client: Shared httpx async client.
    @param name: Human-readable check name.
    @param url: Full URL to request.
    @param timeout: Request timeout in seconds.
    @param expect_status: Expected HTTP status code.
    @param expect_json: If True, verify response is valid JSON.
    @param allow_fail: If True, log failure as info instead of error.

    @return passed: True if the check succeeded.
    """

    try:
        resp = await client.get(url, timeout=timeout)
        if resp.status_code == expect_status:
            if expect_json:
                resp.json()
            log_pass(f'{name} ({url})')
            return True
        log_fail(f'{name} — expected {expect_status}, got {resp.status_code} ({url})')
        return False
    except httpx.TimeoutException:
        msg = f'{name} — timed out after {timeout}s ({url})'
        if allow_fail:
            log_info(msg)
        else:
            log_fail(msg)
        return False
    except Exception as exc:
        msg = f'{name} — {exc} ({url})'
        if allow_fail:
            log_info(msg)
        else:
            log_fail(msg)
        return False


async def check_websocket(name: str, url: str, timeout: float) -> bool:
    """Connect to a WebSocket and wait for a snapshot message.

    @param name: Human-readable check name.
    @param url: WebSocket URL to connect to.
    @param timeout: Seconds to wait for the snapshot message.

    @return passed: True if a snapshot message was received.
    """

    try:
        async with websockets.connect(url) as ws:
            msg = await asyncio.wait_for(ws.recv(), timeout=timeout)
            data = json.loads(msg)
            if isinstance(data, dict) and data.get('type') == 'snapshot':
                log_pass(f'{name} ({url})')
                return True
            log_fail(f'{name} — unexpected message format ({url})')
            return False
    except asyncio.TimeoutError:
        log_fail(f'{name} — no snapshot within {timeout}s ({url})')
        return False
    except Exception as exc:
        log_fail(f'{name} — {exc} ({url})')
        return False


async def check_ai_chat(
    client: httpx.AsyncClient,
    name: str,
    url: str,
    timeout: float,
) -> bool:
    """Send a chat message to the AI agent and verify a response.

    @param client: Shared httpx async client.
    @param name: Human-readable check name.
    @param url: Full URL for the chat endpoint.
    @param timeout: Request timeout in seconds.

    @return passed: True if a valid response was received.
    """

    try:
        payload = {'message': 'summarize factory status'}
        resp = await client.post(
            url,
            json=payload,
            timeout=timeout,
        )
        if resp.status_code == 200:
            body = resp.json()
            if 'reply' in body:
                log_pass(f'{name} ({url})')
                return True
            log_fail(f'{name} — response missing "reply" field ({url})')
            return False
        log_fail(f'{name} — expected 200, got {resp.status_code} ({url})')
        return False
    except httpx.TimeoutException:
        log_fail(f'{name} — timed out after {timeout}s ({url})')
        return False
    except Exception as exc:
        log_fail(f'{name} — {exc} ({url})')
        return False


async def check_tcp(name: str, host: str, port: int, timeout: float) -> bool:
    """Check TCP connectivity to a host:port.

    @param name: Human-readable check name.
    @param host: Target hostname.
    @param port: Target port.
    @param timeout: Seconds before giving up.

    @return passed: True if TCP connection succeeded.
    """

    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port),
            timeout=timeout,
        )
        writer.close()
        await writer.wait_closed()
        log_pass(f'{name} ({host}:{port})')
        return True
    except asyncio.TimeoutError:
        log_fail(f'{name} — timed out after {timeout}s ({host}:{port})')
        return False
    except Exception as exc:
        log_fail(f'{name} — {exc} ({host}:{port})')
        return False


async def main() -> int:
    """Run all smoke test checks and return exit code."""

    parser = argparse.ArgumentParser(
        description='End-to-end smoke test for Smart Factory Supervisor.',
    )
    parser.add_argument(
        '--timeout',
        type=float,
        default=15.0,
        help='Timeout in seconds per check (default: 15)',
    )
    args = parser.parse_args()

    timeout: float = args.timeout

    print(f'\n{GREEN}========================================{RESET}')
    print(f'{GREEN}  Smart Factory Supervisor — Smoke Test{RESET}')
    print(f'{GREEN}========================================{RESET}\n')

    checks: list[tuple[str, str, bool]] = [
        ('ops-api health', 'http://localhost:8003/health', False),
        ('ops-api root', 'http://localhost:8003/', True),
        ('ai-agent health', 'http://localhost:8004/health', False),
        ('ai-service health', 'http://localhost:8002/health', False),
        ('ops-frontend', 'http://localhost:3000/', False),
    ]

    passed: int = 0
    total: int = len(checks) + 3  # +3 for TCP, WebSocket, AI chat

    async with httpx.AsyncClient() as client:
        for check_name, check_url, expect_json in checks:
            ok = await check_http(
                client, check_name, check_url, timeout,
                expect_json=expect_json,
            )
            if ok:
                passed += 1

        print()
        log_info('Checking core-platform TCP connectivity...')
        tcp_ok = await check_tcp(
            'core-platform', 'localhost', 8001, timeout,
        )
        if tcp_ok:
            passed += 1

        print()
        log_info('Checking WebSocket snapshot...')
        ws_ok = await check_websocket(
            'WebSocket snapshot',
            'ws://localhost:8003/ws',
            timeout,
        )
        if ws_ok:
            passed += 1

        print()
        log_info('Checking AI Agent chat...')
        chat_ok = await check_ai_chat(
            client,
            'AI Agent chat',
            'http://localhost:8004/api/v1/agent/chat',
            timeout,
        )
        if chat_ok:
            passed += 1

    print()
    print('----------------------------------------')
    if passed == total:
        print(f'{GREEN}  ALL {total}/{total} CHECKS PASSED{RESET}')
        result: int = 0
    else:
        print(f'{RED}  {passed}/{total} CHECKS PASSED{RESET}')
        result = 1
    print('----------------------------------------\n')

    return result


if __name__ == '__main__':
    exit_code: int = asyncio.run(main())
    sys.exit(exit_code)
