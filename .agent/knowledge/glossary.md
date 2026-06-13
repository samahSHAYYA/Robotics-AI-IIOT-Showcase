# Glossary

## A

**assembly**: Production domain for line orchestration events (`phase_change`,
`batch_start`, `batch_end`, `reject`).

**authFetch**: Frontend utility (`utils/auth-fetch.ts`) that wraps `fetch()` with automatic JWT Bearer token attachment. On 401 responses, removes `sf_*` localStorage keys and dispatches `auth:expired` custom event.

## C

**camera**: Domain for inspection events (`inspection`, `defect_detected`,
`frame_skip`).

**consumer group**: Redis Stream mechanism for at-least-once delivery with
persistent cursor. Each service has its own group per stream.

**core-platform**: C++20 service that simulates sensors, assembly line,
camera, safety supervision, and humanoid missions.

## D

**degraded**: Safety mode for non-critical faults. System continues with
reduced capability.

**Doxygen**: Documentation generator for C++ API reference.
Output at `docs/doxygen/html/`.

## E

**events:core-platform**: Redis Stream written by core-platform, consumed by
ai-service and ops-api.

**events:ai-service**: Redis Stream written by ai-service, consumed by
ops-api.

## H

**humanoid**: Domain for robot mission events (`state_change`, `battery`,
`task_update`, `error`).

**humanoid mission**: Robot behavior cycle: idle, patrol, inspect, dock,
safe-hold.

## J

**JWT (JSON Web Token)**: Authentication token issued by `POST /api/v1/auth/login`. Stored in `localStorage` as `sf_session`. Passed as `Authorization: Bearer <token>` for API calls and as `?token=<jwt>` query param for WebSocket connections.

## L

**LineState**: Aggregate runtime struct containing line_mode, safety_mode,
batch_id, station phases, sensors, cameras, conveyor, humanoid, metrics, and
alerts.

## M

**ml**: Domain for ML events (`inference`, `prediction`, `model_load`, `drift`).

## O

**ops-api**: Python/FastAPI service providing REST endpoints for dashboards
and control clients.

**ops-frontend**: React/TypeScript dashboard consuming ops-api HTTP endpoints.

**ops-api auth deps**: FastAPI dependency injection for auth: `get_current_user` (validates JWT, returns User or 401), `require_role(minimum)` (hierarchical role check, returns User or 403), `require_factory_access()` (scopes user to their factory), `require_tenant_access()` (scopes user to their tenant).

## R

**running**: Normal safety mode. All systems operational.

**role hierarchy**: Six levels — super_admin (100), tenant_admin (80), factory_admin (60), integrator (50), operator (40), viewer (20). Endpoints declare minimum role via `require_role(minimum)`.

## S

**safety**: Domain for safety events (`mode_change`, `alert`, `override`,
`recovery`).

**sensor**: Domain for telemetry events (`telemetry`, `threshold_breach`,
`calibration`).

**sensor suite**: Seven sensor types — temperature, vibration, current,
torque, pressure, humidity, distance. Each uses SI-unit canonical storage.

**SI unit**: International System of Units. Canonical storage format for all
sensor measurements. Conversions to operational units are explicit call-sites.

**stopped**: Safety mode for critical faults. Requires manual reset.

**showcase_net**: Docker bridge network shared by all services.

**sf_session**: localStorage key holding the JWT token. Set by `AuthContext.login()`, removed by `authFetch` on 401 and by `AuthContext.logout()`.

## T

**trace_id**: UUID v4 propagated across services for event correlation.
Transported via HTTP header `X-Trace-Id` or Redis Stream field.

## W

**WorkObject**: Item on conveyor with object_id, model, phase, and quality
state.

**write_event()**: Core logging pattern in C++. Emits one JSON object per
line to the event stream.

**WebSocket auth**: The frontend connects to `/ws` with `?token=<jwt>` query param. The backend validates the JWT in the WebSocket handshake. `TelemetryContext` manages the WS URL and triggers reconnection when `authed` state changes.
