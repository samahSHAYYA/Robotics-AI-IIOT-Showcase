# AI Service

## Purpose

AI/ML inference service for operational decision support.

## Responsibilities

Load and serve approved model artifacts.
Run real-time inference on operational signals.
Produce anomaly/risk/quality outputs.
Expose model outputs through stable interfaces.

## Events emitted (Redis Stream `events:ai-service`)

| `type` | When | Payload |
|---|---|---|
| `ml.inference` | On sensor batch | `anomaly_score`, `risk` |
| `ml.prediction` | Scheduled | `prediction`, `horizon`, `version` |
| `ml.model_load` | On model load | `model_name`, `version`, `status` |
| `ml.drift` | When drift detector triggers | `metric`, `delta`, `threshold` |

## Key types (planned)

- `AnomalyReport` — anomaly score, severity, source_sensor, timestamp
- `RiskAssessment` — risk_level, affected_zone, confidence, recommendation
- `ModelMetadata` — model_name, version, hash, provenance, loaded_at

## Python modules (planned)

`app/` — FastAPI application entrypoint
`inference/` — model loading, prediction pipeline, output formatting
`features/` — signal preprocessing, windowing, normalization
`consumers/` — Redis Stream consumer group for events:core-platform

## Entrypoint

...

## Run

...
