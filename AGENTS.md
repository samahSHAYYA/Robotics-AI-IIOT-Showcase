# AGENTS.md — AI Agent Quickstart

Read this first. It is your entry point to the project.

## Project

**Industrial Humanoid Robotics Smart Factory Supervisor** — a local-first,
Docker-deployed showcase of robotics simulation + AI/ML inference + IIoT
telemetry + secure ops dashboard.

## Structure

```
AGENTS.md              ← you are here
DEVELOPER.md           ← human developer guide (you are the AI)
.agent/general/        ← cross-project rules (comm, coding, errors)
.agent/local/          ← project-specific rules (ui-ux, logging, deploy)
.agent/knowledge/      ← architecture, domain, decisions, glossary
.agent/roles/          ← role defs (orchestrator, dev, reviewer, QA)
.agent/skills/<name>/  ← each skill has skill.md + scripts/
.agent/workflow.md     ← pipeline: roles, handoffs, rejection paths
pyproject.toml         ← uv project config & dependency groups
read-me/               ← docs, SVGs, architecture diagrams
docs/                  ← MkDocs source directory (auto-synced)
scripts/               ← tooling (doc generation, etc.)
secrets/               ← local dev secrets (gitignored)
src/
├── docker-compose.yaml
├── .env / .env.template
├── envs/<service>/    ← per-service env overrides
├── core-platform/     ← C++20 simulation (fully implemented)
│   └── cpp/
│       ├── compilation-resources/  ← JSON config consumed at compile time
│       ├── scripts/                ← codegen & tooling (per-service)
│       ├── resources/              ← runtime assets (models, textures...)
│       ├── include/                ← public/private headers
│       ├── src/                    ← translation units
│       └── CMakeLists.txt
├── ai-service/        ← Python ML inference (placeholder)
├── ops-api/           ← FastAPI backend (placeholder)
├── ops-frontend/      ← React dashboard (placeholder)
└── shared/            ← cross-service schemas/utilities
doc-site/              ← generated documentation site (gitignored)
data/                  ← runtime output (gitignored)
logs/                  ← runtime output (gitignored)
```

## Read `.agent/` first

Load these in order to get context efficiently on a cold start:

| # | File | Why |
|---|------|-----|
| 1 | `.agent/general/communication.md` | Tone, quality bar, delivery rules |
| 2 | `.agent/knowledge/architecture.md` | System architecture, service roles |
| 3 | `.agent/general/coding.md` | Language rules, naming, full conventions |
| 4 | `.agent/general/error-handling.md` | Error taxonomy, retry, recovery |
| 5 | `.agent/local/` (all) | Project-specific: UI-UX, logging, deploy |
| 6 | `.agent/roles/.index.md` | Role responsibilities at a glance |
| 7 | `.agent/workflow.md` | Pipeline stages, handoff, rejection paths |
| 8 | `.agent/skills/<name>/skill.md` | Load only when task matches a skill |

All language conventions live in `.agent/general/coding.md` (single source of
truth). This file only contains the quickstart.

## Essential commands

```bash
# Python virtual environment + dependencies (run once)

uv sync --group docs

# Docker

docker compose -f src/docker-compose.yaml build
docker compose -f src/docker-compose.yaml up -d

# Documentation

python scripts/generate-docs.py build    # Doxygen + MkDocs
python scripts/generate-docs.py serve    # live preview
```

Core platform (standalone):
```bash
cd src/core-platform/cpp && cmake -B build && cmake --build build
./build/core_platform_sim
```

### Skill scripts

```bash
# Markdown formatting

py .agent/skills/md-cleansing/scripts/cleanse-md.py <file.md>
```

## Agent pipeline

This project uses defined agent roles to structure work:

1. **Orchestrator** — plans, delegates, tracks, accepts/rejects
2. **Developer** — implements code per conventions
3. **Reviewer** — checks correctness, conventions, security
4. **QA** — runs tests, validates acceptance criteria

Full details in `.agent/roles/` and `.agent/workflow.md`.

## Quality contract

- Work in fast iterations.
- Deliver concrete improvements each round.
- Self-check before handing work back: correctness, clarity, maintainability,
  performance, simplicity.
- No placeholders unless explicitly asked. Default output is portfolio-grade.
- Raise blockers early with practical options.
- Keep responses short, direct, and result-focused.
