#!/usr/bin/env python3
"""
@author: AI Orchestrator
@date: 04-Jun-2026

@description: Smart Factory Supervisor — one-command launcher.

Checks prerequisites, offers profile selection, runs DB migrations,
starts Docker Compose, and prints access URLs.
Works on Windows (PowerShell) and Linux/Mac (bash).

Usage:
    python start_solution.py          # Interactive mode
    python start_solution.py --auto   # Non-interactive, default profiles
    python start_solution.py --profile ros2  # Force ROS2 profile
"""

import argparse
import os
import platform
import shutil
import subprocess
import sys
import time
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────

REPO_ROOT = Path(__file__).resolve().parent
DOCKER_COMPOSE_FILE = REPO_ROOT / 'src' / 'docker-compose.yaml'
ENV_TEMPLATE = REPO_ROOT / 'src' / '.env.template'
ENV_FILE = REPO_ROOT / 'src' / '.env'
ALEMBIC_DIR = REPO_ROOT / 'src' / 'ops-api' / 'alembic'

# ── Utils ─────────────────────────────────────────────────────────────────────

CYAN = '\033[96m'
GREEN = '\033[92m'
YELLOW = '\033[93m'
RED = '\033[91m'
BOLD = '\033[1m'
RESET = '\033[0m'


def info(msg: str):
    print(f'{CYAN}\u2139{RESET} {msg}')


def ok(msg: str):
    print(f'{GREEN}\u2713{RESET} {msg}')


def warn(msg: str):
    print(f'{YELLOW}\u26a0{RESET} {msg}')


def fail(msg: str):
    print(f'{RED}\u2717{RESET} {msg}', file=sys.stderr)


def heading(text: str):
    width = 60
    print()
    print(f'{BOLD}{text}{RESET}')
    print('\u2500' * width)


def run(cmd: list[str], capture: bool = False) -> subprocess.CompletedProcess:
    """Run a command, optionally capturing output."""
    try:
        if capture:
            return subprocess.run(
                cmd, capture_output=True, text=True, check=False,
            )
        return subprocess.run(cmd, check=False)
    except FileNotFoundError:
        fail(f'Command not found: {cmd[0]}')
        return subprocess.CompletedProcess(cmd, 1)


def is_command_available(name: str) -> bool:
    """Check if a command exists on the PATH."""
    return shutil.which(name) is not None


def is_docker_running() -> bool:
    """Check if Docker daemon is responsive."""
    res = run(['docker', 'info'], capture=True)
    return res.returncode == 0


def detect_os() -> str:
    """Return 'windows', 'linux', or 'mac'."""
    system = platform.system().lower()
    if system == 'windows':
        return 'windows'
    if system == 'darwin':
        return 'mac'
    return 'linux'


# ── Steps ────────────────────────────────────────────────────────────────────

def banner():
    print(f'''
{BOLD}{CYAN}\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2551     Smart Factory Supervisor — Launcher         \u2551
\u2551     Industrial Humanoid Robotics IIoT Suite     \u2551
\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d{RESET}
''')


def check_prerequisites() -> bool:
    """Verify Docker, Python, and platform-specific tools."""
    heading('Checking prerequisites')

    all_ok = True

    # Docker
    if not is_command_available('docker'):
        fail('Docker is not installed. Install Docker Desktop / Docker CE.')
        all_ok = False
    else:
        ok('Docker found')

    # Docker Compose (modern plugin)
    if not is_command_available('docker'):
        all_ok = False
    else:
        res = run(['docker', 'compose', 'version'], capture=True)
        if res.returncode == 0:
            ok(f'Docker Compose: {res.stdout.strip()}')
        else:
            warn('docker compose plugin not found — trying docker-compose')
            if not is_command_available('docker-compose'):
                fail('Neither docker compose nor docker-compose is available.')
                all_ok = False
            else:
                ok('docker-compose found (legacy)')

    # Docker daemon running
    if all_ok and not is_docker_running():
        warn('Docker daemon does not appear to be running.')
        ans = input('  Start Docker and retry? (y/N): ').strip().lower()
        if ans == 'y':
            if detect_os() == 'windows':
                run(['powershell', '-Command',
                     'Start-Process "Docker Desktop"'])
            elif detect_os() == 'mac':
                run(['open', '-a', 'Docker'])
            else:
                run(['systemctl', 'start', 'docker'])
            info('Waiting for Docker to start...')
            for _ in range(30):
                if is_docker_running():
                    ok('Docker is now running.')
                    break
                time.sleep(2)
            else:
                fail('Docker did not start. Please start it manually.')
                all_ok = False
        else:
            fail('Docker is required.')
            all_ok = False

    print()
    return all_ok


