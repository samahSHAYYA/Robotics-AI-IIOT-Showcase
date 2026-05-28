# Logging Guidelines

## Purpose

Define a consistent structured logging contract across all services (C++,
Python, TypeScript) so that every event is machine-parseable, correlatable,
and dashboard-ready without ad-hoc parsing.

## Schema

Every emitted log entry must be a single JSON object with exactly
these top-level keys:

| Field | Type | Req | Description |
|---|---|---|---|
| `timestamp` | string | yes | RFC 3339 UTC |
| `source` | string | yes | Producing service |
| `type` | string | yes | `<domain>.<category>` |
| `level` | string | yes | debug / info / warn / error / fatal |
| `trace_id` | string | no | Event correlation key |
| `payload` | object | yes | Event-specific data |

Example:

```json
{
  "timestamp": "2026-03-19T09:49:55Z",
  "source": "core-platform",
  "type": "sensor.telemetry",
  "level": "info",
  "trace_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "payload": {
    "temperature_degC": 56.58,
    "vibration_mmps": 2.31
  }
}
```

## Event type taxonomy

Format: `<domain>.<category>`

| Domain      | Categories                                                    |
|-------------|---------------------------------------------------------------|
| `sensor`    | `telemetry`, `threshold_breach`, `calibration`                |
| `camera`    | `inspection`, `defect_detected`, `frame_skip`                 |
| `safety`    | `mode_change`, `alert`, `override`, `recovery`                |
| `humanoid`  | `state_change`, `battery`, `task_update`, `error`             |
| `assembly`  | `phase_change`, `batch_start`, `batch_end`, `reject`          |
| `system`    | `startup`, `shutdown`, `health`, `config_change`              |
| `api`       | `request`, `response`, `auth`, `rate_limit`                   |
| `ml`        | `inference`, `prediction`, `model_load`, `drift`              |

Add new types as needed. Keep the two-level dot structure.

## Severity guidelines

- `debug` — development/troubleshooting only. Never appear in production
  default output.
- `info` — normal operational events (sensor telemetry, mode changes,
  phase transitions).
- `warn` — approaching a threshold (sensor reading near warning level,
  battery low, retry).
- `error` — something failed but the system can continue (failed
  inspection, timeout, model load failure).
- `fatal` — unrecoverable (safety stop, hardware fault, configuration
  error). Triggers controlled shutdown.

## Trace ID propagation

The `trace_id` enables correlating events across services to reconstruct
an incident graph (e.g. "what chain led to this safety stop?").

### Generation

On the first log emission within a logical unit of work (tick, request,
batch, background task), generate a UUID v4 `trace_id` if none exists.
The same `trace_id` must be reused for all subsequent events in that
unit.

```python
# Pseudocode — apply per language
def emit_event(type, level, payload, trace_id=None):
    if trace_id is None:
        trace_id = str(uuid.uuid4())
    log_entry = {
        "timestamp": now_iso(),
        "source": SERVICE_NAME,
        "type": type,
        "level": level,
        "trace_id": trace_id,
        "payload": payload,
    }
    # write to stream
```

### Cross-service propagation

When Service A sends a request to Service B, the `trace_id` must be
included in the transport envelope. If Service B receives a `trace_id`,
it must use it for all events emitted during that request's handling.
If no `trace_id` is received, Service B generates its own (orphan-safe).

Transport-specific propagation:

| Transport     | Mechanism               |
|---------------|-------------------------|
| HTTP          | Header `X-Trace-Id`     |
| Redis Streams | Field in message        |
| File / pipe   | Field in payload JSON   |

### Orphan safety

Code that executes outside a request context (background workers, timers,
crash handlers, startup routines) must generate its own `trace_id`. Every
event chain must have one.

## Storage: Redis Streams

### Stream naming

One stream per emitting service:

```
events:core-platform
events:ai-service
events:ops-api
events:ops-frontend
```

No per-severity fan-out. Consumers filter by `level` in the application
layer. Producers write to exactly one stream. This keeps the write path
simple and ownership explicit.

### Resiliency

- Producers `XADD` to their stream. On failure, buffer to local disk and
  retry. No event is silently dropped.
- Consumers use consumer groups (`XREADGROUP`) with a persistent cursor.
  After a crash, a consumer resumes from its last acknowledged ID —
  at-least-once delivery by design.
- Streams set `MAXLEN ~ 100000` to bound memory usage. Older events are
  trimmed. Archive to object storage if long-term retention is needed.

### Ordering

Events within a single stream are ordered by Redis Stream message ID.
This guarantees causal ordering per service. Cross-service ordering is
not guaranteed — consumers that need global ordering must sort by
`timestamp` client-side.

## Language-specific rules

### C++

Use the `write_event()` pattern from `main.cpp`. Emit one JSON object
per line. Add `timestamp`, `source`, `level`, and `trace_id` to every
emission. Replace raw string concatenation with a structured JSON
builder or `nlohmann/json` if added to the project.

### Python

Use the `logging` module with a custom JSON formatter. Never use bare
`print()`. For service daemons, emit to stderr (captured by container
runtime). For CLI tools, stdout is acceptable.

```python
import logging, json, uuid
logger = logging.getLogger("ai_service")
logger.info({"type": "ml.inference", "level": "info",
             "payload": {"anomaly": 0.3}})
```

### TypeScript

Use a structured logger (pino, winston) configured with the required
JSON schema. No `console.log`. Every HTTP request handler extracts or
generates `trace_id` from the incoming headers.

## What NOT to log

- Secrets, passwords, tokens, certificates, or keys.
- Raw inbound request bodies that may contain PII or secrets.
- Stack traces at `info` or `warn` level. Reserved for `error` and
  `debug`.

## Living update rule

Add new event types and propagation patterns as the system evolves.
Keep every rule specific and testable. When Redis Streams are replaced
or supplemented, update this document before the implementation.
