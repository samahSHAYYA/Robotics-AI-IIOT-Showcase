# Architecture Knowledge

## System overview

Four Docker services on a single bridge network (`showcase_net`), orchestrated
via Docker Compose:

```
core-platform (C++20)  --->  events:core-platform  --->  ai-service
                                                              |
                                                              v
ai-service (Python)    --->  events:ai-service     --->  ops-api
                                                              |
                                         ops-api (Python) ----+
                                              |
                                         HTTP /api/*
                                              |
                                         ops-frontend (React)
```

All services communicate through Redis Streams for async events. The frontend
reads only through the REST API — it has no direct stream access.

## Service boundaries

| Service | Language | Status | Concerns |
|---|---|---|---|
| `core-platform` | C++20 | Full | Sensor sim, assembly, safety, humanoid |
| `ai-service` | Python 3.12 | Stub | ML inference, anomaly, model lifecycle |
| `ops-api` | Python 3.12 | Stub | REST, aggregation, queries, validation |
| `ops-frontend` | TS/React | Stub | Dashboard, telemetry, control |

## Redis Stream topology

Each service owns exactly one stream (`events:<service>`). Producers `XADD` to
their stream. Consumers use `XREADGROUP` with persistent cursors (at-least-once
delivery). Streams cap at `MAXLEN ~ 100000`.

| Stream | Producer | Consumers |
|---|---|---|
| `events:core-platform` | `core-platform` | `ai-service`, `ops-api` |
| `events:ai-service` | `ai-service` | `ops-api` |
| `events:ops-api` | `ops-api` | — (logged, not consumed) |

## Network

- Bridge network `showcase_net` with container-name DNS
- Ports exposed to host only for external access
- Internal services use container hostnames (e.g. `http://core-platform:8001`)

## Volumes

| Volume | Purpose |
|---|---|
| `core_platform_data` | Runtime snapshots (`data/final_state.json`) |
| `core_platform_logs` | Persistent event logs (`logs/events.jsonl`) |
| `ai_service_models` | ML model artifacts |
| `ai_service_cache` | Inference cache |

## Documentation site

Doxygen (C++ API) + MkDocs (markdown) built to `doc-site/`. Source markdown
lives at `read-me/`, `src/`, `.agent/` and is synced to `docs/` before each
build.

## Deployment

Single `docker-compose.yaml` at `src/`. Environment via layered `.env` files
(global + per-service + optional `.env.local` for secrets). See
`.agent/local/deployment.md`.
