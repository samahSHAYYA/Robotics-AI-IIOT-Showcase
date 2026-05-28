# Core Platform Service

## Purpose

Modular monolith for core robotics and factory operations logic, implemented
with modern C++ for control-critical behavior.

## Responsibilities

Industrial assembly-line orchestration (infeed, weld, QC phases).
Correlated mock sensor simulation (temperature, vibration, current, torque,
  pressure, humidity, proximity).
Camera-based inspection simulation with defect tags and anomaly scoring.
Safety supervision (`running`, `degraded`, `stopped`) based on alert severity.
Maintenance health scoring and alert generation.
Humanoid thin-slice mission behavior (patrol, inspect alert, dock, safe-hold).
Sensor core behavior:
abstract `Sensor<MeasurementType>` base class
SI-unit canonical storage per concrete sensor type
automatic UTC timestamp at initialization and on every value update
timezone rendering through `zoned_timestamp(...)` (supported: `UTC`, `Z`,
  `+HH`, `+HH:MM`, `-HH`, `-HH:MM`)
optional background mock stream via `startMocking(...)` / `stopMocking()`

## Entrypoint

C++ executable: `core_platform_sim`
Source path: `cpp/src/main.cpp`

## Build and Run

From project root:

```bash
cd src/core-platform/cpp
cmake -S . -B build
cmake --build build
./build/core_platform_sim
```

Optional runtime env vars:

`SIM_RUN_SECONDS` (default: `45`)
`SIM_TICK_MS` (default: `1000`)

## Outputs

Event log: `logs/events.jsonl`
Final snapshot: `data/final_state.json`

## Notes

Control/orchestration logic is C++-first by design.
Sensor representation uses SI as canonical reference with explicit conversion
  methods.
C++ file organization follows:
one `ClassName` per pair of files in `lowercase_with_underscores`:
`include/.../<class_name>.hpp`
`src/<class_name>.cpp`
one umbrella header (`types.hpp`) to gather related class headers and shared
  structs.
Template classes remain implemented in headers by design (C++ visibility
  requirement).
Sensor runtime objects are intentionally non-copyable because they can own
  background worker threads.
Follow project style conventions: no trailing underscore naming, include guards
  (not `#pragma once`), and readable line lengths (prefer <= 120 chars).

## Sensor Timestamp API

`timestampUtc()` returns the sensor update time point in UTC.
`timestampUtcString()` returns ISO format UTC string (`...Z`).
`zonedTimestamp(timezone)` returns ISO format with requested timezone offset.

## Events emitted (Redis Stream `events:core-platform`)

| `type` | When | Payload |
|---|---|---|
| `sensor.telemetry` | Every tick | `temp`, `vib`, `curr`, `torque` |
| `camera.inspection` | Every tick | `camera`, `frame`, `score`, `defect` |
| `safety.mode_change` | Every tick | `mode` (running / degraded / stopped) |

## Key types (C++ structs in `types.hpp`)

`LineState` — aggregate runtime state (line_mode, safety_mode,
  batch_id, station phases, sensors, cameras, conveyor, humanoid,
  metrics, alerts)
`Sensors` — group of seven sensor instances with SI-unit
  conversion helpers
`CameraInspection` — per-camera inspection result (camera ID,
  frame_id, anomaly_score, defect label)
`Humanoid` — robot mission state (mode, task, battery, zone)
`Metrics` — production counters (units_total, units_ok,
  units_defective, health_score)
`Alert` — single alert (source, severity, message)
`WorkObject` — item on conveyor (object_id, model, phase,
  quality)
`ConveyorState` — belt state (mode, speed_mps, current_object_id)

## C++ modules (`cpp/src/` and `cpp/include/`)

`main.cpp` — simulation tick loop, orchestration, event emission
`types.hpp` / `types.cpp` — aggregate structs shared across nodes
`time_utils.hpp` / `time_utils.cpp` — UTC and zoned timestamp
  formatting
`sensor.hpp` — abstract `Sensor<T>` template base class
`temperature_sensor.*` / `vibration_sensor.*` / `current_sensor.*`
  / `torque_sensor.*` / `pressure_sensor.*` / `humidity_sensor.*`
  / `distance_sensor.*` — concrete sensor implementations
`unit.hpp` / `unit.cpp` — SI unit tracking and conversion values
`nodes/` — node classes for assembly line, camera, humanoid,
  maintenance, safety, sensor (pending) 
