#!/usr/bin/env python3
"""
Smart Factory Supervisor — API benchmark script.

Measures latency and throughput of the ops-api REST endpoints.
Results are printed to console and optionally written to a JSON report file.

Usage:
    python scripts/benchmark-api.py --url http://localhost:8003 --concurrency 10
    python scripts/benchmark-api.py --url http://localhost:8003 --output report.json
"""

import argparse
import json
import sys
import time
from statistics import mean, median, stdev

try:
    import httpx
except ImportError:
    sys.exit(
        'httpx is required. Install it with: uv pip install httpx\n'
        'Or run: uv sync --group dev'
    )


# ── Benchmark helpers ───────────────────────────────────────────────────────

def _run_benchmark(
    client: httpx.Client,
    url: str,
    requests: int,
    concurrency: int,
) -> dict:
    """Run a benchmark against a single endpoint and return statistics."""

    latencies: list[float] = []
    errors: int = 0

    def _single_request() -> float | None:
        nonlocal errors
        start = time.perf_counter()
        try:
            resp = client.get(url, timeout=30.0)
            _ = resp.text  # ensure body is read
            if resp.status_code >= 400:
                errors += 1
        except Exception:
            errors += 1
            return None
        elapsed = time.perf_counter() - start
        return elapsed

    # Sequential warm-up request
    _single_request()

    # Batch requests
    batch_size = min(concurrency, requests)
    remaining = requests

    while remaining > 0:
        n = min(batch_size, remaining)
        for _ in range(n):
            result = _single_request()
            if result is not None:
                latencies.append(result)
        remaining -= n

    # Compute statistics
    n_ok = len(latencies)
    n_err = errors
    n_total = requests

    if n_ok == 0:
        return {
            'url': url,
            'requests_total': n_total,
            'errors': n_err,
            'error_rate': 1.0,
            'message': 'All requests failed — check server and network.',
        }

    latencies.sort()
    return {
        'url': url,
        'requests_total': n_total,
        'errors': n_err,
        'error_rate': round(n_err / n_total, 4),
        'latency_ms': {
            'min': round(min(latencies) * 1000, 2),
            'max': round(max(latencies) * 1000, 2),
            'avg': round(mean(latencies) * 1000, 2),
            'median': round(median(latencies) * 1000, 2),
            'stdev': round(stdev(latencies) * 1000, 2) if n_ok > 1 else 0.0,
            'p50': round(latencies[int(n_ok * 0.50)] * 1000, 2),
            'p95': round(latencies[int(n_ok * 0.95)] * 1000, 2),
            'p99': round(latencies[int(n_ok * 0.99)] * 1000, 2),
        },
        'requests_per_sec': round(n_ok / sum(latencies), 2) if sum(latencies) > 0 else 0.0,
        'latency_seconds': {
            'min': round(min(latencies), 4),
            'max': round(max(latencies), 4),
            'avg': round(mean(latencies), 4),
        },
    }


def _print_report(report: dict, label: str = '') -> None:
    """Pretty-print a benchmark report to console."""

    if label:
        print(f'\n═══ {label} ═══')

    print(f'  URL:                  {report["url"]}')
    print(f'  Total requests:       {report["requests_total"]}')
    print(f'  Errors:               {report["errors"]}')
    print(f'  Error rate:           {report["error_rate"]:.2%}')

    if 'latency_ms' in report:
        lat = report['latency_ms']
        print(f'  Latency (ms):')
        print(f'    min         {lat["min"]:>8.2f}')
        print(f'    max         {lat["max"]:>8.2f}')
        print(f'    avg         {lat["avg"]:>8.2f}')
        print(f'    median      {lat["median"]:>8.2f}')
        print(f'    stdev       {lat["stdev"]:>8.2f}')
        print(f'    p50         {lat["p50"]:>8.2f}')
        print(f'    p95         {lat["p95"]:>8.2f}')
        print(f'    p99         {lat["p99"]:>8.2f}')

    print(f'  Requests/sec:         {report.get("requests_per_sec", "N/A"):>8.2f}')


# ── Main ────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description='Benchmark ops-api REST endpoints.',
    )
    parser.add_argument(
        '--url',
        default='http://localhost:8003',
        help='Base URL of the ops-api (default: http://localhost:8003)',
    )
    parser.add_argument(
        '--concurrency',
        type=int,
        default=5,
        help='Number of concurrent requests per batch (default: 5)',
    )
    parser.add_argument(
        '--output',
        default=None,
        help='Optional JSON file path to write results to',
    )

    args = parser.parse_args()
    base_url = args.url.rstrip('/')

    endpoints = [
        ('GET /health', f'{base_url}/health', 100),
        ('GET /api/v1/analytics/current', f'{base_url}/api/v1/analytics/current', 50),
    ]

    print(f'Benchmark target: {base_url}')
    print(f'Concurrency:      {args.concurrency}')
    print('─' * 50)

    all_reports: list[dict] = []

    with httpx.Client(base_url=base_url) as client:
        for label, url, count in endpoints:
            report = _run_benchmark(client, url, count, args.concurrency)
            _print_report(report, label)
            all_reports.append(report)

    if args.output:
        summary = {
            'target': base_url,
            'concurrency': args.concurrency,
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'endpoints': all_reports,
        }
        with open(args.output, 'w') as f:
            json.dump(summary, f, indent=2)
        print(f'\nResults written to: {args.output}')


if __name__ == '__main__':
    main()
