#!/usr/bin/env python3
"""
Smart Factory Supervisor — WebSocket benchmark script.

Connects to the ops-api WebSocket endpoint and measures message throughput.
Reports average message interval and message rate.

Usage:
    python scripts/benchmark-ws.py --url ws://localhost:8003/ws --messages 100
    python scripts/benchmark-ws.py --url ws://localhost:8003/ws --messages 200 --timeout 30
"""

import argparse
import sys
import time

try:
    import websockets.sync.client as ws_client
except ImportError:
    sys.exit(
        'websockets is required. Install with: uv pip install websockets\n'
        'Or run: uv sync --group dev'
    )


def benchmark_ws(url: str, num_messages: int, timeout: float) -> dict:
    """
    Connect to a WebSocket endpoint and measure message receive rate.

    Args:
        url: WebSocket endpoint URL.
        num_messages: Number of messages to receive before disconnecting.
        timeout: Per-message receive timeout in seconds.

    Returns:
        Dict with benchmark statistics.
    """

    latencies: list[float] = []
    received: int = 0

    print(f'Connecting to {url} ...')

    with ws_client.connect(url, open_timeout=timeout) as ws:
        print(f'Connected. Waiting for {num_messages} messages ...')

        while received < num_messages:
            start = time.perf_counter()
            try:
                msg = ws.recv(timeout=timeout)
                elapsed = time.perf_counter() - start
                if msg is None:
                    break
                latencies.append(elapsed)
                received += 1
            except TimeoutError:
                print(f'Timed out after {received} messages.')
                break
            except Exception as exc:
                print(f'Error receiving message: {exc}')
                break

    total_time = sum(latencies)

    if received == 0:
        return {
            'url': url,
            'messages_requested': num_messages,
            'messages_received': 0,
            'error': 'No messages received.',
        }

    return {
        'url': url,
        'messages_requested': num_messages,
        'messages_received': received,
        'total_time_seconds': round(total_time, 4),
        'message_interval': {
            'avg_ms': round((total_time / received) * 1000, 2),
            'min_ms': round(min(latencies) * 1000, 2),
            'max_ms': round(max(latencies) * 1000, 2),
        },
        'message_rate_hz': round(received / total_time, 2) if total_time > 0 else 0.0,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Benchmark ops-api WebSocket message throughput.',
    )
    parser.add_argument(
        '--url',
        default='ws://localhost:8003/ws',
        help='WebSocket endpoint URL (default: ws://localhost:8003/ws)',
    )
    parser.add_argument(
        '--messages',
        type=int,
        default=100,
        help='Number of messages to receive (default: 100)',
    )
    parser.add_argument(
        '--timeout',
        type=float,
        default=30.0,
        help='Per-message receive timeout in seconds (default: 30)',
    )

    args = parser.parse_args()

    print(f'WebSocket Benchmark')
    print(f'  Target:     {args.url}')
    print(f'  Messages:   {args.messages}')
    print(f'  Timeout:    {args.timeout}s')
    print('─' * 40)

    report = benchmark_ws(args.url, args.messages, args.timeout)

    print(f'\nResults:')
    for key, value in report.items():
        if isinstance(value, dict):
            print(f'  {key}:')
            for k, v in value.items():
                print(f'    {k}: {v}')
        else:
            print(f'  {key}: {value}')


if __name__ == '__main__':
    main()
