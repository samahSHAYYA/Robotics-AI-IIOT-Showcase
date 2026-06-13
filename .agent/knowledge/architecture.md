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

## Auth & WebSocket architecture

### Authentication flow

1. **Login**: `POST /api/v1/auth/login` returns JWT + user profile. The frontend
   stores the JWT in `localStorage` key `sf_session` and sets `authed = true` in
   `AuthContext`.

2. **API auth**: `authFetch()` utility (in `utils/auth-fetch.ts`) wraps `fetch()`
   and automatically attaches `Authorization: Bearer <token>`. On 401 responses,
   it removes only `sf_*` keys from localStorage (targeted, not `clear()`) and
   dispatches a `CustomEvent('auth:expired')`.

3. **Session expiry handling**: `AuthProvider` listens for `auth:expired` events
   and calls `logout()`, which sets `authed = false` and clears all auth state.
   This breaks the previous infinite loop where `localStorage.clear()` didn't
   update React state, causing panels to keep making unauthenticated requests.

### WebSocket connection

1. **URL construction**: `TelemetryContext` builds the WS URL via
   `buildWsUrl({ baseUrl, factoryId, authed })`. If a JWT exists
   (`getToken()`), it appends `?token=<encoded_jwt>`. The `authed` parameter
   forces URL reference changes on login/logout even when `factoryId` doesn't
   change (e.g., super_admin).

2. **Reconnection**: `useWebSocket` hook (in `hooks/useWebSocket.ts`) manages
   the connection lifecycle. On URL changes (from auth state flip), it closes
   the old connection and opens a new one with the fresh token. Retry logic:
   5 attempts with 3s delay, then `failed` status.

3. **Nginx proxy**: The `/ws` location in `nginx.conf` passes `Upgrade` and
   `Connection` headers for WebSocket protocol upgrade, proxying to
   `ops-api:8003`.

### Role hierarchy

```
super_admin  (100)  — global access
tenant_admin  (80)  — tenant-level admin
factory_admin (60)  — per-factory management
integrator    (50)  — API key access
operator      (40)  — robot control
viewer        (20)  — read-only
```

Each endpoint uses `require_role(minimum)` hierarchy check or
`get_current_user` for token validation only. `require_factory_access()` and
`require_tenant_access()` add data-scoping layers.

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
