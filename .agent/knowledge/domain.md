# Domain Knowledge

## Industrial assembly line

Three stations in sequence:

| Station | Operation | QC check |
|---|---|---|
| `infeed` | Load part onto conveyor | Part presence |
| `weld` | Simulated weld operation | Weld quality |
| `qc` | Camera inspection | Defect detection |

Parts pass through on a conveyor (`WorkObject`). Each part starts at `infeed`,
moves to `weld`, then `qc`. Defective parts are flagged but continue —
rejection is tracked in `Metrics`.

## Sensor suite

Seven sensor types, each with SI-unit canonical storage:

| Sensor | Measurement | SI unit | Operational units |
|---|---|---|---|---|
| Temperature | Heat | degC (K) | degC, degF |
| Vibration | Oscillation | mm/s | mm/s, ips |
| Current | Electrical | A | A, mA |
| Torque | Rotational force | Nm | Nm, lb-ft |
| Pressure | Force/area | Pa | Pa, bar, psi |
| Humidity | Moisture | %RH | %RH |
| Distance | Gap | m | m, mm, cm |

Each sensor implements the abstract `Sensor<MeasurementType>` template with:
- SI-unit canonical storage
- UTC timestamp at init and on every update
- Timezone rendering via `zoned_timestamp(timezone)`
- Optional background mock stream (`startMocking` / `stopMocking`)

## Safety model

Three modes, defined in `safety_node.hpp`:

| Mode | Meaning | Triggers |
|---|---|---|
| `running` | Normal operation | Startup, reset after degraded |
| `degraded` | Non-critical fault | Sensor out of range, queue pressure |
| `stopped` | Safety stop | Emergency stop, guard violation, critical alert |

Transitions: `running` <-> `degraded`, both -> `stopped`.
Only manual reset recovers from `stopped`.

## Humanoid mission states

| Mode | Task | Description |
|---|---|---|
| `idle` | — | Waiting for instruction |
| `active` | `patrol` | Traverse zone waypoints |
| `active` | `inspect` | Investigate alert location |
| `active` | `dock` | Return to charging station |
| `active` | `safe_hold` | Pause in safe position |

Battery depletes in `active` mode, recharges at `dock`.
`safe_hold` triggers on low battery or safety degredation.

## Camera inspection

Simulated camera node produces per-tick inspection results:

```json
{
  "camera": "cam_01",
  "frame_id": 1427,
  "anomaly_score": 0.03,
  "defect": "none"
}
```

Anomaly score ranges 0.0–1.0. Defect labels: `none`, `scratch`, `crack`,
`misalignment`, `contamination`.

## IIoT telemetry pattern

All telemetry follows the same shape: JSON with `timestamp`, `source`, `type`,
`level`, `trace_id`, `payload`. See `.agent/local/logging.md` for the full
schema and event taxonomy.
