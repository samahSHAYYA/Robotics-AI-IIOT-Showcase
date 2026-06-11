"""
@author: Samah SHAYYA
@date: 28-May-2026

@description: Centralized test runner. Runs each service's tests with
correct PYTHONPATH and rootdir so modules resolve properly.
"""

import subprocess
import sys

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SERVICES = [
    ("shared", ROOT / "src" / "shared"),
    ("ops-api", ROOT / "src" / "ops-api"),
    ("ai-service", ROOT / "src" / "ai-service"),
    ("ai-agent", ROOT / "src" / "ai-agent"),
]

exit_code = 0

for name, service_dir in SERVICES:
    test_dir = service_dir / "tests"
    if not test_dir.exists():
        print(f"\n  [{name}] No tests/ directory — skipping")
        continue

    print(f"\n{'='*60}")
    print(f"  Running {name} tests...")
    print(f"{'='*60}")

    result = subprocess.run(
        [sys.executable, "-m", "pytest", str(test_dir), "-v", "--rootdir", str(service_dir)],
        capture_output=False,
    )

    if result.returncode != 0:
        print(f"  [{name}] FAILED (exit {result.returncode})")
        exit_code = 1

print(f"\n{'='*60}")
if exit_code == 0:
    print("  All tests passed!")
else:
    print("  Some tests failed.")
print(f"{'='*60}")

sys.exit(exit_code)