def ensure_env_file() -> bool:
    """Create .env from template if it doesn't exist."""
    heading('Environment configuration')

    if ENV_FILE.exists():
        ok('.env file already exists')
        return True

    if not ENV_TEMPLATE.exists():
        fail(f'Template not found: {ENV_TEMPLATE}')
        return False

    shutil.copy2(ENV_TEMPLATE, ENV_FILE)
    ok(f'Created .env from template ({ENV_TEMPLATE.name})')
    warn('Review src/.env and adjust secrets for production.')
    return True


def select_profile(auto: bool = False,
                   force_profile: str | None = None) -> list[str]:
    """Determine Docker Compose profile flags."""
    heading('Profile selection')

    profiles = []

    if force_profile:
        info(f'Forced profile: {force_profile}')
        profiles.append(f'--profile={force_profile}')
        return profiles

    if auto:
        info('Auto mode — using default profiles (no ROS2)')
        return profiles

    print('Available profiles:')
    print('  (none)  — Core services only (Redis, Postgres, ops-api, etc.)')
    print('  ros2    + ROS2/Gazebo simulation (Gazebo + bridge)')
    print()

    ans = input(
        'Include ROS2/Gazebo simulation? This is heavy. (y/N): '
    ).strip().lower()
    if ans == 'y':
        profiles.append('--profile=ros2')
        ok('ROS2 profile selected')
    else:
        info('Starting with core services only')

    return profiles


def run_migrations() -> bool:
    """Run Alembic database migrations if available."""
    heading('Database migrations')

    if not ALEMBIC_DIR.exists():
        warn('No Alembic directory found — skipping migrations')
        return True

    info('Applying database migrations...')
    res = run([
        'docker', 'compose', '-f', str(DOCKER_COMPOSE_FILE),
        'exec', '-T', 'ops-api',
        'uv', 'run', 'alembic', 'upgrade', 'head',
    ])
    if res.returncode == 0:
        ok('Migrations applied')
        return True

    warn('Could not run migrations via docker exec '
         '(services may not be running yet).')
    info('Migrations will run automatically on ops-api startup '
         '(lifespan init_db).')
    return True


def start_services(profiles: list[str], rebuild: bool = False) -> bool:
    """Run docker compose up with selected profiles."""
    heading('Starting services')

    cmd = [
        'docker', 'compose', '-f', str(DOCKER_COMPOSE_FILE),
        *profiles,
    ]

    if rebuild:
        info('Building images...')
        build_cmd = [*cmd, 'build', '--pull']
        res = run(build_cmd)
        if res.returncode != 0:
            fail('Build failed. Check logs above.')
            return False
        ok('All images built')

    info('Starting containers (this may take a moment)...')
    up_cmd = [*cmd, 'up', '-d']
    res = run(up_cmd)

    if res.returncode != 0:
        fail('Failed to start services.')
        return False

    ok('Services started')
    return True


