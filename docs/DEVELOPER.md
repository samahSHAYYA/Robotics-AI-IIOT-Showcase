# Developer Guide

This document is for human developers working on this codebase.
AI agents should read `AGENTS.md` and the `.agent/` directory
instead.

## Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin)
- Python 3.12+
- Node.js 18+
- CMake 3.20+ (for C++ simulation)
- Doxygen 1.12+ (for API docs)

## Quick start

```bash
# Python virtual environment + dependencies (run once)
uv sync --group docs

# Start all services
docker compose -f src/docker-compose.yaml build
docker compose -f src/docker-compose.yaml up -d

# Or run the C++ simulation standalone
cd src/core-platform/cpp
cmake -B build
cmake --build build
./build/core_platform_sim
```

## Project structure

```
.agent/                — AI agent conventions and rules
pyproject.toml         — uv project config & dependency groups
read-me/               — Documentation, SVGs, architecture diagrams
docs/                  — MkDocs source directory (auto-synced from project)
scripts/               — Doc generation tooling
secrets/               — Local development secrets (gitignored)
src/
├── docker-compose.yaml — Multi-service orchestration
├── core-platform/      — C++20 robotics simulation (fully implemented)
├── ai-service/         — Python ML inference (in development)
├── ops-api/            — FastAPI backend (in development)
├── ops-frontend/       — React dashboard (in development)
└── shared/             — Cross-service schemas and utilities
doc-site/               — Generated documentation site (gitignored)
data/                   — Runtime output (gitignored)
logs/                   — Runtime output (gitignored)
```

## Coding conventions

See `.agent/general/coding.md` for the full language-specific rules.

Quick summary:
- C++20 with class-per-file, include guards, SI-unit sensor storage
- Python 3.12 with type hints, spaces around `=` in kwargs (`f(a = b)`)
- TypeScript strict mode, no `any`
- 79-char line wrap for `.md`, 120-char hard limit for code
- Files end with exactly one newline, no trailing whitespace

## Adding a new service

1. Create `src/<service>/` with `Dockerfile`, `.dockerignore`, `ReadMe.md`
2. Add service env files at `src/envs/<service>/`
3. Register the service in `src/docker-compose.yaml`
4. Document its purpose in `src/ReadMe.md`

## Documentation

The project uses MkDocs (markdown) + Doxygen (C++ API) for a unified
dev site.

```bash
# Full build (Doxygen + MkDocs)
uv run --group docs python scripts/generate-docs.py build

# Serve the built site locally
uv run --group docs python -m http.server 8000 --directory doc-site

# Or live preview with file watching
uv run --group docs python scripts/generate-docs.py watch
```

Open http://localhost:8000 to browse. The `watch` command
auto-rebuilds the C++ API docs when source files change.

## Coding standards

- Follow the rules in `.agent/general/coding.md`
- Include tests for every meaningful behavior change
- Validate all external input, never hardcode secrets
- Write clear commit messages with intent, not just content

## License and use

This is a portfolio showcase. The code is provided for reference
and evaluation. No external contributions are accepted.
