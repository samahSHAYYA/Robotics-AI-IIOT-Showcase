# Architecture Decisions

This file records significant decisions. Each entry answers:
- **Context:** what was the situation?
- **Decision:** what did we choose?
- **Rationale:** why this over alternatives?

---

## ADR-001: C++ for control logic

- **Context:** Core simulation needs deterministic, low-latency sensor sampling
  and safety supervision.

- **Decision:** Use C++20 for core-platform. Python is excluded for
  control-critical paths unless no viable C++ alternative exists.

- **Rationale:** Python's GIL and GC introduce latency unpredictability. C++20
  provides RAII, constexpr, STL containers, and predictable performance.
  Control logic must never be blocked by GC pauses.

---

## ADR-002: Redis Streams for event transport

- **Context:** Services need async, durable, ordered event delivery with replay
  capability.

- **Decision:** Redis Streams with `XADD`/`XREADGROUP`. One stream per service.
  No per-severity fan-out.

- **Rationale:** Simpler than Kafka for a single-node deployment. Consumer
  groups provide at-least-once delivery with persistent cursors. `MAXLEN` bounds
  memory. No external broker beyond Redis. MQTT and AMQP were considered but add
  unnecessary complexity for local-first.
---

## ADR-003: Single Docker Compose for all services

- **Context:** The full showcase runs on one machine.

- **Decision:** One `docker-compose.yaml` at `src/` with all four services.
  Single bridge network.

- **Rationale:** Simplifies local dev and portfolio demonstration. No
  Kubernetes, no swarm. When cloud migration is needed, service boundaries are
  already clean — each service is independently deployable.

---

## ADR-004: SI-unit canonical storage

- **Context:** Sensors measure in multiple unit systems (metric, imperial).
  Conversion logic must be centralized and auditable.

- **Decision:** Store all measurements in SI base units. Provide explicit
  conversion methods to operational units. Never store non-SI.

- **Rationale:** Eliminates ambiguous-unit bugs. One canonical representation.
 Conversions are explicit call-sites, not implicit state. See `unit.hpp` for
 conversion constants.

---

## ADR-005: Layered env configuration

- **Context:** Services share some config values but need service-specific
  overrides. Secrets must stay out of version control.

- **Decision:** Three-layer env files: `src/.env` (shared, checked in),
  `src/envs/<service>/.env` (per-service, checked in),
  `src/envs/<service>/.env.local` (local overrides, gitignored).

- **Rationale:** Clear precedence, no duplication of shared values, secrets
  stay local. Docker Compose reads them in order naturally.

---

## ADR-006: Doxygen + MkDocs for documentation

- **Context:** C++ API needs generated reference docs. Project docs need a
  navigable site.

- **Decision:** Doxygen for C++ API, MkDocs (Material theme) for markdown.
  Build orchestrated by a single Python script.

- **Rationale:** Doxygen is the standard C++ doc tool. MkDocs Material provides
  search, navigation, dark theme. Combining them gives a single `doc-site/`
  output. Alternative: Sphinx with Breathe — heavier, slower, overkill for this
  scope.

---

## ADR-007: Dot-prefix avoidance in MkDocs source

- **Context:** `.agent/` files need to appear in the MkDocs site nav, but
  MkDocs excludes dot-prefixed directories.

- **Decision:** Sync `.agent/` to `docs/agent/` (dot stripped) during the doc
  build. Nav references `agent/...`.

- **Rationale:** Keeps source directory naming convention intact while working
  around MkDocs limitation. The sync is a build-time step, invisible to
  readers.

---

## ADR-008: Python 3.14 AsyncMock child-method call behavior

- **Context:** The integration-service test suite (94 tests) runs on
  Python 3.14 while other Python services use 3.12. Two distinct
  `AsyncMock` behavioral changes in Python 3.14 caused test failures:

  1. `__aenter__` is now an instance attribute created in `__init__`,
     shadowing the class-level async method. Using `spec` on AsyncMock
     breaks the async context manager protocol.

  2. Calling any child method on an AsyncMock now returns a **coroutine**
     wrapping the `return_value`, not the `return_value` directly. This
     broke synchronous chaining patterns like
     `result.scalars().all()` — `result.scalars()` returned a coroutine,
     so `.all()` failed with `AttributeError: 'coroutine' object has no
     attribute 'all'`.

