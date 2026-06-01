# Implementation Status — Mocked vs Real

## Backend Services

| Service | Endpoint / Feature | Status | Notes |
|---------|-------------------|--------|-------|
| **ops-api** | `/api/v1/telemetry` | **Mock** | Random-walk simulation of robot poses, battery, temperature, status. No real hardware. |
| | `/api/v1/robots` | **Real** | Fleet registry from in-memory store with heartbeat tracking. |
| | `/api/v1/robots/register` | **Real** | Creates robot record with auto-assigned ID. |
| | `/api/v1/robots/{id}/heartbeat` | **Real** | Updates last_seen timestamp, computes online/offline. |
| | `/api/v1/robot/{id}/start` | **Mock** | Flips status in simulation. No real hardware control. |
| | `/api/v1/robot/{id}/stop` | **Mock** | Flips status in simulation. |
| | `/api/v1/robot/{id}/task` | **Mock** | Assigns task string in simulated state. |
| | `/api/v1/robot/{id}/emergency-stop` | **Mock** | Flips to error status in simulation. |
| | `/api/v1/agent/chat` | **Mock** | Returns canned responses unless ai-agent is running with Ollama. |
| | `/api/v1/reports/pdf` | **Real** | Generates PDF via ReportLab from current telemetry. |
| | `/api/v1/webhooks` | **Real** | CRUD for webhook configs with Redis-backed execution. |
| | `/api/v1/audit/log` | **Real** | Stores/filters audit log entries in PostgreSQL. |
| | `/metrics` | **Real** | Prometheus-format metrics (requests, robot count, alerts). |
| | `/health` | **Real** | Aggregated health check across Redis, PostgreSQL, sub-services. |
| | WebSocket `/ws` | **Mock** | Streams simulated telemetry snapshots every 2 seconds. |
| **ai-service** | `/predict` | **Mock** | Returns mock predictions based on weighted random inputs. |
| **ai-agent** | `/api/v1/agent/chat` | **Mock** | Returns template-based responses unless Ollama model is configured. |
| **edge-sim** | `/sensors` | **Mock** | 10 simulated IoT sensors with configurable failure modes. |
| | Redis stream publish | **Mock** | Sensor data published to Redis streams every second. |
| **core-platform** | C++ simulation | **Mock** | Random-walk physics simulation, published to Redis. |

## Frontend Components

| Component | Data Source | Status | Notes |
|-----------|------------|--------|-------|
| DigitalTwinMap | WebSocket telemetry | **Real** (data) | Renders live telemetry stream. Canvas rendering is fully real. |
| KpiBoard | WebSocket telemetry | **Real** (data) | Calculates real KPIs from streamed data. |
| AlertBoard | WebSocket alerts + events | **Real** (data) | Filters and displays alerts from stream. |
| RobotFleet | WebSocket telemetry | **Real** (data) | Shows robot list, status, task, battery from stream. |
| CommandConsole | REST API calls | **Mock** (backend) | Sends commands to mock backend endpoints. |
| ChatPanel | ai-agent REST API | **Mock** (backend) | UI is real; AI responses are template-based. |
| RobotCamera | Canvas rendering | **Mock** (visuals) | Simulated camera feeds (no actual camera hardware). |
| OEEWidget | Telemetry data | **Real** (calculation) | Computes OEE from availability/performance/quality. |
| ProductionLine | Telemetry data | **Mock** (animation) | Animated product flow based on simulated robot states. |
| EnergyWidget | Telemetry data | **Mock** (simulation) | Simulated energy consumption per robot. |
| PredictiveMaintenance | REST API | **Mock** (backend) | RUL calculated from simulated wear factors. |
| SensorGrid | edge-sim REST API | **Mock** (backend) | Reads simulated IoT sensor values. |
| ServiceHealth | REST API | **Real** | Reads real health check endpoints. |
| AuditLog | REST API | **Real** | Reads/writes real PostgreSQL audit log. |
| WebhookManager | REST API | **Real** | CRUD operations on real webhook config. |
| ReconcilePanel | REST API | **Mock** (backend) | State reconciliation with simulated version vectors. |
| SiteManagerPanel | REST API | **Real** | CRUD for multi-factory site configuration. |

## Summary

- **Real**: Fleet registry, webhooks, audit log, service health, PDF reports, Prometheus metrics, site management, health checks.
- **Mock**: Robot simulation, sensor simulation, AI chat responses, predictive maintenance, camera feeds, energy simulation, production line animation.
- **Mixed**: Telemetry stream (real pipeline, mock data), command endpoints (real API, mock execution).
