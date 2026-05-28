# Error Handling Guidelines

## Purpose

Define a consistent error handling strategy across all services so that
failures are detected, classified, communicated, and recovered from in
a predictable way.

## Error taxonomy

Every error in the system must map to one of these classes:

| Class | Severity | Effect | Recovery |
|---|---|---|---|
| `transient` | warn | Local retry; no wider impact | Auto up to N retries |
| `operational` | error | Degraded but running | Auto when condition clears |
| `safety` | fatal | Immediate controlled stop | Requires manual reset |
| `config` | fatal | Startup abort | Manual fix + restart |
| `programming` | error | Bug — unexpected invariant | Developer fix |

- `transient` — network timeouts, resource contention, sensor read glitches.
  Retry with exponential backoff. No alert.
- `operational` — sensor out of range, model load failure, queue pressure.
  Emit `error` event. System degrades but continues.
- `safety` — emergency stop, hardware fault, guard violation. Enter safe state
  immediately. Emit `fatal` event. Lock until manual reset.
- `config` — missing env var, invalid YAML, TLS cert expired. Do not start.
  Emit clear diagnostic to stderr before exit.
- `programming` — null dereference, out-of-bounds, unexpected enum value.
  Assert or crash early. Never hide these.

## Per-language patterns

### C++

Use `std::expected<T, E>` for fallible operations that are not exceptional.
Reserve exceptions for truly unexpected conditions (programming errors,
out-of-memory). Never throw in safety-critical tick paths:

```cpp
// Preferred: fallible operation returns expected
auto result = sensor_read(temperature_sensor);
if (!result) {
    emit_event("sensor.telemetry", "error",
               {{"sensor", "temperature"}, {"error", result.error()}});
    return std::nullopt;
}
```

For safety-critical paths, use a dedicated error enum:

```cpp
enum class SafetyError {
    kNone,
    kEmergencyStop,
    kGuardViolation,
    kCommunicationLoss,
    kSensorFault
};
```

Check safety errors every tick. On any non-`kNone`, transition to `stopped`
state and emit `safety.alert` immediately.

Assertions use `assert()` in debug builds. For production checks that must
never be compiled out, use a project-local `REQUIRE()` macro that logs and
calls `std::terminate`:

```cpp
#define REQUIRE(cond, msg) \
    do { \
        if (!(cond)) { \
            emit_event("system.fatal", "fatal", {{"message", msg}}); \
            std::terminate(); \
        } \
    } while (false)
```

### Python

Raise specific exception types. Never raise or catch bare `Exception`. Define
project exception hierarchy:

```python
class ProjectError(Exception): ...
class TransientError(ProjectError): ...
class OperationalError(ProjectError): ...
class SafetyError(ProjectError): ...
class ConfigError(ProjectError): ...
```

Use `try` / `except` / `else` for import guards and resource checks. Use
`try` / `except` / `finally` for cleanup. Prefer `match` on error types when
handling multiple specific exceptions:

```python
match exception:
    case TransientError():
        retry_with_backoff(op)
    case ConfigError():
        logger.fatal(...)
        sys.exit(1)
    case _:
        raise  # re-raise unexpected
```

### TypeScript

Throw `Error` subclasses. Define typed error classes:

```typescript
class TransientError extends Error {}
class OperationalError extends Error {}
class ConfigError extends Error {}
```

Never catch with `any`. Type-narrow in catch blocks:

```typescript
try {
    await fetchData();
} catch (e) {
    if (e instanceof TransientError) {
        return retry(fetchData);
    }
    if (e instanceof OperationalError) {
        showDegradedBanner(e.message);
        return fallback;
    }
    throw e;
}
```

## Service boundary propagation

When an error crosses a service boundary (stream event, HTTP response, gRPC
call), include:

- `error.type` — the error class (`transient`, `operational`, `safety`,
  `config`, `programming`)
- `error.code` — machine-readable string (e.g. `sensor_timeout`,
  `model_load_fail`)
- `error.message` — human-readable description
- `trace_id` — for correlation across services

HTTP responses use standard status codes:

| Error class | HTTP status |
|---|---|
| `transient` | 503 Service Unavailable |
| `operational` | 200 + `degraded: true` in body |
| `safety` | 503 Service Unavailable |
| `config` | 500 Internal Server Error |
| `programming` | 500 Internal Server Error |

## Retry policy

| Class | Max retries | Backoff | Jitter |
|---|---|---|---|
| `transient` | 3 | exponential (100 ms × 2^n) | ±25% |
| `operational` | 0 | — | — |
| `safety` | 0 | — | — |
| `config` | 0 | — | — |

After exhausting retries, escalate the error class to `operational` and
continue in degraded mode.

## Graceful degradation

Each service must define a degraded mode of operation:

| Service | Degraded behavior |
|---|---|
| `core-platform` | Skip camera inspection, use last known safe action |
| `ai-service` | Return cached prediction, emit model_stale warning |
| `ops-api` | Serve stale snapshot, reject command endpoints |
| `ops-frontend` | Show stale data with "delayed" indicator, disable controls |

Degraded mode must be explicit in Redis Stream payloads (`"degraded": true`)
so downstream consumers can react.

## Recovery and restart

- `transient` errors recover automatically within the retry policy.
- `operational` errors recover when the condition clears (sensor back in
  range, queue drains). The service emits a `system.health` event with
  `"status": "ok"` on recovery.
- `safety` errors require manual operator reset via the ops-api
  `/api/command` endpoint with `{"action": "reset_safety"}`. The safety system
  rejects reset until all hazards are cleared.
- `config` errors require a code or deployment change. The container exits;
  orchestrator restarts only after fix.
- `programming` errors require a bug fix. Crash dumps should be captured for
  post-mortem.

## Logging errors

All errors must be logged using the structured logging contract
(`.agent/local/logging.md`). Additional rules:

- Every error log must include `error.class` and `error.code` in the
  `payload`.
- `transient` errors log at `warn`.
- `operational` errors log at `error`.
- `safety` errors log at `fatal`.
- `config` errors log at `fatal` before exit.
- Stack traces must only appear at `error` or `debug` level.

## Living update rule

Add new error classes and patterns as the system evolves. When a new service
or integration introduces a different failure mode, update this document
before implementation.
