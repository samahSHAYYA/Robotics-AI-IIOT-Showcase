# src Structure

## Rule

Each solution/service must have its own folder directly under `src/`, where
each `src/<service>` must be directly runnable on its own.

## Pattern

`src/<service-or-solution-name>/`

## Project Services

`src/core-platform/` Modular monolith for robotics and operations core logic.
  Handles ROS2 orchestration, IIoT ingestion, telemetry processing, alerting,
  maintenance rules, and safety state handling.

`src/ai-service/` AI/ML inference service for decision support and analytics.
  Isolated to keep model runtime and dependencies separate from core operations
  logic.

`src/ops-api/` Unified backend API for operations UI and control surfaces.
  Exposes KPIs, alerts, commands, and historical/operational data.

`src/ops-frontend/` Frontend service for operations dashboards and control
  interfaces. Renders real-time status/KPI views and exposes safe operational
  workflows via the Ops API.

`src/shared/` (not a standalone service) Shared contracts/schemas and small
  reusable Python/C++ utilities used across services.

## Quickstart Demo

```bash
# Build and start all services (with dev profile for hot-reload)
docker compose --profile dev build
docker compose --profile dev up -d

# Open browser to http://localhost:3000
# Login: admin / admin
# Robots move on the factory floor automatically
# Use the Command Console or click on robots to start/stop them
```

To run only the core infrastructure (no hot-reload):
```bash
docker compose up -d
```

## Notes

Keep `src/` root clean.
Do not place service implementation files directly in `src/`.
Shared code should live in a clearly named shared module only when truly cross-
  service.
Every service folder must include a clear startup entrypoint and local run
  instructions.
Every service folder must include `ReadMe.md` explaining purpose,
  responsibilities, and run flow.
Every runnable service folder must include `Dockerfile` and `.dockerignore`.
`shared` must not have a standalone `Dockerfile` (it is not a deployable
  service).

## Root Runtime Files

`.env.template`: template of required environment variables for local setup.
`.env`: local values used by services and compose during development.
`docker-compose.yaml`: local orchestration to run all runnable services
  together.
`.env` and `.env.template` at `src/` level are global/shared defaults, not
  service-specific files.

## Service Env Files

`envs/<service>/.env.template`: service-specific variable template.
`envs/<service>/.env`: service-specific local overrides.
Service env files are specific to that service only and should not contain
  cross-service global defaults.
Compose loads env files in this order:
`src/.env` (global defaults)
`src/envs/<service>/.env` (service overrides)
