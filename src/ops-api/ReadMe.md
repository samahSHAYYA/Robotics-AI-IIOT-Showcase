# Ops API Service

## Purpose

Unified backend API for dashboards and control clients.

## Responsibilities

Expose KPIs and status endpoints.
Expose alert and event query APIs.
Expose safe command interfaces.
Provide historical and operational data interfaces.

## Events emitted (Redis Stream `events:ops-api`)

| `type` | When | Payload |
|---|---|---|
| `api.request` | On REST call | `method`, `endpoint`, `duration`, `status` |
| `api.auth` | On auth event | `user`, `role`, `action`, `result` |
| `api.command` | On control action | `command`, `target`, `actor`, `ts` |

## Key types (planned)

- `DashboardState` — aggregated view (safety, metrics, alerts,
  humanoid status)
- `CommandRequest` — validated command (action, target, params,
  actor)
- `EventQuery` — filter (time_range, type, source, level,
  trace_id)

## Python modules (planned)

`app/` — FastAPI application entrypoint, routes, middleware
`routers/` — REST endpoint groups (status, telemetry, commands,
  alerts, history)
`services/` — business logic (aggregation, command validation,
  event queries)
`consumers/` — Redis Stream consumer group for
  events:core-platform and events:ai-service
`schemas/` — Pydantic models for request/response contracts

## Entrypoint

...

## Run

...
