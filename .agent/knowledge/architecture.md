# Architecture Knowledge

## System overview

Four Docker services on a single bridge network (`showcase_net`), orchestrated
via Docker Compose:

```
core-platform (C++20)  --->  events:core-platform  --->  ai-service
                                                               |
                                                               v
edge-sim (Python)      --->  events:edge-sim        --->  ops-api
                                                               |
ai-service (Python)    --->  events:ai-service      --->  ops-api
                                                               |
                                          ops-api (Python) ----+
                                                               |
                                               +---------------+
                                               |
                                          HTTP /api/*
                                               |
                                          ops-frontend (React)
                                               |
                                          integration-service (Python 3.14)
                                               |
                                          postgres
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
| `edge-sim` | Python 3.12 | Stub | IoT sensor grid, failure mode simulation |
| `integration-service` | Python 3.14 | Stub | External system integration, sync engine, webhook v2 |

## Redis Stream topology

Each service owns exactly one stream (`events:<service>`). Producers `XADD` to
their stream. Consumers use `XREADGROUP` with persistent cursors (at-least-once
delivery). Streams cap at `MAXLEN ~ 100000`.

| Stream | Producer | Consumers |
|---|---|---|---|
| `events:core-platform` | `core-platform` | `ai-service`, `ops-api` |
| `events:ai-service` | `ai-service` | `ops-api` |
| `events:ops-api` | `ops-api` | — (logged, not consumed) |
| `events:edge-sim` | `edge-sim` | `ops-api` |

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

## Python version divergence

- All Python services use Python 3.12 except `integration-service`, which
  uses Python 3.14 (the latest stable release at time of creation).
- Python 3.14 changes `AsyncMock` behavior: child method calls return
  coroutine-wrapped values, and `__aenter__` is an instance attribute
  created in `__init__`. Tests for the integration-service account for
  these differences.