def wait_for_healthy(timeout_s: int = 60) -> bool:
    """Poll docker compose ps until all services are healthy or timeout."""
    heading('Waiting for services to be healthy')

    for i in range(timeout_s):
        res = run([
            'docker', 'compose', '-f', str(DOCKER_COMPOSE_FILE),
            'ps', '--format', 'json',
        ], capture=True)
        if res.returncode != 0:
            time.sleep(1)
            continue

        lines = [l for l in res.stdout.strip().split('\n') if l]
        all_healthy = True
        running_count = 0
        for line in lines:
            if '"Status"' in line:
                running_count += 1
                if 'healthy' not in line and '(unhealthy)' not in line:
                    all_healthy = False

        if running_count == 0:
            time.sleep(2)
            continue

        if all_healthy:
            ok('All services are healthy')
            return True

        dots = '.' * ((i % 6) + 1)
        print(f'\r  Waiting for services to be healthy{dots:<8}',
              end='', flush=True)
        time.sleep(1)

    print()
    warn('Some services may still be starting.'
         ' Check with: docker compose ps')
    return False


def show_dashboard():
    """Print access URLs and useful commands."""
    heading('Dashboard & Access')

    print(f'''
  {BOLD}Frontend:{RESET}       http://localhost:3000
  {BOLD}API (ops-api):{RESET}  http://localhost:8003/docs
  {BOLD}AI Agent:{RESET}       http://localhost:8004/docs
  {BOLD}AI Service:{RESET}     http://localhost:8002/docs
  {BOLD}Edge Sim:{RESET}       http://localhost:8005/docs

  {BOLD}Redis:{RESET}          redis://localhost:6379
  {BOLD}PostgreSQL:{RESET}     postgresql://showcase:showcase_secret@localhost:5432/showcase

  {BOLD}Login:{RESET}
    super_admin:   admin / admin
    tenant_admin:  tenant_admin / admin
    factory_admin: factory_admin / admin
    operator:      operator / operator
    viewer:        viewer / viewer
    integrator:    (API key — see ops-api logs on first startup)
''')

    print(f'{BOLD}Useful commands:{RESET}')
    print('  View logs:       docker compose -f src/docker-compose.yaml'
          ' logs -f')
    print('  Stop services:   docker compose -f src/docker-compose.yaml down')
    print('  Restart a svc:   docker compose -f src/docker-compose.yaml'
          ' restart <name>')
    print('  Service status:  docker compose -f src/docker-compose.yaml ps')
    print()


def show_status():
    """Print docker compose ps output."""
    heading('Service status')
    run(['docker', 'compose', '-f', str(DOCKER_COMPOSE_FILE), 'ps'])
    print()


# ── Main ─────────────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(
        description='Smart Factory Supervisor — one-command launcher',
    )
    parser.add_argument(
        '--auto', action='store_true',
        help='Non-interactive mode: use defaults, no prompts',
    )
    parser.add_argument(
        '--profile', type=str, default=None,
        help='Force a specific Docker Compose profile (e.g., ros2)',
    )
    parser.add_argument(
        '--rebuild', action='store_true',
        help='Rebuild images before starting',
    )
    parser.add_argument(
        '--migrations', action='store_true', default=True,
        help='Run DB migrations on startup (default: true)',
    )
    return parser.parse_args()


def main():
    args = parse_args()
    banner()

    # Step 1: Prerequisites
    if not check_prerequisites():
        sys.exit(1)

    # Step 2: Environment
    if not ensure_env_file():
        sys.exit(1)

    # Step 3: Profile selection
    profiles = select_profile(auto=args.auto, force_profile=args.profile)

    # Step 4: Build & start
    if not start_services(profiles, rebuild=args.rebuild):
        sys.exit(1)

    # Step 5: Wait for health
    wait_for_healthy()

    # Step 6: Migrations
    if args.migrations:
        run_migrations()

    # Step 7: Status & dashboard
    show_status()
    show_dashboard()

    print(f'{GREEN}{BOLD}\U0001f389 Smart Factory Supervisor is running!{RESET}')
    print()


if __name__ == '__main__':
    main()