- **Decision:**

  1. Remove `spec` from AsyncMock when async context manager behavior
     is needed. Use `__aenter__.return_value = session` chaining on the
     mock instance.

  2. Use `MagicMock` (not `AsyncMock`) for objects that are the
     *already-awaited result* of an `await` expression — e.g., the
     return value of `await session.execute(...)`. Since these objects
     are synchronous values, their children should be synchronous
     (`MagicMock`), not async (`AsyncMock`).

  3. Use `return mock_session` instead of `yield mock_session` in
     FastAPI dependency overrides to avoid async-generator protocol
     interactions with AsyncMock.

  4. Use `asyncio_mode = "auto"` in `pyproject.toml` for
     pytest-asyncio.

- **Rationale:** Python 3.14 changed `AsyncMock` internals to create
  instance-level magic method attributes during `__init__`. The child
  method behavior change (returning coroutine-wrapped values) means any
  synchronous method chain on an AsyncMock result breaks. The fix is to
  use `MagicMock` for synchronous mock chains and avoid `spec` on
  `AsyncMock` instances used as async context managers.

---

## ADR-009: Custom event for auth session expiry

- **Context:** The `authFetch` utility cleared all localStorage on 401 responses
  via `localStorage.clear()`. This wiped the JWT token without notifying React's
  `AuthProvider`, so `authed` stayed `true` while subsequent API calls had no
  token — creating an infinite loop of 401s → clear → redirect → reload.

- **Decision:**
  1. `authFetch` now removes only `sf_*` keys (`sf_session`, `sf_role`,
     `sf_tenant_id`, `sf_tenant_name`, `sf_factory_id`, `sf_factory_name`)
     instead of calling `localStorage.clear()`.
  2. After removal, it dispatches `window.dispatchEvent(new
     CustomEvent('auth:expired'))`.
  3. `AuthProvider` listens for `auth:expired` via a `useEffect` and calls
     `logout()`, which sets `authed = false` and clears all auth state.

- **Rationale:** Direct communication between `authFetch` (a utility function)
  and `AuthProvider` (a React component) without introducing circular imports or
  requiring `AuthProvider` to be a global singleton. The CustomEvent pattern is
  standard DOM API, requires no dependencies, and works across React component
  boundaries.

---

## ADR-010: Explicit WebSocket reconnection on auth state change

- **Context:** The `TelemetryProvider` computed the WebSocket URL from
  `buildWsUrl({ baseUrl, factoryId })`. For super_admin users, `factoryId` is
  always null — it never changes between authenticated and unauthenticated
  states. The `buildWsUrl` function reads the JWT from localStorage via
  `getToken()`, which does return different values, but React's rendering
  pipeline had no explicit dependency on auth state.

- **Decision:**
  1. Added `authed` to the `FactoryAwareWsUrlProps` interface.
  2. `TelemetryProvider` now destructures `authed` from `useAuth()` and passes
     it to `buildWsUrl()`.
  3. The parameter is prefixed `_authed` (unused) — its sole purpose is to
     force a new URL reference when auth state flips, triggering `useWebSocket`
     to close the old connection and open a new one with the fresh token.

- **Rationale:** Guarantees WebSocket reconnection on login/logout regardless
  of whether `factoryId` changes. Without this, a race condition could leave
  the WebSocket using a stale or missing token after auth state transitions.

---

## ADR-011: Targeted auth key removal over localStorage.clear()

- **Context:** `authFetch` used `localStorage.clear()` on 401, which destroyed
  ALL localStorage entries — including non-auth app state, cached preferences,
  and layout settings that persist across sessions.

- **Decision:** Replace `localStorage.clear()` with `clearAuthSession()`, a
  helper that calls `removeItem()` on each of the six `sf_*` keys individually.

- **Rationale:** Preserves any non-auth data stored in localStorage. The six
  keys are well-known and version-controlled in `AuthContext.login()` and
  `AuthContext.logout()`, so maintenance is straightforward. This avoids
  data loss and user frustration from wiped preferences.
