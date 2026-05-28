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
