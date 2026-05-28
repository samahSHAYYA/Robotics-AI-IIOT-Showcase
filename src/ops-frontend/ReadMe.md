# Ops Frontend Service

## Purpose

Frontend service for operations dashboards and control interfaces.

## Responsibilities

Render real-time KPIs, status, and telemetry views.
Present alerts, warnings, and critical notifications clearly.
Provide safe control actions through the Ops API.
Support role-based operational workflows and usability.

## Consumes

ops-frontend does not write to Redis Streams. It reads
exclusively through the ops-api HTTP endpoints.

| Endpoint | Data |
|---|---|
| `GET /api/status` | Safety mode, line mode, health score |
| `GET /api/telemetry` | Current sensor readings |
| `GET /api/alerts` | Active warnings and critical alerts |
| `GET /api/metrics` | Production counters and trends |
| `POST /api/command` | Safe control actions (stop, resume, reset) |

## Key types (planned)

- `DashboardLayout` — card/panel positions and visible KPIs per
  role
- `AlertBanner` — severity, message, timestamp, acknowledged
- `TelemetrySnapshot` — latest values per sensor group

## TypeScript modules (planned)

`src/components/` — React component library (KPI cards, charts,
  alert board, command console, safety panel)
`src/hooks/` — custom hooks for polling, SSE, or WebSocket
  subscriptions via ops-api
`src/services/` — API client layer, auth, request builders
`src/pages/` — route-level page assemblies
`src/types/` — TypeScript interfaces matching ops-api schemas

## Entrypoint

...

## Run

...
